import { describe, it, expect } from "vitest";
import { llhToEcef } from "../src/geodesy/wgs84.js";
import { projectLonLat } from "../src/geodesy/proj.js";

describe("llhToEcef", () => {
  it("matches a known reference point at the equator/prime meridian", () => {
    const { x, y, z } = llhToEcef(0, 0, 0);
    expect(x).toBeCloseTo(6378137, 0);
    expect(y).toBeCloseTo(0, 3);
    expect(z).toBeCloseTo(0, 3);
  });p

  it("matches a known reference point at the north pole", () => {
    const { x, y, z } = llhToEcef(90, 0, 0);
    // Polar radius ~6356752.3
    expect(Math.abs(x)).toBeLessThan(1e-3);
    expect(Math.abs(y)).toBeLessThan(1e-3);
    expect(z).toBeCloseTo(6356752.314, 2);
  });
});

describe("projectLonLat (EPSG:32635)", () => {
  it("projects an Athens-area lon/lat into UTM zone 35N metres", () => {
    const { x, y } = projectLonLat(23.7275, 37.9838, "EPSG:32635");
    // Athens is at ~23.73°E — about 3.3° west of the zone 35N central meridian
    // (27°E), so easting is ~212 000 m (well below the false easting of 500 000).
    // Northing at ~38°N is ~4.2 million m.
    expect(x).toBeGreaterThan(150_000);
    expect(x).toBeLessThan(300_000);
    expect(y).toBeGreaterThan(4_100_000);
    expect(y).toBeLessThan(4_300_000);
  });
});
