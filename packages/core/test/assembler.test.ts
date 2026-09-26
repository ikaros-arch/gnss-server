import { describe, it, expect } from "vitest";
import { FixAssembler, LineSplitter } from "../src/assembler.js";

// The same five sentences as test/fixtures/sample.nmea at the repo root.
const GGA = "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47";
const GST = "$GPGST,123519,1.5,1.2,0.9,0.0,0.8,1.0,1.4*76";
const GSA = "$GPGSA,A,3,04,05,09,12,,,,,,,,,3.6,2.1,2.2*3F";
const RMC = "$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A";
const VTG = "$GPVTG,054.7,T,034.4,M,022.4,N,041.5,K,A*22";

const fixedClock = () => new Date("2026-09-26T10:00:00.000Z");

function assembler(overrides = {}) {
  return new FixAssembler({
    antennaId: "rover-1",
    label: "RS4 test",
    outputCrs: "EPSG:32635",
    transport: { remoteIp: "10.0.0.5", remotePort: 51000 },
    now: fixedClock,
    ...overrides,
  });
}

describe("FixAssembler", () => {
  it("yields a Fix only on GGA, with estimated accuracy when no GST was seen", () => {
    const asm = assembler();
    const fix = asm.feed(GGA);
    expect(fix).not.toBeNull();
    expect(fix!.antennaId).toBe("rover-1");
    expect(fix!.label).toBe("RS4 test");
    expect(fix!.llh.lat).toBeCloseTo(48.1173, 4);
    expect(fix!.llh.altEll).toBeCloseTo(545.4 + 46.9, 3);
    expect(fix!.utm.crs).toBe("EPSG:32635");
    expect(fix!.fix.status).toBe("GPS");
    expect(fix!.accuracy.source).toBe("ESTIMATED");
    // HDOP 0.9 × 3 m URA
    expect(fix!.accuracy.sigmaLat).toBeCloseTo(2.7, 6);
    expect(fix!.xyz.sigmaX).toBeGreaterThan(0);
    expect(fix!.utcDate).toBeUndefined();
    expect(fix!.velocity).toBeUndefined();
    expect(fix!.conn).toEqual({
      remoteIp: "10.0.0.5",
      remotePort: 51000,
      since: "2026-09-26T10:00:00.000Z",
      lastByteAt: "2026-09-26T10:00:00.000Z",
    });
  });

  it("returns null for auxiliary sentences and non-NMEA lines", () => {
    const asm = assembler();
    expect(asm.feed(GST)).toBeNull();
    expect(asm.feed(GSA)).toBeNull();
    expect(asm.feed(RMC)).toBeNull();
    expect(asm.feed(VTG)).toBeNull();
    expect(asm.feed("hello")).toBeNull();
    expect(asm.feed("")).toBeNull();
  });

  it("folds GST, GSA, RMC and VTG into the next GGA", () => {
    const asm = assembler();
    for (const s of [GST, GSA, RMC, VTG]) asm.feed(s);
    const fix = asm.feed(GGA)!;
    expect(fix.accuracy).toEqual({ source: "GST", sigmaLat: 0.8, sigmaLon: 1.0, sigmaAlt: 1.4 });
    expect(fix.utm.sigmaE).toBe(1.0);
    expect(fix.utm.sigmaN).toBe(0.8);
    expect(fix.fix.pdop).toBeCloseTo(3.6);
    expect(fix.fix.vdop).toBeCloseTo(2.2);
    expect(fix.utcDate).toBe("1994-03-23");
    expect(fix.velocity).toEqual({ courseTrue: 54.7, speedKnots: 22.4, speedKmh: 41.5 });
  });

  it("forgets auxiliary state on reset()", () => {
    const asm = assembler();
    asm.feed(GST);
    asm.reset();
    expect(asm.feed(GGA)!.accuracy.source).toBe("ESTIMATED");
  });

  it("defaults the transport when the source has no IP (BLE, serial)", () => {
    const fix = assembler({ transport: undefined }).feed(GGA)!;
    expect(fix.conn.remoteIp).toBe("unknown");
    expect(fix.conn.remotePort).toBe(0);
  });

  it("throws for an unregistered CRS so the caller can log it", () => {
    expect(() => assembler({ outputCrs: "EPSG:99999" }).feed(GGA)).toThrow();
  });
});

describe("LineSplitter", () => {
  it("reassembles lines across chunk boundaries and strips CR", () => {
    const ls = new LineSplitter();
    expect(ls.push("$GPGGA,1")).toEqual([]);
    expect(ls.push("23*00\r\n$GPGST,")).toEqual(["$GPGGA,123*00"]);
    expect(ls.push("x*11\n\n")).toEqual(["$GPGST,x*11"]);
  });

  it("flushes and reports an overlong line without a newline", () => {
    let dropped = 0;
    const ls = new LineSplitter(16, (n) => { dropped = n; });
    expect(ls.push("x".repeat(20))).toEqual([]);
    expect(dropped).toBe(20);
    // Buffer was cleared: a following normal line comes through intact.
    expect(ls.push("$OK\n")).toEqual(["$OK"]);
  });
});
