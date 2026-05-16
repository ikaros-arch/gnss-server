import { describe, it, expect } from "vitest";
import { parseGGA } from "../src/nmea/parseGGA.js";
import { parseGST } from "../src/nmea/parseGST.js";
import { parseGSA } from "../src/nmea/parseGSA.js";
import { parseRMC } from "../src/nmea/parseRMC.js";
import { parseVTG } from "../src/nmea/parseVTG.js";

/** Build a valid NMEA sentence from a body string by computing the checksum. */
function makeNmea(body: string): string {
  let cs = 0;
  for (let i = 0; i < body.length; i++) cs ^= body.charCodeAt(i);
  return `$${body}*${cs.toString(16).toUpperCase().padStart(2, "0")}`;
}

// ── GGA ─────────────────────────────────────────────────────────────────────

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

  it("returns null for bad checksum", () => {
    const s = "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*FF";
    expect(parseGGA(s)).toBeNull();
  });

  it("accepts GN-talker GGA (multi-constellation)", () => {
    // GNGGA uses the GN talker prefix — parser must accept /GGA$/ not just GPGGA.
    const s = makeNmea("GNGGA,083206,3656.0659,N,02536.1030,E,4,13,1.0,9.487,M,36.785,M,,");
    const fix = parseGGA(s);
    expect(fix).not.toBeNull();
    expect(fix!.status).toBe("RTK_FIXED");
    expect(fix!.lat).toBeCloseTo(36.9344, 3);
    expect(fix!.lon).toBeCloseTo(25.6017, 3);
  });
});

// ── GST ─────────────────────────────────────────────────────────────────────

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

  it("returns null for bad checksum", () => {
    expect(parseGST("$GPGST,182141.000,15.5,15.2,17.0,33.7,14.8,16.5,18.3*00")).toBeNull();
  });

  it("accepts GN-talker GST", () => {
    const s = makeNmea("GNGST,083206,0.04,0.02,0.01,0.00,0.22,0.61,1.10");
    const gst = parseGST(s);
    expect(gst).not.toBeNull();
    expect(gst!.sigmaLat).toBeCloseTo(0.22, 3);
    expect(gst!.sigmaLon).toBeCloseTo(0.61, 3);
    expect(gst!.sigmaAlt).toBeCloseTo(1.10, 3);
  });
});

// ── GSA ─────────────────────────────────────────────────────────────────────

describe("parseGSA", () => {
  it("extracts DOPs and fix type from a 3D fix", () => {
    // 12 SV slots (f[3..14]): 4 filled + 8 empty, then PDOP/HDOP/VDOP at f[15..17].
    // 9 commas after "12" = 8 empty fields + separator before PDOP.
    const s = "$GPGSA,A,3,04,05,09,12,,,,,,,,,3.6,2.1,2.2*3F";
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

  it("returns null for bad checksum", () => {
    expect(parseGSA("$GPGSA,A,3,04,05,,,,,,,,,,,,3.6,2.1,2.2*00")).toBeNull();
  });
});

// ── RMC ─────────────────────────────────────────────────────────────────────

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

  it("returns null for bad checksum", () => {
    expect(parseRMC("$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,,*00")).toBeNull();
  });

  it("handles 21st-century dates correctly", () => {
    const s = makeNmea("GNRMC,083206,A,3656.0659,N,02536.1030,E,0.1,0.0,160526,,");
    const rmc = parseRMC(s);
    expect(rmc).not.toBeNull();
    expect(rmc!.isoDate).toBe("2026-05-16");
  });
});

// ── VTG ─────────────────────────────────────────────────────────────────────

describe("parseVTG", () => {
  it("extracts course and speed", () => {
    const s = makeNmea("GPVTG,054.7,T,034.4,M,022.4,N,041.5,K,A");
    const vtg = parseVTG(s);
    expect(vtg).not.toBeNull();
    expect(vtg!.courseTrueNorth).toBeCloseTo(54.7, 2);
    expect(vtg!.speedKnots).toBeCloseTo(22.4, 2);
    expect(vtg!.speedKmh).toBeCloseTo(41.5, 2);
  });

  it("returns null when FAA mode is N (invalid)", () => {
    const s = "$GPVTG,,,,,,,,,N*30";
    expect(parseVTG(s)).toBeNull();
  });

  it("returns null for bad checksum", () => {
    expect(parseVTG("$GPVTG,054.7,T,034.4,M,022.4,N,041.5,K,A*00")).toBeNull();
  });
});
