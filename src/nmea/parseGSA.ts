import { verifyChecksum } from "./checksum.js";

export interface GsaData {
  mode: "M" | "A";      // Manual / Automatic
  fixType: 1 | 2 | 3;   // 1=none, 2=2D, 3=3D
  svs: number[];         // PRN/slot numbers of satellites used (up to 12)
  pdop: number;
  hdop: number;
  vdop: number;
}

/**
 * Parse a GSA sentence (active satellites + DOP values).
 * $GPGSA,A,3,04,05,09,12,,,,,,,,,3.6,2.1,2.2*38
 */
export function parseGSA(sentence: string): GsaData | null {
  const body = verifyChecksum(sentence);
  if (!body) return null;
  const f = body.split(",");
  if (!/GSA$/.test(f[0])) return null;
  const fixType = parseInt(f[2] ?? "1", 10);
  if (fixType < 2) return null; // no fix
  const svs: number[] = [];
  for (let i = 3; i <= 14; i++) {
    const n = parseInt(f[i] ?? "", 10);
    if (Number.isFinite(n) && n > 0) svs.push(n);
  }
  const pdop = parseFloat(f[15] ?? "0") || 0;
  const hdop = parseFloat(f[16] ?? "0") || 0;
  const vdop = parseFloat(f[17] ?? "0") || 0;
  return {
    mode: f[1] === "M" ? "M" : "A",
    fixType: fixType as 1 | 2 | 3,
    svs,
    pdop,
    hdop,
    vdop,
  };
}
