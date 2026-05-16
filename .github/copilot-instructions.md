# Copilot instructions for `gnss-server`

This file orients AI coding assistants (and humans) working in this repo. Read
[docs/PLAN.md](../docs/PLAN.md) and [docs/TODO.md](../docs/TODO.md) before
making non-trivial changes.

## What this project is

A Node.js 20 + TypeScript service that:

1. Listens on a TCP port (default **9100**) for incoming **NMEA-0183**
   sentences from one or more GNSS antennas (the antennas dial in to us).
2. Parses GGA (+ GST for accuracy) per connection, derives ECEF (XYZ), and
   projects WGS84 lon/lat into the configured CRS — default
   **EPSG:32635 (WGS84 / UTM zone 35N)** via `proj4`.
3. Keeps only the **latest fix per antenna** in memory.
4. Exposes the data to a React SPA on port **9200** via:
   - REST: `/api/health`, `/api/antennas`, `/api/antennas/:id/last`, `/api/fixes`.
   - WebSocket `/ws`: snapshot frame on connect + per-fix push.
5. Ships as a Docker image runnable on Linux x86-64 servers and Raspberry Pi
   (ARM64). The dev laptop is **not** the deployment target.

## Stack & conventions

- **Runtime**: Node.js 20 LTS, ESM (`"type": "module"`), TypeScript strict.
- **Libraries**: `fastify` (REST), `ws` (WebSocket), `pino` (logging),
  `zod` (config), `proj4` (CRS reprojection). Built-in `node:net` for TCP.
- **Tests**: `vitest`. Tests live in `test/` and import from `../src/...js`
  (note the `.js` extension required by the ESM resolver under `tsx`/Node 20).
- **No frameworks creep**: do not introduce ORMs, message queues, or auth
  middleware unless explicitly requested. The deployment is LAN-only.
- **No persistence**: latest fix per antenna only, in-memory.
- **Coordinate handling**: every fix carries `llh` (WGS84), `xyz` (ECEF), and
  `utm` (`{x, y, crs}`). Never drop the `crs` field — clients rely on it.
- **Logging**: structured via `pino`; create child loggers per module
  (`logger.child({ mod: "tcp" })`) and per connection.

## Layout

```
src/
  config.ts            env parsing + antennas.json loader (zod-validated)
  index.ts             entry & wiring
  nmea/                checksum, parseGGA, parseGST  (pure functions, no I/O)
  geodesy/             wgs84.ts (ECEF), proj.ts (proj4 wrapper)
  store/               fix.ts (types), fixStore.ts (Map + EventEmitter)
  tcp/                 listener.ts
  rest/                api.ts (fastify)
  ws/                  hub.ts (ws server attached to fastify's http server)
test/                  vitest unit tests
scripts/               replay-nmea.ts, test-client.html
config/                antennas.example.json (IP → {id,label})
docs/                  PLAN.md, TODO.md
```

## Workflow rules

- **Plan-first**: if a change spans more than one module, update
  [docs/TODO.md](../docs/TODO.md) before/while implementing.
- **Phases are independently testable**: do not let Phase N changes break
  Phase N-1's verification steps in `docs/PLAN.md`.
- **Keep tests basic**: prefer one focused unit test per behaviour over
  exhaustive matrices. Real validation happens via the replay script and the
  browser test client.
- **Don't expand scope**: see "Non-goals" in `docs/PLAN.md`. Specifically: no
  ENU output, no DB, no auth, no NTRIP/RTCM, no integration into the Go iDig
  server in the sibling repo.
- **CRS is configurable but defaults to EPSG:32635**. Don't hard-code other
  EPSG codes in business logic; route through `geodesy/proj.ts`.
- **Don't run the service on the dev box for prod-like tests** — use
  `docker compose up --build`. Targets are Linux x86-64 and Raspberry Pi
  (ARM64); use `docker buildx --platform linux/amd64,linux/arm64` for releases.
- **`npm install` and `npm test` are run by the user on the server, not on the
  local dev machine.** `node_modules` is absent locally so TS errors about
  missing type declarations (e.g. `node:net`, `pino`, `vitest`) are expected
  in the IDE and should not be treated as real errors. Do not attempt to run
  `npm install` or `npm test` locally.

## Common commands

> **Have the user run these on the server, not the local dev machine** (no `node_modules` locally).

```bash
npm install
npm test                 # vitest unit tests
npm run dev              # tsx watch on src/index.ts
npm run replay           # stream sample NMEA at 127.0.0.1:9100
docker compose up --build
```

## When asked to add a new NMEA sentence parser

1. Add a pure function `src/nmea/parseXXX.ts` returning a typed object or `null`.
2. Verify the checksum via `verifyChecksum` first.
3. Add a unit test in `test/nmea.test.ts` (or a sibling file) with a real
   fixture sentence.
4. Wire it into `src/tcp/listener.ts` only if the data lands in the `Fix`
   schema; otherwise leave parser unused but exported.

## When asked to add a new output field

1. Extend `Fix` in `src/store/fix.ts`.
2. Populate it in `src/tcp/listener.ts`.
3. Update the schema example in `README.md` and the verification matrix in
   `docs/PLAN.md` if relevant.

## What NOT to do

- Don't add Express, NestJS, Socket.IO, or other heavier alternatives to the
  chosen libraries.
- Don't introduce a database, queue, or external cache.
- Don't add authentication unless the user explicitly asks for it.
- Don't widen the deployment story beyond Docker on Linux x86-64 / ARM64.
- Don't write large documentation files for changes; update `docs/TODO.md`
  and the relevant section of `README.md` / `docs/PLAN.md` instead.
