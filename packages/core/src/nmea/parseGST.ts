import { verifyChecksum } from "./checksum.js";

export interface GstAccuracy {
  utc: string;
  sigmaLat: number; // metres (1-sigma)
  sigmaLon: number;
  sigmaAlt: number;
}

/**
 * Parse a GST sentence (position error statistics).
 * $GPGST,utc,rmsRange,semiMaj,semiMin,orient,sigmaLat,sigmaLon,sigmaAlt*cs
 */
export function parseGST(sentence: string): GstAccuracy | null {
  const body = verifyChecksum(sentence);
  if (!body) return null;
  const f = body.split(",");
  if (!/GST$/.test(f[0])) return null;
  const sigmaLat = parseFloat(f[6]);
  const sigmaLon = parseFloat(f[7]);
  const sigmaAlt = parseFloat(f[8]);
  if (![sigmaLat, sigmaLon, sigmaAlt].every(Number.isFinite)) return null;
  return { utc: f[1] ?? "", sigmaLat, sigmaLon, sigmaAlt };
}
