# Architecture & Phased Plan

## Goal

A small service that ingests **NMEA-0183** from multiple GNSS antennas over
**TCP** (server role — antennas dial in), normalizes each fix into a
self-describing JSON record, and serves it to a React SPA over **WebSocket**
(push) and **REST** (snapshot/config/health). Runs in Docker on a Linux server
or Raspberry Pi (ARM64).

## Non-goals

- ENU output (requires a reference point — handled in the SPA).
- Historical persistence / database (in-memory latest fix per antenna only).
- NTRIP caster, RTCM corrections back to antennas.
- Integration into the existing Go iDig server.
- AuthN/Z (deployment is LAN-only behind a reverse proxy / firewall).

## Architecture

```
Antennas ──TCP/NMEA──▶ TcpListener ──▶ NmeaParser ──▶ FixStore (latest per antenna)
                                                              │
                                          ┌───────────────────┼──────────────────┐
                                          ▼                                      ▼
                                    REST (fastify)                       WebSocket (ws)
                                          │                                      │
                                          └─────────────── React SPA ────────────┘
```

Modules:

- `config` — env vars (zod) + optional `antennas.json` (IP → id map).
- **`packages/core` (`@ikaros-arch/gnss-core`, pure, published):**
  - `nmea/checksum` — XOR checksum verification.
  - `nmea/parseGGA` — position + fix quality + satellites + HDOP + altitude.
  - `nmea/parseGST` — 1-σ accuracy in metres. (+ `parseGSA`, `parseRMC`, `parseVTG`.)
  - `geodesy/wgs84` — LLH → ECEF (XYZ).
  - `geodesy/proj` — `proj4` wrapper; default target CRS **EPSG:32635**.
  - `fix` — the `Fix` wire schema.
  - `assembler` — `FixAssembler` (sentences → `Fix`), `LineSplitter` (chunks → lines).
- `store/fixStore` — `Map<antennaId, Fix>` + `EventEmitter`.
- `tcp/listener` — `net.createServer`, antenna ID resolution, one `LineSplitter` +
  `FixAssembler` per connection.
- `rest/api` — fastify routes.
- `ws/hub` — WebSocket on `/ws`, snapshot-on-connect + push-per-fix.
- `index` — wiring & graceful shutdown.

## CRS

Default `OUTPUT_CRS = EPSG:32635` (WGS84 / UTM zone 35N). Each fix carries the
projected `utm: {x, y, crs}` alongside `llh` (WGS84 lon/lat) and `xyz` (ECEF).
The CRS is overridable via env; `proj4` is used so any EPSG with a registered
definition works.

## Phased delivery (each phase is independently testable)

### Phase 1 — Scaffold + bootable service ✅
- Repo skeleton, TS build, lint-free types.
- Minimal but real TCP listener that parses GGA + GST.
- REST `/api/health`, `/api/fixes`; WS `/ws` snapshot+push.
- UTM projection on every fix.
- Dockerfile + `docker-compose.yml`.
- Replay script + browser test client.
- **Test**: `npm test`, then `npm run dev` + `npm run replay`, then `curl /api/fixes` and open the test HTML.

### Phase 2 — Hardened parsing & accuracy
- Add `parseGSA`, `parseRMC`, `parseVTG`.
- Sigma propagation from ENU (lat/lon/alt) → ECEF (X/Y/Z) and into the target UTM.
- Fallback `accuracy.source = "ESTIMATED"` when GST absent (HDOP × URA).
- Per-talker quirks (Trimble/Septentrio/u-blox quality codes — document mapping).
- **Test**: extend `test/nmea.test.ts` and `test/geodesy.test.ts`; add fixture files in `test/fixtures/`.

### Phase 3 — Operational hardening
- Stale-fix detection in `/api/antennas` (`lastByteAt` age).
- Backpressure / max-line-length protection on TCP socket buffer.
- WS subscribe/unsubscribe per antennaId.
- Pino log redaction for IPs if needed.
- **Test**: kill replay mid-stream; confirm `/api/antennas` reflects the gap; confirm WS clients keep ping/pong alive.

### Phase 4 — Deployment polish
- Multi-arch image push (`linux/amd64,linux/arm64`).
- `compose.prod.yml` overlay (resource limits, restart policy, log rotation).
- Optional: tiny systemd unit for non-Docker Pi deployment.
- **Test**: pull on the Pi, smoke test against a real antenna.

## Verification matrix

| Capability                | Phase | How to verify                                                   |
|---------------------------|-------|------------------------------------------------------------------|
| NMEA checksum             | 1     | `npm test` (`test/checksum.test.ts`)                             |
| GGA parsing               | 1     | `npm test` (`test/nmea.test.ts`)                                 |
| WGS84 → ECEF              | 1     | `npm test` (`test/geodesy.test.ts`)                              |
| LLH → UTM (EPSG:32635)    | 1     | `npm test` (`test/geodesy.test.ts`)                              |
| TCP listener end-to-end   | 1     | `npm run dev` + `npm run replay`, then `curl /api/fixes`         |
| WebSocket push            | 1     | Open `scripts/test-client.html`, run replay, watch frames        |
| Docker on amd64           | 1     | `docker compose up --build` on dev box                           |
| Docker on arm64 (Pi)      | 4     | `docker buildx --platform linux/arm64 ... --push` then pull/run  |
| Sigma propagation         | 2     | New unit tests in `test/geodesy.test.ts`                         |
| Stale-fix age             | 3     | Manual: kill replay, observe `/api/antennas`                     |

## Decisions (locked)

- Node.js 22 + TypeScript; `fastify` 5 + `ws`; `proj4` for CRS.
- NMEA-only input; JSON over WS+REST output.
- Service is the TCP **server**.
- ≤10 antennas, latest fix only, no DB.
- No auth (LAN-only).
- Default CRS **EPSG:32635 — WGS84 / UTM zone 35N**, overridable.
