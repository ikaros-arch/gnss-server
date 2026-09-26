import type { GgaFix } from "./nmea/parseGGA.js";
import type { ECEF, SigmaEcef } from "./geodesy/wgs84.js";
import type { ProjectedXY } from "./geodesy/proj.js";

/**
 * One normalised position from one antenna. This is the wire schema gnss-server
 * streams over WebSocket/REST (see docs/FRONTEND_INTEGRATION.md) and what a
 * client-side FixAssembler produces from a BLE/TCP receiver, so the two paths
 * are interchangeable for consumers. Every field is present unless optional.
 */
export interface Fix {
  antennaId: string;
  label?: string;            // human-readable label from antennas.json
  receivedAt: string;        // ISO timestamp the server stamped on receipt
  utc: string;               // hhmmss(.sss) from GGA
  utcDate?: string;          // YYYY-MM-DD from RMC (absent until first RMC received)
  llh: { lat: number; lon: number; altMsl: number; geoidSep: number; altEll: number };
  xyz: ECEF & Partial<SigmaEcef>;
  utm: ProjectedXY & { crs: string; sigmaE?: number; sigmaN?: number };
  accuracy: {
    source: "GST" | "ESTIMATED";
    sigmaLat?: number;
    sigmaLon?: number;
    sigmaAlt?: number;
  };
  fix: {
    quality: number;
    status: GgaFix["status"];
    satellites: number;
    hdop: number;
    vdop?: number;
    pdop?: number;
    diffAge?: number;      // seconds since last RTCM correction; absent for autonomous fixes
    refStationId?: string; // base station identifier from the receiver
  };
  velocity?: {
    courseTrue: number;   // degrees from true north
    speedKnots: number;
    speedKmh: number;
  };
  /**
   * Where the sentences came from. TCP fills remoteIp/remotePort literally;
   * other transports (BLE, serial) put a device identifier in remoteIp and 0
   * in remotePort so the shape stays identical for consumers.
   */
  conn: {
    remoteIp: string;
    remotePort: number;
    since: string;
    lastByteAt: string;
  };
}
