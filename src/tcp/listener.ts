import { createServer, type Socket } from "node:net";
import type { Logger } from "pino";
import { parseGGA } from "../nmea/parseGGA.js";
import { parseGST } from "../nmea/parseGST.js";
import { llhToEcef } from "../geodesy/wgs84.js";
import { projectLonLat } from "../geodesy/proj.js";
import type { FixStore } from "../store/fixStore.js";
import type { Fix } from "../store/fix.js";
import type { AntennaMap } from "../config.js";

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
    if (/GST\*/.test(line) || /GST,/.test(line)) {
      const gst = parseGST(line);
      if (gst) state.lastGst = gst;
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

    const fix: Fix = {
      antennaId,
      receivedAt: new Date().toISOString(),
      utc: gga.utc,
      llh: { lat: gga.lat, lon: gga.lon, altMsl: gga.altMsl, geoidSep: gga.geoidSep, altEll },
      xyz,
      utm: { ...utmXY, crs: outputCrs },
      accuracy: state.lastGst
        ? {
            source: "GST",
            sigmaLat: state.lastGst.sigmaLat,
            sigmaLon: state.lastGst.sigmaLon,
            sigmaAlt: state.lastGst.sigmaAlt,
          }
        : { source: "ESTIMATED" },
      fix: {
        quality: gga.quality,
        status: gga.status,
        satellites: gga.satellites,
        hdop: gga.hdop,
      },
      conn: {
        remoteIp: state.remoteIp,
        remotePort: state.remotePort,
        since: state.since,
        lastByteAt: new Date().toISOString(),
      },
    };
    store.set(fix);
  }

  server.listen(port, () => {
    logger.info({ port }, "TCP listener started");
  });

  return server;
}
