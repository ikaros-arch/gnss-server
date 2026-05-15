import Fastify from "fastify";
import type { Logger } from "pino";
import type { FixStore } from "../store/fixStore.js";

export function buildRest(store: FixStore, logger: Logger, outputCrs: string) {
  const app = Fastify({ logger: logger as any });

  app.get("/api/health", async () => ({
    status: "ok",
    uptime: process.uptime(),
    outputCrs,
    antennas: store.ids().length,
  }));

  app.get("/api/antennas", async () => store.all().map((f) => ({
    antennaId: f.antennaId,
    lastFixAt: f.receivedAt,
    status: f.fix.status,
    conn: f.conn,
  })));

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
