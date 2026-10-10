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
7. **U6 (A7670SA, LTE + GNSS)** runs directly from VBAT (3.4–4.2 V) and draws ~2 A peaks while transmitting;
   C2 goes right at its VBAT pin. Buy it on a breakout with a nano-SIM slot, 3.3 V UART level shifting and
   antenna connectors (LTE on MAIN, GNSS on GNSS), and check that it is the GNSS version (A7670SA-FASE).
   Its bands include B1, B3 and B28 (Globe / Smart). The firmware keeps the modem off while Wi-Fi works,
   switches it on for up to 2 minutes every 15 minutes for a GPS fix, and does not start it below 3.5 V.
8. **No separate GPS module and no status LEDs:** GPS comes from U6, so GPIO25–27, IO18 and IO19 are free.
9. **Pins to avoid on the DevKit:** strapping pins IO0, IO2, IO5, IO12, IO15 and flash pins IO6–IO11.
10. **Wiring:** PV and battery wiring 18 AWG silicone, signal wiring 22 AWG; keep the SEN55 cable short.
11. **MT3608 (U5):** adjust it to 5.0 V with a multimeter *before* connecting the SEN55 (5 V ±10%).
12. **Battery pack:** the 3-cell holder connects the cells in parallel; do not solder directly onto the cells.

## Bill of materials
| Ref | Part | Qty |
|---|---|---|
| PV1 | Solar panel, 6 V 6 W monocrystalline | 1 |
| U1 | CN3791 1-cell Li-ion solar charger module (6 V panel, 4.2 V charge) | 1 |
| F1 | 5 A blade fuse + 16 AWG waterproof inline holder | 1 |
| BT1 | Samsung INR18650-30Q 3000 mAh (×3, parallel) + 1S 10 A BMS + 3-cell parallel holder | 1 set |
| U2 | TPS63802 buck-boost module, 3.3 V out | 1 |
| U5 | MT3608 boost module, set to 5.0 V | 1 |
| C2 | Low-ESR electrolytic capacitor, 1000 µF 10–16 V | 1 |
| U3 | ESP32 DevKit V1 (ESP32-WROOM-32), already owned | 1 |
| U6 | SIMCom A7670SA (LTE + GNSS) breakout + nano-SIM | 1 |
| ANT1, ANT2 | LTE antenna + GNSS antenna | 1 set |
| U4 | INA219 current / voltage sensor module | 1 |
| J1 | Sensirion SEN55 + JST GHR-06V cable | 1 |
| R3, R4 | Resistor 4.7 kΩ | 2 |
| — | 18 AWG and 22 AWG silicone wire, PG7 cable glands, PG7 vent, perfboard, headers, standoffs | — |
