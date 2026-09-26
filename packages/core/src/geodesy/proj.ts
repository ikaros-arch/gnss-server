import proj4 from "proj4";

// EPSG:32635 — WGS84 / UTM zone 35N. Pre-registered so OUTPUT_CRS=EPSG:32635 works
// out of the box. proj4 ships definitions for EPSG:4326 (WGS84 lon/lat) by default.
proj4.defs(
  "EPSG:32635",
  "+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs +type=crs",
);

export interface ProjectedXY {
  x: number; // easting (m) in target CRS
  y: number; // northing (m) in target CRS
}

/**
 * Project WGS84 lon/lat (degrees) to the given target CRS (e.g. "EPSG:32635").
 * Throws if the target CRS has not been registered with proj4.
 */
export function projectLonLat(
  lon: number,
  lat: number,
  targetCrs: string,
): ProjectedXY {
  const [x, y] = proj4("EPSG:4326", targetCrs, [lon, lat]);
  return { x, y };
}

/**
 * Register an additional CRS definition at runtime (proj4 string).
 * Use this if OUTPUT_CRS is set to a code we don't ship by default.
 */
export function registerCrs(code: string, proj4Def: string): void {
  proj4.defs(code, proj4Def);
}
