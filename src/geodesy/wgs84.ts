// WGS84 ellipsoid → ECEF (XYZ) conversion.
// Reference: https://en.wikipedia.org/wiki/Geographic_coordinate_conversion

const A = 6378137.0; // semi-major axis (m)
const F = 1 / 298.257223563;
const E2 = F * (2 - F); // first eccentricity squared

export interface ECEF {
  x: number;
  y: number;
  z: number;
}

/**
 * Convert WGS84 geodetic (lat°, lon°, height m above ellipsoid) to ECEF (m).
 * NMEA GGA gives orthometric height (MSL) plus geoid separation; ellipsoidal
 * height = mslHeight + geoidSeparation. Pass that as `h`.
 */
export function llhToEcef(latDeg: number, lonDeg: number, h: number): ECEF {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const x = (N + h) * cosLat * Math.cos(lon);
  const y = (N + h) * cosLat * Math.sin(lon);
  const z = (N * (1 - E2) + h) * sinLat;
  return { x, y, z };
}
