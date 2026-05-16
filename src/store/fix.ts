import type { GgaFix } from "../nmea/parseGGA.js";
import type { ECEF, SigmaEcef } from "../geodesy/wgs84.js";
import type { ProjectedXY } from "../geodesy/proj.js";

export interface Fix {
  antennaId: string;
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
  };
  conn: {
    remoteIp: string;
    remotePort: number;
    since: string;
    lastByteAt: string;
  };
}
