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
- [ ] **Verify locally**: `npm install && npm test && npm run dev` + replay + curl + open test-client
- [ ] **Verify in Docker**: `docker compose up --build` on the dev box
- [ ] Add `package-lock.json` to repo (after first `npm install`)

## Phase 2 — Hardened parsing & accuracy

- [ ] `parseGSA`, `parseRMC`, `parseVTG`
- [ ] Sigma propagation lat/lon/alt → X/Y/Z (ENU rotation)
- [ ] Sigma propagation lat/lon → UTM easting/northing
- [ ] Fallback `accuracy.source = "ESTIMATED"` from HDOP when GST is missing
- [ ] Document quality-code mapping per receiver vendor in README
- [ ] Fixture files in `test/fixtures/` (real recorded streams)
- [ ] Tests: malformed/checksum-failure handling, multi-talker (`GN*` vs `GP*`)

## Phase 3 — Operational hardening

- [ ] Stale-fix age in `/api/antennas` (compare `lastByteAt` to now)
- [ ] WS subscribe/unsubscribe filter by antennaId
- [ ] TCP socket: max line length, backpressure handling, `unref()` on idle
- [ ] Configurable idle timeout
- [ ] Log redaction option for client IPs
- [ ] Prometheus `/metrics` endpoint (optional)

## Phase 4 — Deployment polish

- [ ] CI workflow: test + buildx multi-arch
- [ ] Push image `gnss-server:0.1.0` to registry
- [ ] `compose.prod.yml` overlay (memory/CPU limits, log rotation)
- [ ] Pi smoke test against a real antenna
- [ ] Optional: systemd unit for non-Docker installs
