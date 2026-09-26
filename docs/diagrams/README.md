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
| `03-circuit-notes.md` | Notes and bill of materials for the schematic (paste as a table) |

**Editing:** open a `.drawio` file at app.diagrams.net (File → Open from → Device), in the draw.io
desktop app, or in VS Code with the *Draw.io Integration* extension. Export with
File → Export as → PNG (300 % zoom for print).

Pin assignments follow LilyGO's official T-SIM7600 definitions (modem, SD card and on-board pins
are reserved) and the Sensirion SEN5x pin-out.
