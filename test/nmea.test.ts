import { describe, it, expect } from "vitest";
import { parseGGA } from "../src/nmea/parseGGA.js";
import { parseGST } from "../src/nmea/parseGST.js";
import { parseGSA } from "../src/nmea/parseGSA.js";
import { parseRMC } from "../src/nmea/parseRMC.js";

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
    const s = "$GPGGA,123519,,,,,0,00,99.9,,M,,M,,*48";
    expect(parseGGA(s)).toBeNull();
  });
});

describe("parseGST", () => {
  it("extracts sigma values", () => {
    const s = "$GPGST,182141.000,15.5,15.2,17.0,33.7,14.8,16.5,18.3*7E";
    const gst = parseGST(s);
    if (gst) {
      expect(gst.sigmaLat).toBeCloseTo(14.8, 2);
      expect(gst.sigmaLon).toBeCloseTo(16.5, 2);
      expect(gst.sigmaAlt).toBeCloseTo(18.3, 2);
    }
  });
});

describe("parseGSA", () => {
  it("extracts DOPs and fix type from a 3D fix", () => {
    const s = "$GPGSA,A,3,04,05,09,12,,,,,,,,,3.6,2.1,2.2*1B";
    const gsa = parseGSA(s);
    expect(gsa).not.toBeNull();
    expect(gsa!.fixType).toBe(3);
    expect(gsa!.pdop).toBeCloseTo(3.6, 2);
    expect(gsa!.hdop).toBeCloseTo(2.1, 2);
    expect(gsa!.vdop).toBeCloseTo(2.2, 2);
    expect(gsa!.svs).toContain(4);
    expect(gsa!.svs).toContain(5);
  });

  it("returns null when fix type is 1 (no fix)", () => {
    const s = "$GPGSA,A,1,,,,,,,,,,,,,,,*1E";
    expect(parseGSA(s)).toBeNull();
  });
});

describe("parseRMC", () => {
  it("parses an active RMC sentence and derives ISO date", () => {
    const s = "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A";
    const rmc = parseRMC(s);
    expect(rmc).not.toBeNull();
    expect(rmc!.lat).toBeCloseTo(48.1173, 4);
    expect(rmc!.lon).toBeCloseTo(11.5167, 4);
    expect(rmc!.speedKnots).toBeCloseTo(22.4, 2);
    expect(rmc!.date).toBe("230394");
    expect(rmc!.isoDate).toBe("1994-03-23");
  });

  it("returns null for void (V) status", () => {
    const s = "$GPRMC,123519,V,,,,,,,230394,,*21";
    expect(parseRMC(s)).toBeNull();
  });
});
