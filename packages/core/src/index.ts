// NMEA sentence parsers (pure, checksum-verified)
export { verifyChecksum } from "./nmea/checksum.js";
export { parseGGA, type GgaFix, type FixQuality } from "./nmea/parseGGA.js";
export { parseGST, type GstAccuracy } from "./nmea/parseGST.js";
export { parseGSA, type GsaData } from "./nmea/parseGSA.js";
export { parseRMC, type RmcData } from "./nmea/parseRMC.js";
export { parseVTG, type VtgData } from "./nmea/parseVTG.js";

// Geodesy
export { llhToEcef, propagateSigmaToEcef, type ECEF, type SigmaEcef } from "./geodesy/wgs84.js";
export { projectLonLat, registerCrs, type ProjectedXY } from "./geodesy/proj.js";

// Normalised fix + the machinery that produces it
export type { Fix } from "./fix.js";
export { FixAssembler, LineSplitter, DEFAULT_MAX_LINE_BYTES, type FixAssemblerOptions } from "./assembler.js";
