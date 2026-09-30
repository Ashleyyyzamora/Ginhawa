# Circuit schematic: notes and bill of materials

Companion to `03-circuit-schematic.drawio` / `.png` (paste this as a table under the figure).

## Notes
1. **BT1 is the primary power source.** PV1 only recharges it through U1. BT1 is three 18650 Li-ion
   cells in parallel (1S3P, 3.7 V nominal, 9 Ah, ≈33 Wh) with a 1S protection board (BMS).
   Use genuine 3000 mAh cells of the same model and charge level (e.g. Samsung 30Q, LG HG2);
   cheap "9900 mAh" cells are fake.
2. **VBAT** is the battery rail on the charger side of F1 and U4 (3.0–4.2 V). U2, U5 and U6 all run
   from it, so U4 sees the whole station's current.
3. **Common ground.** Use a common-negative solar charger so BAT− and GND are one net.
   Net labels with the same name are connected.
4. **U4 (INA219)** sits in series with BT1+ (VIN+ → VIN−) and reports battery voltage and
   charge/discharge current on the I²C bus.
5. **I²C bus** (IO21 SDA / IO22 SCL) is shared by J1 SEN55 (0x69) and U4 INA219 (0x40).
   R3/R4 pull the bus up to 3.3 V; SEN55 I/O is 3.3 V compatible.
6. **U3 (ESP32 DevKit)** is powered from U2 through its 3V3 pin. Leave VIN unconnected and unplug
   USB in the field (USB 5 V would back-feed the 3.3 V rail through the on-board regulator).
7. **U6 (A7670 LTE)** runs directly from VBAT (3.4–4.2 V) and draws ~2 A peaks while transmitting;
   C2 goes right at its VBAT pin. Buy a breakout with 3.3 V UART level shifting and check that its band
   list includes B1, B3 and B28 (Globe / Smart). The firmware keeps it off while Wi-Fi works and does not
   start it below 3.5 V.
8. **U7 (GPS)** is powered through Q1 (P-MOSFET high-side switch). IO27 LOW turns it on; R7 keeps it off
   during boot. The firmware powers it for up to 90 s every 15 minutes.
9. **Pins to avoid on the DevKit:** strapping pins IO0, IO2, IO5, IO12, IO15 and flash pins IO6–IO11.
10. **Wiring:** PV and battery wiring ≥ 18 AWG; keep the SEN55 cable short.

## Bill of materials
| Ref | Part | Qty |
|---|---|---|
| PV1 | Solar panel, 6 V 6 W | 1 |
| U1 | CN3791 1-cell Li-ion solar charger module, 4.2 V | 1 |
| F1 | Fuse 5 A + inline holder | 1 |
| BT1 | 18650 Li-ion cells 3.7 V 3000 mAh (×3, parallel) + 1S BMS + 3-cell holder | 1 set |
| U2 | Buck-boost module, 3.3 V out, ≥1 A (e.g. TPS63020-based) | 1 |
| U5 | Boost module, 5 V out (MT3608) | 1 |
| C2 | Low-ESR electrolytic capacitor, 1000 µF 10 V | 1 |
| U3 | ESP32 DevKit V1 (ESP32-WROOM-32), already owned | 1 |
| U6 | SIMCom A7670 4G LTE Cat-1 breakout + nano-SIM | 1 |
| ANT1 | 4G LTE antenna, SMA + IPEX pigtail | 1 |
| U7 | GPS module ATGM336H (or u-blox NEO-M8N) with patch antenna | 1 |
| Q1 | P-channel MOSFET AO3401 (SOT-23 on adapter, or module) | 1 |
| U4 | INA219 current / voltage sensor module | 1 |
| J1 | Sensirion SEN55 + JST GHR-06V cable | 1 |
| R3, R4 | Resistor 4.7 kΩ | 2 |
| R7 | Resistor 10 kΩ | 1 |
| R5, R6 | Resistor 220 Ω | 2 |
| D1, D2 | LED 5 mm, red / green | 2 |
