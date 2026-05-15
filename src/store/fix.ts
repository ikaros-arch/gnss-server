import type { GgaFix } from "../nmea/parseGGA.js";
import type { GstAccuracy } from "../nmea/parseGST.js";
import type { ECEF } from "../geodesy/wgs84.js";
import type { ProjectedXY } from "../geodesy/proj.js";

export interface Fix {
  antennaId: string;
  receivedAt: string;        // ISO timestamp the server stamped on receipt
  utc: string;               // hhmmss(.sss) from GGA
  llh: { lat: number; lon: number; altMsl: number; geoidSep: number; altEll: number };
  xyz: ECEF;                 // ECEF metres (derived)
  utm: ProjectedXY & { crs: string };  // projected easting/northing in OUTPUT_CRS
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
  };
  conn: {
    remoteIp: string;
    remotePort: number;
    since: string;
    lastByteAt: string;
  };
}
