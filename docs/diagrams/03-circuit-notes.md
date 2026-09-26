# Circuit schematic: notes and bill of materials

Companion to `03-circuit-schematic.drawio` / `.png` (paste this as a table under the figure).

## Notes
1. **BT1 is the primary power source.** PV1 only recharges it through U1.
2. **Common ground.** Use a common-negative charge controller so BAT−, LOAD− and GND are one net.
3. **U4 (INA219)** sits in series with BT1+ (VIN+ → VIN−) and reports battery voltage and
   charge/discharge current on the I²C bus.
4. **I²C bus** (IO21 SDA / IO22 SCL) is shared by J1 SEN55 (0x69) and U4 INA219 (0x40).
   R3/R4 pull the bus up to 3.3 V; SEN55 I/O is 3.3 V compatible.
5. **C2** goes right at U3's 5 V pin to absorb LTE transmit current peaks (~2 A).
6. **Do not wire** the on-board pins of the T-SIM7600: IO4 (PWRKEY), IO12 (LED), IO25–27 (modem),
   IO32–36 (modem / ADC), microSD IO2 and IO13–15. Free header pins: IO5, IO18, IO19, IO21, IO22, IO23.
7. **Wiring:** PV and battery wiring ≥ 18 AWG; keep the SEN55 cable short.

## Bill of materials
| Ref | Part | Qty |
|---|---|---|
| PV1 | Solar panel, 20 W, 12 V class | 1 |
| U1 | Solar charge controller, 12 V 10 A, LiFePO4 profile, common-negative | 1 |
| F1 | Fuse 5 A + inline holder | 1 |
| BT1 | LiFePO4 battery, 12.8 V 6 Ah | 1 |
| U2 | DC-DC buck module, 12 V → 5 V, 3 A | 1 |
| C2 | Electrolytic capacitor, 1000 µF 16 V | 1 |
| U3 | LilyGO T-SIM7600 (SIM7600G-H) + nano-SIM | 1 |
| ANT1 | 4G LTE antenna, SMA + IPEX pigtail | 1 |
| U4 | INA219 current / voltage sensor module | 1 |
| J1 | Sensirion SEN55 + JST GHR-06V cable | 1 |
| R3, R4 | Resistor 4.7 kΩ | 2 |
| R5, R6 | Resistor 220 Ω | 2 |
| D1, D2 | LED 5 mm, red / green | 2 |
