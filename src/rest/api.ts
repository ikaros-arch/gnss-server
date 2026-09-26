import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { Logger } from "pino";
import type { FixStore } from "../store/fixStore.js";

const __dir = dirname(fileURLToPath(import.meta.url));
// Resolve test-client.html relative to this file: dist/rest/ → scripts/
const clientHtml = (() => {
  try { return readFileSync(join(__dir, "../../scripts/test-client.html"), "utf8"); }
  catch { return null; }
})();

export function buildRest(store: FixStore, logger: Logger, outputCrs: string) {
  const app = Fastify({ loggerInstance: logger });

  // Allow cross-origin requests (LAN-only service, read-only GET endpoints).
  app.addHook("onSend", async (_req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
  });
  app.options("/*", async (_req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    return reply.code(204).send();
  });

  // Serve the monitor UI at the root so it works from the same origin.
  if (clientHtml) {
    app.get("/", async (_req, reply) => reply.type("text/html").send(clientHtml));
  }

  app.get("/api/health", async () => ({
    status: "ok",
    uptime: process.uptime(),
    outputCrs,
    antennas: store.ids().length,
  }));

  app.get("/api/antennas", async () => {
    const now = Date.now();
    return store.all().map((f) => ({
      antennaId: f.antennaId,
      label: f.label,
      lastFixAt: f.receivedAt,
      ageMs: now - new Date(f.conn.lastByteAt).getTime(),
      status: f.fix.status,
      conn: f.conn,
    }));
  });

  app.get<{ Params: { id: string } }>("/api/antennas/:id/last", async (req, reply) => {
    const fix = store.get(req.params.id);
    if (!fix) {
      reply.code(404);
      return { error: "no fix for antenna", id: req.params.id };
    }
    return fix;
  });

  app.get("/api/fixes", async () => store.all());

  return app;
}
