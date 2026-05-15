import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";

const Schema = z.object({
  TCP_PORT: z.coerce.number().int().positive().default(9100),
  HTTP_PORT: z.coerce.number().int().positive().default(9200),
  MAX_CONNECTIONS: z.coerce.number().int().positive().default(16),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  OUTPUT_CRS: z.string().default("EPSG:32635"),
  ANTENNAS_FILE: z.string().optional(),
});

export type AntennaMap = Record<string, { id: string; label?: string }>;

export interface Config {
  tcpPort: number;
  httpPort: number;
  maxConnections: number;
  logLevel: string;
  outputCrs: string;
  antennas: AntennaMap;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Schema.parse(env);
  let antennas: AntennaMap = {};
  if (parsed.ANTENNAS_FILE && existsSync(parsed.ANTENNAS_FILE)) {
    antennas = JSON.parse(readFileSync(parsed.ANTENNAS_FILE, "utf8"));
  }
  return {
    tcpPort: parsed.TCP_PORT,
    httpPort: parsed.HTTP_PORT,
    maxConnections: parsed.MAX_CONNECTIONS,
    logLevel: parsed.LOG_LEVEL,
    outputCrs: parsed.OUTPUT_CRS,
    antennas,
  };
}
