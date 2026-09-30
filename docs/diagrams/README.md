# Ginhawa diagrams

Editable [draw.io](https://app.diagrams.net) files with PNG exports for the paper. All figures use a white
background and are sized so text stays about 8 pt or larger when the image is placed at full page width
(6.5 in). Insert the PNGs at 100 % page width; the captions ("Figure X") go in the paper.

| File | Figure |
|---|---|
| `00-agile-scrum-methodology.svg` / `.png` | Agile Scrum methodology (infographic; SVG editable in Figma, Inkscape, draw.io) |
| `01-system-architecture.drawio` / `.png` | System architecture (deployment view): station, connectivity, Docker server, clients |
| `02-node-block-diagram.drawio` / `.png` | Monitoring station hardware block diagram (power, data, RF paths) |
| `03-circuit-schematic.drawio` / `.png` | Circuit schematic with pin numbers and title block |
| `04-erd` | Entity-relationship diagram (crow's-foot) |
| `05-use-case` | Use case diagram (human actors only) |
| `06-context` | Context diagram (Gane–Sarson) |
| `07-dfd-level1` | Level 1 data flow diagram (Gane–Sarson) |
| `08-flowchart` | System flowchart (ANSI symbols) |
| `09-gantt-chart.png` | Project Gantt chart |
| `03-circuit-notes.md` | Notes and bill of materials for the schematic (paste as a table) |

**Editing:** open a `.drawio` file at app.diagrams.net (File → Open from → Device), in the draw.io
desktop app, or in VS Code with the *Draw.io Integration* extension. Export with
File → Export as → PNG (300 % zoom for print).

Pin assignments use a standard ESP32 DevKit V1 (ESP32-WROOM-32), avoiding its strapping and flash pins,
and follow the Sensirion SEN5x pin-out.
