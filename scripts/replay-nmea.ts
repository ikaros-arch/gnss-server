// Stream a NMEA log file (or built-in sample loop) to a TCP host:port.
// Usage:
//   npx tsx scripts/replay-nmea.ts [host] [port] [file] [hz]
// Defaults: 127.0.0.1 9100 <built-in sample> 1
import { createConnection } from "node:net";
import { readFileSync, existsSync } from "node:fs";

const SAMPLES = [
  "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47",
  "$GPGST,123519,1.5,1.2,0.9,0.0,0.8,1.0,1.4*70",
];

const [, , hostArg, portArg, fileArg, hzArg] = process.argv;
const host = hostArg ?? "127.0.0.1";
const port = parseInt(portArg ?? "9100", 10);
const hz = parseFloat(hzArg ?? "1");

let lines: string[];
if (fileArg && existsSync(fileArg)) {
  lines = readFileSync(fileArg, "utf8").split(/\r?\n/).filter(Boolean);
} else {
  lines = SAMPLES;
  if (fileArg) console.warn(`file ${fileArg} not found, using built-in samples`);
}

const sock = createConnection({ host, port }, () => {
  console.log(`connected to ${host}:${port}, replaying ${lines.length} lines @ ${hz} Hz`);
  let i = 0;
  const interval = setInterval(() => {
    sock.write(lines[i % lines.length] + "\r\n");
    i++;
  }, Math.max(10, 1000 / hz));
  sock.on("close", () => clearInterval(interval));
});

sock.on("error", (err) => {
  console.error("connection error:", err.message);
  process.exit(1);
});
