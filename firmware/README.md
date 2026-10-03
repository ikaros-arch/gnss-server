# firmware/ — field devices that feed the GNSS server

Microcontroller firmware for the hardware that sits between a survey instrument and the
Ikaros app / this server. Kept beside the server so a receiver, a bridge and the server
can be configured as one system.

| Project | Board | Role |
|---|---|---|
| [`xiao-usb-bridge/`](xiao-usb-bridge/) | Seeed XIAO ESP32-S3 | USB-serial instrument → BLE Nordic UART + Wi-Fi TCP |

## Why a bridge at all

The app can consume NMEA from three transports: BLE Nordic UART, TCP, and (on Android)
Bluetooth Classic. Instruments that speak none of those need translating:

- **Reach RS3** — now known to need **no bridge**: its USB-C is a composite CDC gadget whose
  ECM half gives a wired IP link with DHCP (receiver at `192.168.2.15`), and its own TCP
  server serves NMEA on 9001 over that cable. Bridge only needed where USB networking is
  unavailable.
- **ArduSimple RTK Smart Antenna** — USB only, **no network function at all**. Its ZED-F9P
  presents pure CDC-ACM (`1546:01ab`) with NMEA flowing untouched, but sits *behind an
  internal USB2514 hub*, so a host-mode bridge would need external-hub support.
- **Total stations** (Leica GSI/GeoCOM, Topcon) — RS-232/DB9, so they will always need the
  MAX3232 input rather than USB.

## xiao-usb-bridge

The XIAO is the USB **device**; the receiver is the **host** and supplies the power, so the
bridge needs no battery. On the receiver: Emlid Flow → Position streaming → Serial →
**USB OTG**, NMEA. The configured baud (38400) is nominal over USB CDC and is ignored.

Every complete sentence is re-emitted on:

- **BLE Nordic UART** (`6e400001…`, TX `6e400003…`) — what the app's `bleSource` reads with
  no changes; an RX characteristic exists for request/response instruments later.
- **Wi-Fi TCP server on 9001** — the app's other transport, and how to watch the stream from
  a laptop during bench work.

### Build and flash

PlatformIO lives in a virtualenv in this directory (never installed globally):

```bash
python -m venv firmware/.venv              # once
firmware/.venv/bin/python -m pip install platformio
cd firmware/xiao-usb-bridge
cp src/secrets.example.h src/secrets.h     # fill in Wi-Fi, or leave SSID empty for BLE only
../.venv/bin/pio run                       # compile
../.venv/bin/pio run -t upload             # flash over USB
```

### The one-port problem

The XIAO's single USB-C port is the data port, so while it is attached to a receiver there is
no console and no flashing. Unplug it to flash, and watch logs on **UART0 — D6/D7
(GPIO43/44)** with a USB-TTL adapter at 115200. The firmware prints a counter line every 5 s
(bytes, sentences, dropped, BLE/TCP client state) and lights the user LED while data is
arriving, which is enough to confirm a stream with no adapter at all.

### Powering

A USB host must source VBUS. The receiver does that here, which is the whole point. In the
reverse arrangement (XIAO as host) the XIAO cannot source 5 V — its 5 V pad is wired straight
to the USB-C VBUS line and the SGM4056 charger input, so external 5 V must be injected there,
and a USB-C→USB-A-female OTG adapter is needed to present the Rp pull-up a receiver looks for.

Background, test results and the decision trail: `Ikaros iOS App` in the hri-knowledgebase
vault.
