// XIAO ESP32-S3 GNSS USB bridge
//
// Receiver (USB host, supplies the power) --USB-C--> XIAO (USB CDC device)
//                                                     |-- BLE Nordic UART notify
//                                                     '-- Wi-Fi TCP server
//
// Reads NMEA from the USB CDC port the receiver writes to, and re-emits each
// complete sentence on both transports the Ikaros app already speaks.

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <WiFi.h>

#include "secrets.h"

// Nordic UART Service — the UUIDs the app's bleSource looks for first.
static const char *NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static const char *NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // client -> bridge
static const char *NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // bridge -> client

static const uint16_t TCP_PORT = 9001; // same port the RS3 itself uses, for symmetry
static const size_t MAX_SENTENCE = 128;
static const uint8_t LED_PIN = LED_BUILTIN; // active LOW on the XIAO

// UART0 on D6/D7 (GPIO43/44) is the only console left once USB is the data port.
#define LOG Serial0

static NimBLECharacteristic *txChar = nullptr;
static bool bleConnected = false;
static WiFiServer tcpServer(TCP_PORT);
static WiFiClient tcpClient;

static char sentence[MAX_SENTENCE];
static size_t sentenceLen = 0;
static uint32_t totalBytes = 0, totalSentences = 0, droppedLong = 0;
static uint32_t lastStats = 0, lastData = 0;

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *server, ble_gap_conn_desc *desc) override {
    bleConnected = true;
    LOG.println("[ble] client connected");
  }
  void onDisconnect(NimBLEServer *server) override {
    bleConnected = false;
    LOG.println("[ble] client disconnected, advertising again");
    NimBLEDevice::startAdvertising();
  }
};

static void startBle() {
  NimBLEDevice::init(BLE_DEVICE_NAME);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);

  NimBLEServer *server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  NimBLEService *service = server->createService(NUS_SERVICE);
  txChar = service->createCharacteristic(NUS_TX, NIMBLE_PROPERTY::NOTIFY);
  // RX exists so request/response instruments (GeoCOM later) have a write path.
  service->createCharacteristic(NUS_RX, NIMBLE_PROPERTY::WRITE);
  service->start();

  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE);
  adv->setScanResponse(true);
  NimBLEDevice::startAdvertising();
  LOG.printf("[ble] advertising as \"%s\"\n", BLE_DEVICE_NAME);
}

static void startWifi() {
  if (strlen(WIFI_SSID) == 0) {
    LOG.println("[wifi] no SSID configured, skipping");
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  LOG.printf("[wifi] joining %s", WIFI_SSID);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    delay(250);
    LOG.print(".");
  }
  LOG.println();
  if (WiFi.status() == WL_CONNECTED) {
    tcpServer.begin();
    tcpServer.setNoDelay(true);
    LOG.printf("[wifi] %s — NMEA on tcp://%s:%u\n", WiFi.localIP().toString().c_str(),
               WiFi.localIP().toString().c_str(), TCP_PORT);
  } else {
    LOG.println("[wifi] failed; BLE only");
  }
}

// Push one complete sentence (without its line ending) to both transports.
static void emit(const char *line, size_t len) {
  totalSentences++;
  lastData = millis();

  if (bleConnected && txChar != nullptr) {
    // Keep each notification inside a default 23-byte ATT MTU payload if the
    // client never negotiated more; NimBLE splits on the negotiated MTU itself.
    txChar->setValue((uint8_t *)line, len);
    txChar->notify();
  }
  if (tcpClient && tcpClient.connected()) {
    tcpClient.write((const uint8_t *)line, len);
    tcpClient.write((const uint8_t *)"\r\n", 2);
  }
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH); // off

  LOG.begin(115200, SERIAL_8N1, 44, 43); // RX=GPIO44 (D7), TX=GPIO43 (D6)
  LOG.println("\n[boot] xiao-usb-bridge");

  Serial.begin(115200); // USB CDC; the host's line coding is nominal and ignored

  startBle();
  startWifi();
  LOG.println("[boot] waiting for NMEA on the USB CDC port");
}

void loop() {
  if (!tcpClient || !tcpClient.connected()) {
    WiFiClient incoming = tcpServer.accept();
    if (incoming) {
      tcpClient = incoming;
      tcpClient.setNoDelay(true);
      LOG.printf("[tcp] client from %s\n", tcpClient.remoteIP().toString().c_str());
    }
  }

  while (Serial.available() > 0) {
    int c = Serial.read();
    if (c < 0) break;
    totalBytes++;

    if (c == '\n' || c == '\r') {
      if (sentenceLen > 0) {
        sentence[sentenceLen] = '\0';
        emit(sentence, sentenceLen);
        sentenceLen = 0;
      }
    } else if (sentenceLen < MAX_SENTENCE - 1) {
      sentence[sentenceLen++] = (char)c;
    } else {
      // Overlong line: drop it rather than split a sentence across emissions.
      sentenceLen = 0;
      droppedLong++;
    }
  }

  // LED on while data has arrived within the last second.
  digitalWrite(LED_PIN, (millis() - lastData < 1000) ? LOW : HIGH);

  if (millis() - lastStats > 5000) {
    lastStats = millis();
    LOG.printf("[stats] %lu bytes, %lu sentences, %lu dropped | ble=%d tcp=%d\n",
               totalBytes, totalSentences, droppedLong, bleConnected ? 1 : 0,
               (tcpClient && tcpClient.connected()) ? 1 : 0);
  }
}
