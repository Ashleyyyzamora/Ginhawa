# Circuit schematic: notes and bill of materials

Companion to `03-circuit-schematic.drawio` / `.png` (paste this as a table under the figure).

## Notes
1. **BT1 is the primary power source.** PV1 only recharges it through U1. BT1 is four LiFePO4 32700 cells in parallel (1S4P, 3.2 V, 24 Ah) with a 1S protection board (BMS).
2. **Common ground.** Use a common-negative solar charger so BAT−, OUT− and GND are one net.
3. **U4 (INA219)** sits in series with BT1+ (VIN+ → VIN−) and reports battery voltage and
   charge/discharge current on the I²C bus.
4. **I²C bus** (IO21 SDA / IO22 SCL) is shared by J1 SEN55 (0x69) and U4 INA219 (0x40).
   R3/R4 pull the bus up to 3.3 V; SEN55 I/O is 3.3 V compatible.
5. **C2** goes right at U3's 5 V pin to absorb LTE transmit current peaks (~2 A at 5 V, ~3.5 A drawn from the 3.2 V pack). Brief peaks can exceed the INA219's default ±3.2 A range; this is acceptable for daily energy logging.
6. **Do not wire** the on-board pins of the T-SIM7600: IO4 (PWRKEY), IO12 (LED), IO25–27 (modem),
   IO32–36 (modem / ADC), microSD IO2 and IO13–15. Free header pins: IO5, IO18, IO19, IO21, IO22, IO23.
7. **Wiring:** PV and battery wiring ≥ 18 AWG; keep the SEN55 cable short.

## Bill of materials
| Ref | Part | Qty |
|---|---|---|
| PV1 | Solar panel, 6 V 10 W | 1 |
| U1 | 1S LiFePO4 solar charger module, 3.6 V, ≥2 A | 1 |
| F1 | Fuse 5 A + inline holder | 1 |
| BT1 | LiFePO4 32700 cells 3.2 V 6 Ah (×4, parallel) + 1S BMS + holder | 1 set |
| U2 | DC-DC boost module, 3.2 V → 5 V, 3 A | 1 |
| C2 | Electrolytic capacitor, 1000 µF 16 V | 1 |
| U3 | LilyGO T-SIM7600 (SIM7600G-H) + nano-SIM | 1 |
| ANT1 | 4G LTE antenna, SMA + IPEX pigtail | 1 |
| U4 | INA219 current / voltage sensor module | 1 |
| J1 | Sensirion SEN55 + JST GHR-06V cable | 1 |
| R3, R4 | Resistor 4.7 kΩ | 2 |
| R5, R6 | Resistor 220 Ω | 2 |
| D1, D2 | LED 5 mm, red / green | 2 |
