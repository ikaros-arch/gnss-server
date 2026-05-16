# GNSS Server — Frontend Integration Guide

This document is written for the team integrating GNSS live-fix data into the
web application. It covers the server's network interface, every field in the
data model, connection lifecycle, and copy-pasteable React examples.

---

## Service endpoints

The server runs on the same LAN host as the rest of the backend.

| Protocol  | Default port | Path          | Purpose                          |
|-----------|-------------|---------------|----------------------------------|
| HTTP      | 9200        | `/api/health` | Service health check             |
| HTTP      | 9200        | `/api/antennas` | Antenna list + staleness     |
| HTTP      | 9200        | `/api/antennas/:id/last` | Last fix for one antenna |
| HTTP      | 9200        | `/api/fixes`  | Snapshot of all latest fixes     |
| WebSocket | 9200        | `/ws`         | Real-time fix stream             |

All HTTP endpoints return `Content-Type: application/json` and include
`Access-Control-Allow-Origin: *`, so they can be called from any origin.

---

## Recommended integration pattern

Use **WebSocket for live display** and **REST only for one-off reads**
(e.g. initial page load, health checks on demand). The WS connection delivers
a full snapshot immediately on connect and then pushes individual updates as
fixes arrive, typically once per second per antenna.

```
1. Open WS → receive snapshot → render all antennas
2. Per incoming "fix" message → update that one antenna in state
3. REST /api/antennas → call only when you need staleness info (ageMs)
4. REST /api/health → call only for an admin/status page
```

---

## WebSocket protocol

### Connect

```js
const ws = new WebSocket("ws://GNSS_HOST:9200/ws");
```

### Messages the server sends

#### `snapshot` — sent once immediately on connect

```jsonc
{
  "type": "snapshot",
  "fixes": [ /* array of Fix objects, one per known antenna */ ]
}
```

#### `fix` — pushed on every new fix from any antenna

```jsonc
{
  "type": "fix",
  "fix": { /* single Fix object */ }
}
```

### Messages the client can send (optional)

#### Subscribe to specific antennas

Useful when the app only displays one antenna at a time. The server responds
immediately with a filtered snapshot, then pushes only matching fixes.

```jsonc
{ "type": "subscribe", "ids": ["rover-1", "rover-2"] }
```

#### Revert to all antennas

```jsonc
{ "type": "unsubscribe" }
```

The server sends a full snapshot when unsubscribing.

### Keep-alive

The server sends a WebSocket `ping` frame every 30 seconds. The browser's
WebSocket implementation handles the `pong` automatically — no action needed.

---

## The `Fix` object

Every snapshot entry and every `fix` message contains one `Fix` object. All
fields are present unless marked *optional*.

```ts
interface Fix {
  // ── Identity ──────────────────────────────────────────────────────────────
  antennaId: string;    // stable key: from antennas.json or "ip:port"
  label?: string;       // human label from antennas.json, e.g. "RS4 Keros 1"

  // ── Timestamps ────────────────────────────────────────────────────────────
  receivedAt: string;   // ISO 8601 — when the server received the GGA sentence
  utc: string;          // hhmmss(.sss) from the GNSS receiver's clock
  utcDate?: string;     // YYYY-MM-DD — absent until the first RMC sentence

  // ── WGS84 geodetic coordinates ────────────────────────────────────────────
  llh: {
    lat: number;        // decimal degrees, positive north
    lon: number;        // decimal degrees, positive east
    altMsl: number;     // altitude above mean sea level, metres
    geoidSep: number;   // geoid undulation (MSL − ellipsoid), metres
    altEll: number;     // ellipsoidal height = altMsl + geoidSep, metres
  };

  // ── ECEF Cartesian coordinates ────────────────────────────────────────────
  xyz: {
    x: number;          // metres
    y: number;
    z: number;
    sigmaX?: number;    // 1-sigma uncertainty, metres (present when accuracy known)
    sigmaY?: number;
    sigmaZ?: number;
  };

  // ── Projected coordinates (default EPSG:32635 — WGS84/UTM zone 35N) ──────
  utm: {
    x: number;          // easting, metres
    y: number;          // northing, metres
    crs: string;        // e.g. "EPSG:32635" — always present, use to label axes
    sigmaE?: number;    // 1-sigma easting uncertainty, metres
    sigmaN?: number;    // 1-sigma northing uncertainty, metres
  };

  // ── Accuracy ──────────────────────────────────────────────────────────────
  accuracy: {
    source: "GST" | "ESTIMATED";
    // "GST"       → sigmas measured by the receiver (best quality)
    // "ESTIMATED" → derived from HDOP/VDOP × URA constant (approximate)
    sigmaLat?: number;  // 1-sigma north, metres
    sigmaLon?: number;  // 1-sigma east, metres
    sigmaAlt?: number;  // 1-sigma up, metres
  };

  // ── GNSS fix metadata ─────────────────────────────────────────────────────
  fix: {
    quality: number;    // raw GGA quality integer (see table below)
    status: FixStatus;  // named string derived from quality
    satellites: number; // number of satellites used
    hdop: number;       // horizontal dilution of precision
    vdop?: number;      // vertical DOP (from GSA sentence)
    pdop?: number;      // position DOP (from GSA sentence)
    diffAge?: number;   // seconds since last RTCM correction — absent for autonomous fixes
                        // WARNING: fix can still show RTK_FIXED with stale corrections
    refStationId?: string; // base station identifier (e.g. "0001")
  };

  // ── Velocity (optional — present when receiver sends VTG sentences) ───────
  velocity?: {
    courseTrue: number; // degrees from true north, 0–360
    speedKnots: number;
    speedKmh: number;
  };

  // ── TCP connection info ───────────────────────────────────────────────────
  conn: {
    remoteIp: string;   // IP address of the GNSS receiver
    remotePort: number;
    since: string;      // ISO 8601 — when the TCP connection was established
    lastByteAt: string; // ISO 8601 — last received byte (use for staleness)
  };
}
```

### Fix status values

| `fix.quality` | `fix.status`   | Meaning                                      |
|---------------|----------------|----------------------------------------------|
| 1             | `GPS`          | Autonomous GNSS — ~2–5 m                     |
| 2             | `DGPS`         | SBAS/DGNSS corrections — ~0.5–2 m            |
| 4             | `RTK_FIXED`    | RTK integer ambiguity — ~1–3 cm              |
| 5             | `RTK_FLOAT`    | RTK float — ~0.1–0.5 m                       |
| 6             | `ESTIMATED`    | Dead-reckoning                               |
| 0             | `NONE`         | No fix — server never forwards these         |

For UI purposes the most important distinction is `RTK_FIXED` vs everything
else. When `accuracy.source === "GST"` the sigma values are measured; when
`"ESTIMATED"` they are approximate bounds.

### Staleness

Compute age client-side from `conn.lastByteAt`:

```ts
const ageMs = Date.now() - new Date(fix.conn.lastByteAt).getTime();
const isStale = ageMs > 10_000; // 10 s
```

The `GET /api/antennas` endpoint pre-computes `ageMs` server-side if you prefer.

---

## REST endpoints

### `GET /api/health`

```jsonc
{
  "status": "ok",
  "uptime": 3724.5,       // seconds since service start
  "outputCrs": "EPSG:32635",
  "antennas": 3           // number of antennas with at least one fix
}
```

### `GET /api/antennas`

Lightweight list — no coordinate data. Suitable for a sidebar or status bar.

```jsonc
[
  {
    "antennaId": "base-1",
    "label": "RS3 Base Sorokos",
    "lastFixAt": "2026-05-16T11:42:01.000Z",
    "ageMs": 843,
    "status": "RTK_FIXED",
    "conn": { "remoteIp": "10.10.10.96", "remotePort": 54321,
              "since": "...", "lastByteAt": "..." }
  }
]
```

### `GET /api/antennas/:id/last`

Returns the full `Fix` object for one antenna, or `404` if not yet seen.

### `GET /api/fixes`

Returns an array of all latest `Fix` objects (same shape as the WS snapshot).

---

## React integration — minimal example

```tsx
// useGnss.ts
import { useEffect, useRef, useState } from "react";

export interface Fix {
  antennaId: string;
  label?: string;
  receivedAt: string;
  utc: string;
  utcDate?: string;
  llh: { lat: number; lon: number; altMsl: number; geoidSep: number; altEll: number };
  xyz: { x: number; y: number; z: number; sigmaX?: number; sigmaY?: number; sigmaZ?: number };
  utm: { x: number; y: number; crs: string; sigmaE?: number; sigmaN?: number };
  accuracy: { source: "GST" | "ESTIMATED"; sigmaLat?: number; sigmaLon?: number; sigmaAlt?: number };
  fix: { quality: number; status: string; satellites: number; hdop: number; vdop?: number; pdop?: number; diffAge?: number; refStationId?: string };
  velocity?: { courseTrue: number; speedKnots: number; speedKmh: number };
  conn: { remoteIp: string; remotePort: number; since: string; lastByteAt: string };
}

export function useGnss(wsUrl: string) {
  const [fixes, setFixes] = useState<Record<string, Fix>>({});
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "snapshot") {
        const map: Record<string, Fix> = {};
        for (const f of msg.fixes as Fix[]) map[f.antennaId] = f;
        setFixes(map);
      } else if (msg.type === "fix") {
        setFixes((prev) => ({ ...prev, [(msg.fix as Fix).antennaId]: msg.fix }));
      }
    };

    return () => ws.close();
  }, [wsUrl]);

  const subscribe = (ids: string[]) =>
    wsRef.current?.send(JSON.stringify({ type: "subscribe", ids }));
  const unsubscribe = () =>
    wsRef.current?.send(JSON.stringify({ type: "unsubscribe" }));

  return { fixes, subscribe, unsubscribe };
}
```

```tsx
// AntennaPanel.tsx
import { useGnss } from "./useGnss";

const GNSS_WS = "ws://10.10.10.1:9200/ws"; // adjust to your LAN address

export function AntennaPanel() {
  const { fixes } = useGnss(GNSS_WS);

  return (
    <ul>
      {Object.values(fixes).map((f) => {
        const ageMs = Date.now() - new Date(f.conn.lastByteAt).getTime();
        return (
          <li key={f.antennaId}>
            <strong>{f.label ?? f.antennaId}</strong>
            {" — "}
            {f.fix.status}
            {ageMs > 10_000 && " ⚠ stale"}
            <br />
            {f.llh.lat.toFixed(7)}°, {f.llh.lon.toFixed(7)}°
            {" · "}
            {f.utm.x.toFixed(2)} E / {f.utm.y.toFixed(2)} N ({f.utm.crs})
            {f.accuracy.sigmaLat != null && (
              <> · ±{f.accuracy.sigmaLat.toFixed(3)} m</>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

---

## Configuration notes for the frontend team

- **Host / port**: the server always listens on port `9200` inside Docker. The
  host-side port is configurable (`GNSS_HTTP_PORT` in `.env`). Ask the ops team
  for the actual address; do not hard-code `localhost`.
- **CRS**: the projected coordinate system is `EPSG:32635` by default (WGS84 /
  UTM zone 35N). The `utm.crs` field always carries the actual value — read it
  from the data rather than assuming a fixed CRS.
- **Coordinate units**: all distances are in **metres**, all angles in **decimal
  degrees**, all times in **ISO 8601 UTC strings**.
- **Update rate**: the GNSS receivers send one GGA sentence per second. Expect
  one `fix` WS message per connected antenna per second.
- **Multiple antennas**: the project currently has three antennas
  (`base-1`, `rover-1`, `rover-2`). The `antennaId` is the stable key. The
  `label` is the human name from `config/antennas.json`.
- **Accuracy budget**: for RTK_FIXED fixes with `accuracy.source === "GST"`,
  `utm.sigmaE` and `utm.sigmaN` give the 1-sigma (68%) horizontal uncertainty
  in metres. Multiply by ~2.45 for a 95% confidence circle radius.
