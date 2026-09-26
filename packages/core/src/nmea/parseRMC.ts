import { verifyChecksum } from "./checksum.js";

export interface RmcData {
  utc: string;       // hhmmss(.sss)
  date: string;      // ddmmyy
  isoDate: string;   // YYYY-MM-DD derived from ddmmyy (2000-range assumed)
  lat: number;
  lon: number;
  speedKnots: number;
  courseDeg: number;
}

function nmeaCoordToDeg(value: string, hemi: string): number {
  if (!value) return NaN;
  const dot = value.indexOf(".");
  const intPart = dot >= 0 ? value.slice(0, dot) : value;
  const degLen = Math.max(intPart.length - 2, 0);
  const deg = parseFloat(value.slice(0, degLen) || "0");
  const min = parseFloat(value.slice(degLen));
  let dec = deg + min / 60;
  if (hemi === "S" || hemi === "W") dec = -dec;
  return dec;
}

/**
 * Parse an RMC sentence (recommended minimum data).
 * $GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A
 * Returns null if the status field is 'V' (void / no fix) or checksum fails.
 */
export function parseRMC(sentence: string): RmcData | null {
  const body = verifyChecksum(sentence);
  if (!body) return null;
  const f = body.split(",");
  if (!/RMC$/.test(f[0])) return null;
  if (f[2] !== "A") return null; // void fix
  const lat = nmeaCoordToDeg(f[3], f[4]);
  const lon = nmeaCoordToDeg(f[5], f[6]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const date = f[9] ?? "";
  const day   = date.slice(0, 2);
  const month = date.slice(2, 4);
  const yr    = parseInt(date.slice(4, 6), 10);
  const year  = yr >= 0 ? (yr >= 80 ? 1900 + yr : 2000 + yr) : 2000;
  return {
    utc: f[1] ?? "",
    date,
    isoDate: `${year}-${month}-${day}`,
    lat,
    lon,
    speedKnots: parseFloat(f[7] ?? "0") || 0,
    courseDeg:  parseFloat(f[8] ?? "0") || 0,
  };
}
