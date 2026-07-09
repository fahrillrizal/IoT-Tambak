#include <Wire.h>
#include <WiFi.h>
#include <Arduino_MQTT_Client.h>
#include <ThingsBoard.h>
#include <Server_Side_RPC.h>
#include <Adafruit_ADS1X15.h>
#include <math.h>
#include "HX711.h"
#include <ESP32Servo.h>
#include <TM1637Display.h>

#define CLK 16
#define DIO 12
#define BUZZER 5
#define BAT_PIN 33
#define TEMP_PIN 34
#define RELAY_PIN 19
#define SERVO_PIN 17
#define RELAY2_PIN 18

#define WIFI_SSID "WIFI_NAME"
#define WIFI_PASSWORD "WIFI_PASSWORD"
#define TOKEN "TOKEN_TB"
#define THINGSBOARD_SERVER "IPSERVER"
#define THINGSBOARD_PORT 1883

const int LOADCELL_DOUT_PIN = 26;
const int LOADCELL_SCK_PIN = 27;

// ====== Konfigurasi buffer & RPC ThingsBoard ======
constexpr uint16_t MAX_MESSAGE_SEND_SIZE = 256U;
constexpr uint16_t MAX_MESSAGE_RECEIVE_SIZE = 256U;
constexpr uint8_t MAX_RPC_SUBSCRIPTIONS = 2U;
constexpr uint8_t MAX_RPC_RESPONSE = 5U;

WiFiClient wifiClient;
Arduino_MQTT_Client mqttClient(wifiClient);

Server_Side_RPC<MAX_RPC_SUBSCRIPTIONS, MAX_RPC_RESPONSE> rpc;
IAPI_Implementation *apis[1U] = { &rpc };

ThingsBoard tb(mqttClient, MAX_MESSAGE_RECEIVE_SIZE, MAX_MESSAGE_SEND_SIZE, Default_Max_Stack_Size, apis + 0U, apis + 1U);

Adafruit_ADS1115 ads;
HX711 scale;
Servo myservo;
TM1637Display display(CLK, DIO);

// baterai
float divider = 4.3;
const float VOLT_MAX = 7.9;
const float VOLT_MIN = 6.0;
const int BAT_PERCENT_THRESHOLD = 15;

// salinits
const float SAL_SLOPE = 9.469;
const float SAL_INTERCEPT = -5.019;

// pH (2 titik kalibrasi) -> ISI dengan tegangan hasil pengukuran nyata
const float VOLT_PH7 = 2.521;
const float VOLT_PH4 = 3.064;

#define SERIES_RESISTOR 10000
#define NOMINAL_RESISTANCE 10000
#define NOMINAL_TEMPERATURE 25
#define B_COEFFICIENT 3950

#define TWO_POINT_CALIBRATION 0
#define DO_CAL1_V 1215.82
#define DO_CAL1_T 25
#define DO_CAL2_V 0.0
#define DO_CAL2_T 0.0

const uint16_t DO_Table[41] = {
  14460, 14220, 13820, 13440, 13090, 12740, 12420, 12110, 11810, 11530,
  11260, 11010, 10770, 10530, 10300, 10080, 9860, 9660, 9460, 9270,
  9080, 8900, 8730, 8570, 8410, 8250, 8110, 7960, 7820, 7690,
  7560, 7430, 7300, 7180, 7070, 6950, 6840, 6730, 6630, 6530, 6410
};

// load cell
const float FAKTOR_KALIBRASI_LOADCELL = 9.1599;
const float THRESHOLD_AUTO_RESET = 1.5;
const float TARGET_PENGURANGAN_PAKAN = 200.0;  // gram (default kalau AI tidak kirim "amount")

const int SERVO_TUTUP = 160;
const int SERVO_BUKA = 90;

// Filter Moving Average
#define MA_SIZE 5
float maSal[MA_SIZE] = { 0 }, maTur[MA_SIZE] = { 0 }, maPH[MA_SIZE] = { 0 };
float maTemp[MA_SIZE] = { 0 }, maDO[MA_SIZE] = { 0 };
int maSalIdx = 0, maTurIdx = 0, maPHIdx = 0, maTempIdx = 0, maDOIdx = 0;

unsigned long lastSend = 0;

// ====== Status RPC & perintah pakan dari AI/Web ======
bool subscribed = false;
bool feedingRequested = false;
float feedingTargetGram = TARGET_PENGURANGAN_PAKAN;

// Bulatkan ke 2 angka di belakang koma
float round2(float x) {
  if (isnan(x)) return 0.0f;
  return roundf(x * 100.0f) / 100.0f;
}

float movingAverage(float *buffer, int &index, float newVal) {
  buffer[index] = newVal;
  index = (index + 1) % MA_SIZE;
  float sum = 0;
  for (int i = 0; i < MA_SIZE; i++) sum += buffer[i];
  return sum / MA_SIZE;
}

float readVoltageAvg(int channel, int samples = 10) {
  float total = 0;
  for (int i = 0; i < samples; i++) {
    int16_t adc = ads.readADC_SingleEnded(channel);
    total += adc * (4.096 / 32768.0);
    delay(5);
  }
  return total / samples;
}

float voltageToSalinity(float voltage) {
  float sal = (SAL_SLOPE * voltage) + SAL_INTERCEPT;
  return constrain(sal, 0.0, 60.0);
}

float voltageToNTU(float v) {
  float v1 = 3.500, ntu1 = 5;
  float v2 = 3.456, ntu2 = 100;
  float v3 = 3.070, ntu3 = 200;
  float ntu;
  if (v >= v1) return 5;
  if (v >= v2) ntu = ntu1 + (ntu2 - ntu1) * (v1 - v) / (v1 - v2);
  else ntu = ntu2 + (ntu3 - ntu2) * (v2 - v) / (v2 - v3);
  return constrain(ntu, 0, 1000);
}

float voltageToTemp(float voltage) {
  if (voltage <= 0.05 || voltage >= 3.25) return -999.0;
  float resistance = SERIES_RESISTOR / ((3.3 / voltage) - 1.0);
  float steinhart = resistance / NOMINAL_RESISTANCE;
  steinhart = log(steinhart);
  steinhart /= B_COEFFICIENT;
  steinhart += 1.0 / (NOMINAL_TEMPERATURE + 273.15);
  steinhart = 1.0 / steinhart;
  return steinhart - 273.15;
}

float voltageToPH(float vRaw) {
  if (VOLT_PH7 == VOLT_PH4) {
    return 0.0;
  }

  float ph = 7.0 + (vRaw - VOLT_PH7) * (4.0 - 7.0) / (VOLT_PH4 - VOLT_PH7);

  return constrain(ph, 0.0, 14.0);
}

float voltageToDO(float voltageVolt, uint8_t temperature) {
  float voltage_mV = voltageVolt * 1000.0;
  uint16_t V_saturation;
#if TWO_POINT_CALIBRATION == 0
  V_saturation = (uint32_t)DO_CAL1_V + (uint32_t)35 * temperature - (uint32_t)DO_CAL1_T * 35;
#else
  V_saturation = ((int16_t)temperature - DO_CAL2_T) * ((int16_t)DO_CAL1_V - DO_CAL2_V) / ((int16_t)DO_CAL1_T - DO_CAL2_T) + DO_CAL2_V;
#endif
  return ((voltage_mV * DO_Table[temperature]) / V_saturation);
}

float readESP32Voltage(int pin, int samples = 10) {
  long total = 0;
  for (int i = 0; i < samples; i++) {
    total += analogRead(pin);
    delay(2);
  }
  float adc = total / (float)samples;
  return adc * (3.3 / 4095.0);
}

// ====== Callback RPC: 'triggerFeeding' ======
void processTriggerFeeding(const JsonVariantConst &data, JsonDocument &response) {
  float target = TARGET_PENGURANGAN_PAKAN;

  if (data.is<JsonObjectConst>()) {
    target = data["amount_g"] | TARGET_PENGURANGAN_PAKAN;
  } else {
    target = data.as<float>();
  }
  if (target <= 0.0f) target = TARGET_PENGURANGAN_PAKAN;

  feedingTargetGram = target;
  feedingRequested = true;

  Serial.print(">> [RPC] Perintah 'triggerFeeding' diterima. Target pakan: ");
  Serial.print(feedingTargetGram, 1);
  Serial.println(" gram");

  response["status"] = "accepted";
  response["target_gram"] = feedingTargetGram;
}

const RPC_Callback rpcCallbacks[1U] = {
  { "triggerFeeding", processTriggerFeeding }
};

void InitWiFi() {
  Serial.println("Menghubungkan ke AP...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Terhubung!");
}

// ====== Eksekusi pemberian pakan ======
void jalankanFeeder(float targetGram) {
  Serial.println(">> [AI/WEB] Memulai siklus feeder...");
  Serial.print("   Target pengurangan pakan: ");
  Serial.print(targetGram, 1);
  Serial.println(" gram");

  float beratAwal = 0.0;
  if (scale.wait_ready_timeout(500)) {
    beratAwal = scale.get_units(5);
  }

  digitalWrite(RELAY_PIN, HIGH);
  digitalWrite(RELAY2_PIN, HIGH);
  delay(100);
  myservo.write(SERVO_BUKA);

  bool targetTercapai = false;
  float pakanKeluar = 0.0;
  unsigned long waktuMulaiMakan = millis();

  while (!targetTercapai) {
    if (scale.wait_ready_timeout(100)) {
      float beratSekarang = scale.get_units(3);
      pakanKeluar = beratAwal - beratSekarang;

      Serial.print("   [FEEDING REALTIME] Berkurang: ");
      Serial.print(pakanKeluar, 1);
      Serial.print(" g / Target: ");
      Serial.print(targetGram, 1);
      Serial.println(" g");

      if (pakanKeluar >= targetGram) {
        targetTercapai = true;
        Serial.println("   [BERHASIL] Target pengurangan pakan tercapai.");
      }
    }

    if (millis() - waktuMulaiMakan > 15000UL) {
      targetTercapai = true;
      Serial.println("   [TIMEOUT SAFETY] Batas waktu habis, katup dipaksa tutup.");
    }

    tb.loop();
    delay(500);
  }

  myservo.write(SERVO_TUTUP);
  delay(500);
  digitalWrite(RELAY_PIN, LOW);
  digitalWrite(RELAY2_PIN, LOW);
  Serial.println(">> Siklus Feeder selesai. Katup terkunci & motor pelempar mati.");

  if (tb.connected()) {
    tb.sendTelemetryData("feeding_done", round2(pakanKeluar));
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  pinMode(BUZZER, OUTPUT);
  analogReadResolution(12);
  display.setBrightness(7);

  InitWiFi();

  if (!ads.begin()) {
    Serial.println("ADS1115 tidak terdeteksi!");
    while (1)
      ;
  }
  ads.setGain(GAIN_ONE);

  myservo.attach(SERVO_PIN);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  digitalWrite(RELAY2_PIN, LOW);
  myservo.write(SERVO_TUTUP);

  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale.set_scale(FAKTOR_KALIBRASI_LOADCELL);

  Serial.println("[PROSES] Mengunci titik nol awal Load Cell...");
  if (scale.wait_ready_timeout(1000)) {
    scale.tare(20);
    Serial.println("[SUKSES] Load Cell siap digunakan.");
  } else {
    Serial.println("Peringatan: HX711 tidak terdeteksi saat startup.");
  }

  Serial.println("Sistem Monitoring dan Otomasi Tambak Siap.");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    InitWiFi();
    subscribed = false;
  }

  if (!tb.connected()) {
    subscribed = false;
    Serial.print("Menghubungkan ke ThingsBoard Server...");
    if (!tb.connect(THINGSBOARD_SERVER, TOKEN, THINGSBOARD_PORT)) {
      Serial.println(" GAGAL");
      delay(1000);
    } else {
      Serial.println(" BERHASIL");
    }
  }

  if (tb.connected() && !subscribed) {
    Serial.println("Subscribing RPC: triggerFeeding ...");
    if (rpc.RPC_Subscribe(rpcCallbacks + 0U, rpcCallbacks + 1U)) {
      Serial.println(">> RPC siap. Menunggu perintah pakan dari AI/Web.");
      subscribed = true;
    } else {
      Serial.println(">> Gagal subscribe RPC, dicoba lagi nanti.");
    }
  }

  // data sensor
  float vPH = readVoltageAvg(0);
  float vDO = readVoltageAvg(1);
  float vSal = readVoltageAvg(2);
  float vTur = readVoltageAvg(3);
  float vTemp = readESP32Voltage(TEMP_PIN);

  float temp = movingAverage(maTemp, maTempIdx, voltageToTemp(vTemp));
  float salinitas = movingAverage(maSal, maSalIdx, voltageToSalinity(vSal));
  float ntu = movingAverage(maTur, maTurIdx, voltageToNTU(vTur));
  float ph = movingAverage(maPH, maPHIdx, voltageToPH(vPH));
  float tempConst = constrain(temp, 0.0, 40.0);
  float rawDO = voltageToDO(vDO, (uint8_t)tempConst) / 1000.0;
  float dissolvedOxygen = movingAverage(maDO, maDOIdx, rawDO);

  float sisaPakan = 0.0;
  if (scale.wait_ready_timeout(200)) {
    sisaPakan = scale.get_units(5);
    if (sisaPakan < THRESHOLD_AUTO_RESET && sisaPakan > -THRESHOLD_AUTO_RESET) {
      sisaPakan = 0.0;
    } else if (sisaPakan <= -THRESHOLD_AUTO_RESET) {
      scale.tare(10);
      sisaPakan = 0.0;
      Serial.println("[AUTO-RESET] Timbangan diseimbangkan kembali ke 0.0...");
    }
  }

  // ===== DEBUG: tegangan mentah ADS1115 (untuk kalibrasi pH & turbidity) =====
  Serial.print("RAW V -> pH(A0): ");
  Serial.print(vPH, 4);
  Serial.print(" | DO(A1): ");
  Serial.print(vDO, 4);
  Serial.print(" | SAL(A2): ");
  Serial.print(vSal, 4);
  Serial.print(" | TUR(A3): ");
  Serial.print(vTur, 4);
  Serial.print(" | TEMP: ");
  Serial.println(vTemp, 4);

  // serial monitor (nilai terkonversi)
  Serial.print("SAL: ");
  Serial.print(salinitas, 2);
  Serial.print(" ppt | ");
  Serial.print("TUR: ");
  Serial.print(ntu, 2);
  Serial.print(" NTU | ");
  Serial.print("TEMP: ");
  Serial.print(temp, 2);
  Serial.print(" C | ");
  Serial.print("pH: ");
  Serial.print(ph, 2);
  Serial.print(" | ");
  Serial.print("DO: ");
  Serial.print(dissolvedOxygen, 2);
  Serial.print(" mg/L | ");
  Serial.print("PAKAN: ");
  Serial.print(sisaPakan, 2);
  Serial.println(" gram");

  // ===== Pemberian pakan HANYA dari perintah AI/Web (RPC) =====
  if (feedingRequested) {
    feedingRequested = false;
    jalankanFeeder(feedingTargetGram);
  } else {
    digitalWrite(RELAY_PIN, LOW);
    digitalWrite(RELAY2_PIN, LOW);
    myservo.write(SERVO_TUTUP);
  }

  // Baterai
  int adc = analogRead(BAT_PIN);
  float v_adc = adc * 3.3 / 4095.0;
  float v_bat = v_adc * divider;
  int show1 = v_bat * 100;

  float battery_percentage = ((v_bat - VOLT_MIN) / (VOLT_MAX - VOLT_MIN)) * 100.0;
  battery_percentage = constrain(battery_percentage, 0.0, 100.0);

  int show = (int)battery_percentage;
  display.showNumberDecEx(show1, 0b01000000, true);

  if (show <= BAT_PERCENT_THRESHOLD) {
    digitalWrite(BUZZER, HIGH);
  } else {
    digitalWrite(BUZZER, LOW);
  }

  Serial.print("BATTERY VOLTAGE: ");
  Serial.print(v_bat);
  Serial.print(" V | ");
  Serial.print("CAPACITY: ");
  Serial.print(show);
  Serial.println(" %");

  // ===== Kirim SEMUA telemetry dalam SATU payload (dibulatkan 2 desimal) =====
  if (millis() - lastSend > 3000) {
    if (tb.connected()) {
      constexpr size_t TELEMETRY_SIZE = 7U;
      Telemetry telemetry[TELEMETRY_SIZE] = {
        { "temperature", round2(temp) },
        { "ph", round2(ph) },
        { "dissolvedOxygen", round2(dissolvedOxygen) },
        { "salinity", round2(salinitas) },
        { "turbidity", round2(ntu) },
        { "sisaPakan", round2(sisaPakan) },
        { "battery", show }
      };

      if (tb.sendTelemetry<TELEMETRY_SIZE>(telemetry + 0U, telemetry + TELEMETRY_SIZE)) {
        Serial.println(">> [SUCCESS] Semua telemetry terkirim dalam 1 payload.");
      } else {
        Serial.println(">> [ERROR] Gagal mengirim data telemetry ke ThingsBoard.");
      }
    }
    lastSend = millis();
  }

  tb.loop();
  delay(300);
}