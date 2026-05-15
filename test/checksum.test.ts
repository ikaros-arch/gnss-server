import { describe, it, expect } from "vitest";
import { verifyChecksum } from "../src/nmea/checksum.js";

describe("verifyChecksum", () => {
  it("accepts a valid GGA sentence", () => {
    const s = "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47";
    expect(verifyChecksum(s)).toMatch(/^GPGGA,/);
  });

  it("rejects a tampered checksum", () => {
    const s = "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*48";
    expect(verifyChecksum(s)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyChecksum("garbage")).toBeNull();
    expect(verifyChecksum("$NO_STAR")).toBeNull();
  });
});
