import { createServer, type Socket } from "node:net";
import type { Logger } from "pino";
import { parseGGA } from "../nmea/parseGGA.js";
import { parseGST } from "../nmea/parseGST.js";
import { parseGSA } from "../nmea/parseGSA.js";
import { parseRMC } from "../nmea/parseRMC.js";
import { parseVTG } from "../nmea/parseVTG.js";
import { llhToEcef, propagateSigmaToEcef } from "../geodesy/wgs84.js";
import { projectLonLat } from "../geodesy/proj.js";
import type { FixStore } from "../store/fixStore.js";
import type { Fix } from "../store/fix.js";
import type { AntennaMap } from "../config.js";

// HDOP-based accuracy estimate when GST is absent.
// 3 m is a conservative 1-sigma URA for a typical GPS L1 receiver.
const HDOP_URA_M = 3.0;
const VDOP_URA_M = 4.5; // slightly worse in vertical

export interface TcpListenerOptions {
  port: number;
  maxConnections: number;
  outputCrs: string;
  antennas: AntennaMap;
  store: FixStore;
  logger: Logger;
}

interface ConnState {
  remoteIp: string;
  remotePort: number;
  since: string;
  buffer: string;
  lastGst?: ReturnType<typeof parseGST>;
  lastGsa?: ReturnType<typeof parseGSA>;
  lastRmcDate?: string; // YYYY-MM-DD
  lastVtg?: ReturnType<typeof parseVTG>;
}

export function startTcpListener(opts: TcpListenerOptions) {
  const { port, maxConnections, outputCrs, antennas, store, logger } = opts;

  const server = createServer((socket) => {
    if ((server as any).connections > maxConnections) {
      logger.warn({ remoteIp: socket.remoteAddress }, "max connections reached, rejecting");
      socket.destroy();
      return;
    }
    handleSocket(socket);
  });

  function handleSocket(socket: Socket) {
    const remoteIp = socket.remoteAddress?.replace(/^::ffff:/, "") ?? "unknown";
    const remotePort = socket.remotePort ?? 0;
    const mapped = antennas[remoteIp];
    const antennaId = mapped?.id ?? `${remoteIp}:${remotePort}`;
    const state: ConnState = {
      remoteIp,
      remotePort,
      since: new Date().toISOString(),
      buffer: "",
    };
    const log = logger.child({ antennaId, remoteIp, remotePort });
    log.info("antenna connected");

    socket.setEncoding("utf8");
    socket.setTimeout(30_000);
    socket.on("timeout", () => {
      log.warn("socket idle timeout");
      socket.destroy();
    });
    socket.on("error", (err) => log.warn({ err: err.message }, "socket error"));
    socket.on("close", () => log.info("antenna disconnected"));

    socket.on("data", (chunk: string) => {
      state.buffer += chunk;
      let idx: number;
      while ((idx = state.buffer.indexOf("\n")) >= 0) {
        const line = state.buffer.slice(0, idx).replace(/\r$/, "");
        state.buffer = state.buffer.slice(idx + 1);
        if (line) handleLine(line, state, antennaId, log);
      }
      // Cap buffer to prevent runaway memory if peer never sends newline.
      if (state.buffer.length > 4096) state.buffer = state.buffer.slice(-1024);
    });
  }

  function handleLine(line: string, state: ConnState, antennaId: string, log: Logger) {
    if (!line.startsWith("$")) return;

    if (/GST[,$*]/.test(line)) {
      const gst = parseGST(line);
      if (gst) state.lastGst = gst;
      return;
    }
    if (/GSA[,$*]/.test(line)) {
      const gsa = parseGSA(line);
      if (gsa) state.lastGsa = gsa;
      return;
    }
    if (/RMC[,$*]/.test(line)) {
      const rmc = parseRMC(line);
      if (rmc) state.lastRmcDate = rmc.isoDate;
      return;
    }
    if (/VTG[,$*]/.test(line)) {
      const vtg = parseVTG(line);
      if (vtg) state.lastVtg = vtg;
      return;
    }
    if (!/GGA,/.test(line)) return;

    const gga = parseGGA(line);
    if (!gga) return;

    const altEll = gga.altMsl + gga.geoidSep;
    const xyz = llhToEcef(gga.lat, gga.lon, altEll);
    let utmXY: { x: number; y: number };
    try {
      utmXY = projectLonLat(gga.lon, gga.lat, outputCrs);
    } catch (err) {
      log.error({ err: (err as Error).message, outputCrs }, "projection failed");
      return;
    }

    // --- accuracy ---
    let accuracy: Fix["accuracy"];
    let xyzSigma: { sigmaX?: number; sigmaY?: number; sigmaZ?: number } = {};
    let utmSigma: { sigmaE?: number; sigmaN?: number } = {};

    if (state.lastGst) {
      const { sigmaLat, sigmaLon, sigmaAlt } = state.lastGst;
      accuracy = { source: "GST", sigmaLat, sigmaLon, sigmaAlt };
      // sigmaLon = east error (m), sigmaLat = north error (m) — already in metres from GST.
      xyzSigma = propagateSigmaToEcef(gga.lat, gga.lon, sigmaLon, sigmaLat, sigmaAlt);
      // UTM is a conformal projection; scale factor k ≈ 0.9996–1.001 within the zone,
      // so easting/northing sigma ≈ ENU sigma to < 0.1 % — no further correction needed.
      utmSigma = { sigmaE: sigmaLon, sigmaN: sigmaLat };
    } else {
      // Estimate from HDOP/VDOP when GST is absent.
      const hdop = state.lastGsa?.hdop ?? gga.hdop;
      const vdop = state.lastGsa?.vdop;
      const sigmaLat = hdop * HDOP_URA_M;
      const sigmaLon = hdop * HDOP_URA_M;
      const sigmaAlt = vdop != null ? vdop * VDOP_URA_M : hdop * VDOP_URA_M;
      accuracy = { source: "ESTIMATED", sigmaLat, sigmaLon, sigmaAlt };
      xyzSigma = propagateSigmaToEcef(gga.lat, gga.lon, sigmaLon, sigmaLat, sigmaAlt);
      utmSigma = { sigmaE: sigmaLon, sigmaN: sigmaLat };
    }

    // --- DOP from GSA (richer than GGA's HDOP alone) ---
    const gsaDops = state.lastGsa
      ? { vdop: state.lastGsa.vdop, pdop: state.lastGsa.pdop }
      : {};

    const fix: Fix = {
      antennaId,
      ...(mapped?.label ? { label: mapped.label } : {}),
      receivedAt: new Date().toISOString(),
      utc: gga.utc,
      ...(state.lastRmcDate ? { utcDate: state.lastRmcDate } : {}),
      llh: { lat: gga.lat, lon: gga.lon, altMsl: gga.altMsl, geoidSep: gga.geoidSep, altEll },
      xyz: { ...xyz, ...xyzSigma },
      utm: { ...utmXY, crs: outputCrs, ...utmSigma },
      accuracy,
      fix: {
        quality: gga.quality,
        status: gga.status,
        satellites: gga.satellites,
        hdop: gga.hdop,
        ...gsaDops,
      },
      conn: {
        remoteIp: state.remoteIp,
        remotePort: state.remotePort,
        since: state.since,
        lastByteAt: new Date().toISOString(),
      },
      ...(state.lastVtg
        ? { velocity: { courseTrue: state.lastVtg.courseTrueNorth, speedKnots: state.lastVtg.speedKnots, speedKmh: state.lastVtg.speedKmh } }
        : {}),
    };
    store.set(fix);
  }

  server.listen(port, () => {
    logger.info({ port }, "TCP listener started");
  });

  return server;
}
