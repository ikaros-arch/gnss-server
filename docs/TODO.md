# TODO

Live task list. Mark items `[x]` as they land. Add new items at the bottom of
the relevant phase. Keep the order roughly chronological.

## Phase 1 — Scaffold + bootable service

- [x] Repo scaffold: `package.json`, `tsconfig.json`, `.gitignore`, `.dockerignore`
- [x] Docker scaffolding: `Dockerfile`, `docker-compose.yml`, `.env.example`
- [x] Config loader (`src/config.ts`) with zod, default `OUTPUT_CRS=EPSG:32635`
- [x] NMEA: `verifyChecksum`, `parseGGA`, `parseGST`
- [x] Geodesy: `wgs84.llhToEcef`, `proj.projectLonLat` (proj4, EPSG:32635 registered)
- [x] `FixStore` (in-memory latest-per-antenna, EventEmitter)
- [x] `tcp/listener` end-to-end (parses, projects, stores)
- [x] REST: `/api/health`, `/api/antennas`, `/api/antennas/:id/last`, `/api/fixes`
- [x] WebSocket `/ws`: snapshot on connect + push on update
- [x] Replay script (`scripts/replay-nmea.ts`)
- [x] Browser test client (`scripts/test-client.html`)
- [x] Basic unit tests (checksum, GGA, WGS84, UTM)
- [x] Docs: `README.md`, `docs/PLAN.md`, `docs/TODO.md`, `.github/copilot-instructions.md`
- [x] **Verify locally**: `npm install && npm test && npm run dev` + replay + curl + open test-client
- [x] **Verify in Docker**: `docker compose up --build` + real device fix received
- [x] Add `package-lock.json` to repo (after first `npm install`)

## Phase 2 — Hardened parsing & accuracy

- [x] `parseGSA`, `parseRMC`, `parseVTG`
- [x] Sigma propagation lat/lon/alt → X/Y/Z (ENU rotation, `propagateSigmaToEcef`)
- [x] Sigma propagation lat/lon → UTM easting/northing (`sigmaE`, `sigmaN` on `utm`)
- [x] Fallback `accuracy.source = "ESTIMATED"` from HDOP/VDOP when GST is missing
- [x] Document quality-code mapping per receiver vendor in README
- [x] Fixture files in `test/fixtures/` (real recorded streams — `sample.nmea`, `rtk-float.nmea`)
- [x] Tests: malformed/checksum-failure handling, multi-talker (`GN*` vs `GP*`)

## Phase 3 — Operational hardening

- [x] Stale-fix age in `/api/antennas` (compare `lastByteAt` to now, add `ageMs`)
- [x] WS subscribe/unsubscribe filter by antennaId (`{"type":"subscribe","ids":[...]}`)
- [x] TCP socket: max line length (2048 B), configurable idle timeout (`TCP_IDLE_TIMEOUT_MS`)
- [x] Log redaction option for client IPs (`REDACT_IPS=true`)
- [ ] Prometheus `/metrics` endpoint (optional)

## Phase 4 — Deployment polish

- [ ] CI workflow: test + buildx multi-arch
- [x] `compose.prod.yml` overlay (memory/CPU limits, log rotation)
- [x] Tag image `gnss-server:0.1.0` in docker-compose.yml
- [x] Pi smoke test against real antennas (3 × Emlid RS, live in production)
- [x] ~~Push image to registry~~ — builds on server directly; no registry needed
- [x] ~~systemd unit~~ — not needed; Docker restart policy covers this

## Phase 5 — `gnss-core` package (for the Ikaros iOS app)

The Ikaros native app (hallvard-indgjerd/ikaros-mima#35) needs the NMEA→Fix pipeline
client-side, fed from a BLE or TCP receiver instead of our TCP listener. `src/nmea/`,
`src/geodesy/` and `src/store/fix.ts` are already pure (only `proj4`); the Fix assembly in
`tcp/listener.ts` `handleLine` is the one piece still tied to `node:net`/`pino`.

- [ ] Extract a pure `FixAssembler` (`feed(line: string): Fix | null`, per-connection state,
      injectable `now()`/`antennaId`) from `handleLine`; `listener.ts` becomes a socket adapter
- [ ] Move `nmea/*`, `geodesy/*`, `fix.ts`, `FixAssembler` into `packages/core` with its own
      `package.json` (ESM + `.d.ts`, dependency `proj4` only); gnss-server depends on it
- [ ] Move the matching vitest tests with the code; `docs/PLAN.md` verification still passes
- [ ] Publish as public `@ikaros-arch/gnss-core` 0.1.0 (Docker `npm ci` in ikaros-mima needs a
      public registry package, not a git/file dependency)
- [ ] README: document the package and the three consumers (this server, Ikaros app, external
      e.g. AnalyticBase)
