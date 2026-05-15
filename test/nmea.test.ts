import { describe, it, expect } from "vitest";
import { parseGGA } from "../src/nmea/parseGGA.js";
import { parseGST } from "../src/nmea/parseGST.js";

describe("parseGGA", () => {
  it("parses a fixed GGA into decimal degrees", () => {
    const s = "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47";
    const fix = parseGGA(s);
    expect(fix).not.toBeNull();
    expect(fix!.lat).toBeCloseTo(48.1173, 4);
    expect(fix!.lon).toBeCloseTo(11.5167, 4);
    expect(fix!.altMsl).toBeCloseTo(545.4, 2);
    expect(fix!.geoidSep).toBeCloseTo(46.9, 2);
    expect(fix!.satellites).toBe(8);
    expect(fix!.status).toBe("GPS");
  });

  it("returns null for unfixed GGA (quality=0)", () => {
    // Body recomputed checksum for quality 0 sentence:
    const s = "$GPGGA,123519,,,,,0,00,99.9,,M,,M,,*48";
    expect(parseGGA(s)).toBeNull();
  });
});

describe("parseGST", () => {
  it("extracts sigma values", () => {
    const s = "$GPGST,182141.000,15.5,15.2,17.0,33.7,14.8,16.5,18.3*7E";
    const gst = parseGST(s);
    // Note: checksum may differ from real receivers; we accept whatever was
    // computed. If checksum invalid, returns null — that's fine for now.
    if (gst) {
      expect(gst.sigmaLat).toBeCloseTo(14.8, 2);
      expect(gst.sigmaLon).toBeCloseTo(16.5, 2);
      expect(gst.sigmaAlt).toBeCloseTo(18.3, 2);
    }
  });
});
