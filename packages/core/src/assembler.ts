import { parseGGA } from "./nmea/parseGGA.js";
import { parseGST, type GstAccuracy } from "./nmea/parseGST.js";
import { parseGSA, type GsaData } from "./nmea/parseGSA.js";
import { parseRMC } from "./nmea/parseRMC.js";
import { parseVTG, type VtgData } from "./nmea/parseVTG.js";
import { llhToEcef, propagateSigmaToEcef } from "./geodesy/wgs84.js";
import { projectLonLat } from "./geodesy/proj.js";
import type { Fix } from "./fix.js";

// HDOP-based accuracy estimate when GST is absent.
// 3 m is a conservative 1-sigma URA for a typical GPS L1 receiver.
const HDOP_URA_M = 3.0;
const VDOP_URA_M = 4.5; // slightly worse in vertical

export interface FixAssemblerOptions {
  /** Stable key for this receiver — antennas.json id, "ip:port", BLE device id… */
  antennaId: string;
  label?: string;
  /** Target CRS for `fix.utm`, e.g. "EPSG:32635". Must be registered with proj4. */
  outputCrs: string;
  /** Endpoint identity copied into `fix.conn`. Defaults to an unknown TCP-less source. */
  transport?: { remoteIp: string; remotePort: number };
  /** Clock, injectable for tests. */
  now?: () => Date;
}

/**
 * Turns a stream of NMEA sentences from ONE receiver into `Fix` objects.
 *
 * Feed complete sentences (no CR/LF) one at a time. GST/GSA/RMC/VTG are remembered
 * and folded into the next GGA, which is the sentence that yields a Fix. Everything
 * else returns null. Pure: no I/O, no logging — the caller owns both. Throws only
 * if projection to `outputCrs` fails (unregistered CRS), so callers can log it.
 */
export class FixAssembler {
  private readonly antennaId: string;
  private readonly label?: string;
  private readonly outputCrs: string;
  private readonly transport: { remoteIp: string; remotePort: number };
  private readonly now: () => Date;
  private readonly since: string;

  private lastGst?: GstAccuracy;
  private lastGsa?: GsaData;
  private lastRmcDate?: string; // YYYY-MM-DD
  private lastVtg?: VtgData;

  constructor(opts: FixAssemblerOptions) {
    this.antennaId = opts.antennaId;
    this.label = opts.label;
    this.outputCrs = opts.outputCrs;
    this.transport = opts.transport ?? { remoteIp: "unknown", remotePort: 0 };
    this.now = opts.now ?? (() => new Date());
    this.since = this.now().toISOString();
  }

  /** Forget the auxiliary sentences (after a reconnect, say). */
  reset(): void {
    this.lastGst = undefined;
    this.lastGsa = undefined;
    this.lastRmcDate = undefined;
    this.lastVtg = undefined;
  }

  feed(line: string): Fix | null {
    if (!line.startsWith("$")) return null;

    if (/GST[,$*]/.test(line)) {
      const gst = parseGST(line);
      if (gst) this.lastGst = gst;
      return null;
    }
    if (/GSA[,$*]/.test(line)) {
      const gsa = parseGSA(line);
      if (gsa) this.lastGsa = gsa;
      return null;
    }
    if (/RMC[,$*]/.test(line)) {
      const rmc = parseRMC(line);
      if (rmc) this.lastRmcDate = rmc.isoDate;
      return null;
    }
    if (/VTG[,$*]/.test(line)) {
      const vtg = parseVTG(line);
      if (vtg) this.lastVtg = vtg;
      return null;
    }
    if (!/GGA,/.test(line)) return null;

    const gga = parseGGA(line);
    if (!gga) return null;

    const altEll = gga.altMsl + gga.geoidSep;
    const xyz = llhToEcef(gga.lat, gga.lon, altEll);
    const utmXY = projectLonLat(gga.lon, gga.lat, this.outputCrs);

    let accuracy: Fix["accuracy"];
    let sigmaLat: number | undefined;
    let sigmaLon: number | undefined;
    let sigmaAlt: number | undefined;

    if (this.lastGst) {
      ({ sigmaLat, sigmaLon, sigmaAlt } = this.lastGst);
      accuracy = { source: "GST", sigmaLat, sigmaLon, sigmaAlt };
    } else {
      // Estimate from HDOP/VDOP when GST is absent.
      const hdop = this.lastGsa?.hdop ?? gga.hdop;
      const vdop = this.lastGsa?.vdop;
      sigmaLat = hdop * HDOP_URA_M;
      sigmaLon = hdop * HDOP_URA_M;
      sigmaAlt = vdop != null ? vdop * VDOP_URA_M : hdop * VDOP_URA_M;
      accuracy = { source: "ESTIMATED", sigmaLat, sigmaLon, sigmaAlt };
    }
    // sigmaLon = east, sigmaLat = north, already metres. UTM is conformal with
    // k ≈ 0.9996–1.001 inside the zone, so E/N sigma ≈ ENU sigma to < 0.1 %.
    const xyzSigma = propagateSigmaToEcef(gga.lat, gga.lon, sigmaLon, sigmaLat, sigmaAlt);
    const utmSigma = { sigmaE: sigmaLon, sigmaN: sigmaLat };

    const gsaDops = this.lastGsa ? { vdop: this.lastGsa.vdop, pdop: this.lastGsa.pdop } : {};
    const nowIso = this.now().toISOString();

    return {
      antennaId: this.antennaId,
      ...(this.label ? { label: this.label } : {}),
      receivedAt: nowIso,
      utc: gga.utc,
      ...(this.lastRmcDate ? { utcDate: this.lastRmcDate } : {}),
      llh: { lat: gga.lat, lon: gga.lon, altMsl: gga.altMsl, geoidSep: gga.geoidSep, altEll },
      xyz: { ...xyz, ...xyzSigma },
      utm: { ...utmXY, crs: this.outputCrs, ...utmSigma },
      accuracy,
      fix: {
        quality: gga.quality,
        status: gga.status,
        satellites: gga.satellites,
        hdop: gga.hdop,
        ...gsaDops,
        ...(gga.diffAge != null ? { diffAge: gga.diffAge } : {}),
        ...(gga.refStationId ? { refStationId: gga.refStationId } : {}),
      },
      conn: {
        remoteIp: this.transport.remoteIp,
        remotePort: this.transport.remotePort,
        since: this.since,
        lastByteAt: nowIso,
      },
      ...(this.lastVtg
        ? {
            velocity: {
              courseTrue: this.lastVtg.courseTrueNorth,
              speedKnots: this.lastVtg.speedKnots,
              speedKmh: this.lastVtg.speedKmh,
            },
          }
        : {}),
    };
  }
}

/** Default cap on a single buffered line; a peer that never sends "\n" is not NMEA. */
export const DEFAULT_MAX_LINE_BYTES = 2048;

/**
 * Reassembles complete lines from arbitrary chunks (TCP segments, BLE
 * notifications, serial reads). Returns each finished line without its CR/LF,
 * skipping empty ones. If the pending buffer grows past `maxLineBytes` without a
 * newline it is discarded and `onOverflow` is told how much was dropped.
 */
export class LineSplitter {
  private buffer = "";

  constructor(
    private readonly maxLineBytes: number = DEFAULT_MAX_LINE_BYTES,
    private readonly onOverflow?: (droppedLength: number) => void,
  ) {}

  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, "");
      this.buffer = this.buffer.slice(idx + 1);
      if (line) lines.push(line);
    }
    if (this.buffer.length > this.maxLineBytes) {
      this.onOverflow?.(this.buffer.length);
      this.buffer = "";
    }
    return lines;
  }
}
