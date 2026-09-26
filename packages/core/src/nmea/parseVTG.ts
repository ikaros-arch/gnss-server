import { verifyChecksum } from "./checksum.js";

export interface VtgData {
  courseTrueNorth: number;  // degrees
  speedKnots: number;
  speedKmh: number;
}

/**
 * Parse a VTG sentence (course and speed over ground).
 * $GPVTG,054.7,T,034.4,M,005.5,N,010.2,K,A*27
 * Fields: courseTrueNorth, T, courseMagnetic, M, speedKnots, N, speedKmh, K, [mode]
 * Returns null if checksum fails or speed is not available.
 */
export function parseVTG(sentence: string): VtgData | null {
  const body = verifyChecksum(sentence);
  if (!body) return null;
  const f = body.split(",");
  if (!/VTG$/.test(f[0])) return null;
  // f[9] is the FAA mode indicator (NMEA 2.3+): N = not valid
  if (f[9] === "N") return null;
  const courseTrueNorth = parseFloat(f[1] ?? "0") || 0;
  const speedKnots = parseFloat(f[5] ?? "0") || 0;
  const speedKmh = parseFloat(f[7] ?? "0") || 0;
  if (!Number.isFinite(speedKnots) || !Number.isFinite(speedKmh)) return null;
  return { courseTrueNorth, speedKnots, speedKmh };
}
