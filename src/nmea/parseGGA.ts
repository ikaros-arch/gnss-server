import { verifyChecksum } from "./checksum.js";

export type FixQuality =
  | "NONE"
  | "GPS"
  | "DGPS"
  | "PPS"
  | "RTK_FIXED"
  | "RTK_FLOAT"
  | "ESTIMATED"
  | "MANUAL"
  | "SIMULATION"
  | "UNKNOWN";

const QUALITY_MAP: Record<number, FixQuality> = {
  0: "NONE",
  1: "GPS",
  2: "DGPS",
  3: "PPS",
  4: "RTK_FIXED",
  5: "RTK_FLOAT",
  6: "ESTIMATED",
  7: "MANUAL",
  8: "SIMULATION",
};

export interface GgaFix {
  utc: string;          // hhmmss(.sss)
  lat: number;          // signed decimal degrees
  lon: number;          // signed decimal degrees
  quality: number;      // raw GGA quality int
  status: FixQuality;
  satellites: number;
  hdop: number;
  altMsl: number;       // metres
  geoidSep: number;     // metres (ellipsoidal = altMsl + geoidSep)
}

function nmeaCoordToDeg(value: string, hemi: string): number {
  if (!value) return NaN;
  // ddmm.mmmm or dddmm.mmmm — degrees are everything before the last 2 digits of the integer part.
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
 * Parse a GGA sentence (with checksum). Returns null if invalid or unfixed.
 * Example:
 *   $GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47
 */
export function parseGGA(sentence: string): GgaFix | null {
  const body = verifyChecksum(sentence);
  if (!body) return null;
  const f = body.split(",");
  // f[0] = talker+type, e.g. "GPGGA" or "GNGGA"
  if (!/GGA$/.test(f[0])) return null;
  const quality = parseInt(f[6] ?? "0", 10);
  if (!Number.isFinite(quality) || quality === 0) return null;

  const lat = nmeaCoordToDeg(f[2], f[3]);
  const lon = nmeaCoordToDeg(f[4], f[5]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    utc: f[1] ?? "",
    lat,
    lon,
    quality,
    status: QUALITY_MAP[quality] ?? "UNKNOWN",
    satellites: parseInt(f[7] ?? "0", 10) || 0,
    hdop: parseFloat(f[8] ?? "0") || 0,
    altMsl: parseFloat(f[9] ?? "0") || 0,
    geoidSep: parseFloat(f[11] ?? "0") || 0,
  };
}
