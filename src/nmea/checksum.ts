/**
 * Validate and strip an NMEA-0183 sentence's checksum.
 * Accepts a single sentence string (with or without trailing CRLF), e.g.:
 *   "$GPGGA,...,*47"
 * Returns the body between '$' and '*' if the checksum matches, else null.
 */
export function verifyChecksum(sentence: string): string | null {
  const trimmed = sentence.trim();
  if (!trimmed.startsWith("$")) return null;
  const star = trimmed.lastIndexOf("*");
  if (star < 0 || star + 3 > trimmed.length) return null;
  const body = trimmed.slice(1, star);
  const expected = trimmed.slice(star + 1, star + 3).toUpperCase();
  let cs = 0;
  for (let i = 0; i < body.length; i++) cs ^= body.charCodeAt(i);
  const actual = cs.toString(16).toUpperCase().padStart(2, "0");
  return actual === expected ? body : null;
}
