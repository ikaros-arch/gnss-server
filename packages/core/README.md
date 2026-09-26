# @ikaros-arch/gnss-core

The pure core of [gnss-server](https://github.com/ikaros-arch/gnss-server): NMEA-0183
parsing and normalisation into a single `Fix` object carrying WGS84 lon/lat/height, ECEF
XYZ, projected coordinates (default **EPSG:32635**, WGS84 / UTM 35N), 1-sigma accuracy and
RTK status. No Node APIs, no I/O — it runs unchanged in a browser, a WebView or a native
shell, so the same code that feeds gnss-server's WebSocket can turn a BLE or TCP receiver
into fixes client-side. Only dependency: `proj4`.

```bash
npm install @ikaros-arch/gnss-core
```

## Usage

```ts
import { FixAssembler, LineSplitter } from "@ikaros-arch/gnss-core";

const lines = new LineSplitter();                 // reassembles lines from chunks
const asm = new FixAssembler({
  antennaId: "RS4-rover",
  outputCrs: "EPSG:32635",
  transport: { remoteIp: "ble:AA:BB:CC", remotePort: 0 },
});

onChunk((chunk: string) => {                      // TCP segment, BLE notification, …
  for (const line of lines.push(chunk)) {
    const fix = asm.feed(line);                   // Fix on each GGA, null otherwise
    if (fix) render(fix);
  }
});
```

`feed()` remembers GST (measured sigmas), GSA (DOPs), RMC (date) and VTG (velocity) and folds
them into the next GGA. Without GST the accuracy is estimated from HDOP/VDOP and flagged
`accuracy.source = "ESTIMATED"`.

Other CRSs: `registerCrs("EPSG:25835", "+proj=utm +zone=35 +ellps=GRS80 …")` before
constructing the assembler. `projectLonLat` throws for an unregistered code.

## API

| Export | Purpose |
|---|---|
| `FixAssembler`, `FixAssemblerOptions` | sentences in, `Fix` out (one receiver per instance) |
| `LineSplitter`, `DEFAULT_MAX_LINE_BYTES` | chunk → complete lines, with overflow protection |
| `Fix` | the wire schema — documented in gnss-server's `docs/FRONTEND_INTEGRATION.md` |
| `parseGGA`, `parseGST`, `parseGSA`, `parseRMC`, `parseVTG`, `verifyChecksum` | individual sentence parsers (return `null` on bad checksum) |
| `llhToEcef`, `propagateSigmaToEcef`, `projectLonLat`, `registerCrs` | geodesy |

## Development

Lives in the `packages/core` workspace of gnss-server. From the repo root:
`npm test` (vitest resolves the package from source), `npm run build:core`,
`npm publish -w packages/core --access public`.
