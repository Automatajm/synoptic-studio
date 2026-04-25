# Synoptic Studio — Power BI Custom Visual

<p align="center">
  <img src="assets/banner.png" alt="Synoptic Studio Banner" width="800"/>
</p>

<p align="center">
  <a href="https://github.com/Automatajm/synoptic-studio/releases"><img src="https://img.shields.io/github/v/release/Automatajm/synoptic-studio?color=00e5a0&label=version" alt="Version"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-00e5a0" alt="License"/></a>
  <a href="https://github.com/Automatajm/synoptic-studio/issues"><img src="https://img.shields.io/github/issues/Automatajm/synoptic-studio?color=38bdf8" alt="Issues"/></a>
</p>

> **A configurable synoptic map visual for Power BI.** Place any object on a canvas, define color rules against your data, and get instant cross-filtering — built for operations teams who need to see their physical world in data.

---

## What is Synoptic Studio?

Synoptic Studio renders the physical world of your business — greenhouses, hotel rooms, dental seats, parking spots, factory stations, server racks, theater seats — as a live, color-coded, cross-filterable map.

You provide:
- A list of objects with IDs (`A01`, `Rack-04`, `Seat-12B`)
- Their physical positions on the canvas (X, Y, width, height)
- A primary metric (occupancy %, status, alert level)
- Color rules that drive how each object looks

The visual produces a synoptic map that updates in real time, supports rotation, zoom, pan, dark/light themes, and acts as a slicer for the rest of your report.

### Built for operations teams

Originally designed for large-scale ornamental plant production, Synoptic Studio solves the core problem of any field operations dashboard:

> *"I need to see the status of every physical location at a glance, colored by what matters today."*

---

## Use case examples

| Industry | Object | Main Value | Text Field 1 | Tooltip Fields |
|---|---|---|---|---|
| Agriculture | Greenhouse | Occupancy % | Status | Empty beds, plants, m² |
| Hospitality | Hotel room | Occupancy % | Status | Guest, check-out, rate |
| Healthcare | Dental seat | Health % | Tooth condition | Last visit, treatment plan |
| Aviation | Aircraft seat | Booked | Class | Passenger, special meal |
| Manufacturing | Workstation | Utilization % | Status | Operator, output, downtime |
| Data Center | Server rack | CPU load % | Health | Temperature, alerts, uptime |
| Retail | Parking spot | Occupied | Status | Vehicle, time parked |

---

## Key Features

| Feature | Description |
|---|---|
| **Color Rules Engine** | Built-in editor — no JSON required. Add rules with operators (`=`, `≠`, `>`, `≥`, `<`, `≤`, `between`). First match wins. Rules persist across reload, close/reopen, and report publishing. |
| **Smart between operator** | Single-input syntax: `"3, 8"`, `"[3, 8]"`, `"3..8"`, `"3 - 8"`. Auto-sorts. Live red-border validation. |
| **Curated 14-color palette** | Neutrals first (carbon, slate, white), then semaphore order (red, orange, amber, green, teal), then accents. All work in light and dark themes. |
| **Multi-field tooltips** | Single `Tooltip Fields` bucket accepts measures, dates, and text in any combination. Auto-detects type. Strips PBI prefixes (`Sum of`, `Avg of`) by default while respecting user renames. Order preserved from drag sequence. |
| **Theme adaptation** | Detects active Power BI report theme via `host.colorPalette.background` and adapts text, fills, and contrast automatically. WCAG luminance for value text legibility. |
| **Fixed layout** | Assign X, Y, W, H coordinates to each object via dataset columns. The visual renders at exact positions. Auto-grid fallback when coordinates aren't provided. |
| **Pan, Zoom, Rotation** | Mouse wheel zoom, drag-to-pan, `+`/`−` buttons. Rotation (0°, 90°, 180°, 270°) recalculates fit-to-viewport at every angle. Rotation persists across reload. |
| **Compass with fixed stator** | The ring and N/S/E/W letters stay screen-anchored; only the needle rotates to point to map north. |
| **Adaptive labels** | Identity-first hierarchy in compact cells: when space is limited, the Label is shown over the Value. 3-level inline cascade auto-collapses based on width. |
| **Multi-select legend** | `Click` on a legend chip filters by that rule. `Ctrl+click` adds another (union semantics). Re-click toggles off. Click on canvas background clears all. |
| **Mobile-friendly toolbars** | Both the controls bar and legend bar are horizontally scrollable with hidden scrollbar. Translucent edge arrows appear only when overflow exists. Wheel translates vertical-to-horizontal. |
| **Cross-filtering** | Click any object to filter the rest of the report. Ctrl+click for multi-select. Selection persists across visual interactions. |
| **Smart help banner** | Appears automatically when an aggregated `Main Value` (`Sum of`, `Avg of`, etc.) is bound — alerts users about the standard PBI behavior of filtering rows with null measures, with a one-click dismissal. |

---

## Getting Started

### Installation

1. Download the latest `.pbiviz` file from [Releases](https://github.com/Automatajm/synoptic-studio/releases)
2. In Power BI Desktop: **Visualizations pane → ··· → Import a visual from a file**
3. Select the `.pbiviz` file and accept the security prompt
4. The Synoptic Studio icon appears in your visualizations panel

### Quick start

#### 1. Bind your fields

| Field | Required | What it is |
|---|---|---|
| **Object ID** | Yes | Unique identifier per object |
| **Label** | No | Display name shown inside each object (defaults to Object ID) |
| **Main Value** | No | Numeric metric (0–100) that drives the fill bar |
| **Text Field 1** | No | Categorical field used by color rules (e.g. Status) |
| **Tooltip Fields** | No | Drag any number of fields here to show in the tooltip |
| **Layout X / Y / W / H** | Recommended | Object position and size on the canvas |

> **Important:** Set **Layout X / Y / W / H** columns to **Don't Summarize** in the Power BI model (Column tools → Summarization → Don't summarize). They are coordinates, not metrics to aggregate.

#### 2. Configure color rules

Click the **gear icon** (⚙) in the top-left of the visual to open the Color Rules editor. Defaults are seeded on first use:

- **Low** — Main Value < 40 → red
- **Medium** — Main Value between 40 and 70 → amber
- **High** — Main Value ≥ 70 → green

Modify, reorder, or delete these to fit your domain. Rules persist across reload and report publishing.

#### 3. Interact

| Action | Effect |
|---|---|
| Click an object | Select it (cross-filters the rest of the report) |
| `Ctrl+click` an object | Multi-select |
| Click a legend chip | Filter all objects matching that rule |
| `Ctrl+click` a legend chip | Add another rule to the filter (union) |
| Click on canvas background | Clear all selection and filters |
| Mouse wheel | Zoom |
| Click + drag empty space | Pan |
| Rotation buttons (`0°`/`90°`/`180°`/`270°`) | Rotate the canvas; content auto-fits the new orientation |
| `↺` button | Reset zoom, pan, and rotation |

---

## Troubleshooting

### Some objects don't appear in the map

**Cause:** Power BI core filters out rows where the Main Value (or any other measure in the visual) returns blank/null after aggregation. This is the documented Power BI default behavior — it applies to all visuals.

**Solution:** Enable **Show items with no data** on your fields.

1. In the Power BI Visualizations panel, find a field bucket (Object ID, or any Layout field).
2. Click the dropdown arrow next to the field name (or right-click).
3. Select **Show items with no data**.
4. Repeat for `Object ID` and each of the four `Layout` fields.

After enabling, all rows from your source table will appear, including those with null measures. Objects without a Main Value will display in the fallback color (carbon gray) — they show that the infrastructure exists but is not currently being measured.

> **Help banner:** When you bind an aggregated measure (`Sum of …`, `Avg of …`, etc.) to Main Value, Synoptic Studio shows a banner reminding you about this option. Click ✕ to dismiss.

### Layout coordinates show as 1, 2, 3... instead of real positions

**Cause:** Power BI is summarizing your Layout X/Y/W/H columns.

**Solution:** Right-click each Layout column → **Don't Summarize**.

### Rules don't persist after closing the report

**Cause:** This was an issue in earlier versions; resolved in v1.0+.

**Solution:** Update to the latest version. Rules persist via Power BI's `persistProperties` API and survive close/reopen.

### Rotation resets after reload

**Cause:** This was an issue in v1.0; resolved in v1.1.

**Solution:** Update to v1.1 or later. Rotation now persists across reload and report publishing.

---

## Settings reference

### General

| Setting | Default | Effect |
|---|---|---|
| Show label | On | Toggle the object name inside each cell |
| Show main value | On | Toggle the metric value inside each cell |
| Default color | `#4a5560` (carbon) | Color used when no rule matches |

### Color Rules (gear icon)

| Property | Description |
|---|---|
| Field | Which field to evaluate (`Main Value` or `Text Field 1`) |
| Operator | `=`, `≠`, `>`, `≥`, `<`, `≤`, `between` |
| Value | The threshold or category to match. For `between`, accepts `"3, 8"`, `"[3, 8]"`, `"3..8"`, `"3 - 8"` |
| Color | Pick from the curated 14-color palette |
| Label | Display name for the rule (shown in legend and tooltip badge) |
| Order | Use ↑↓ to reorder; first match wins |
| Enabled | Toggle without deleting |

---

## Layout coordinates

Layout X / Y / W / H define the position and size of each object on the canvas, in pixels. The visual auto-scales the entire canvas to fit the available space, preserving aspect ratio.

```
Object ID  | Layout_X | Layout_Y | Layout_W | Layout_H
-----------|----------|----------|----------|----------
A01        |       20 |       12 |       22 |       46
A02        |       46 |       12 |       22 |       46
A03        |       72 |       12 |       22 |       46
...
```

**Tips:**
- Use a single coordinate space for all objects (e.g. 0–1000 wide, 0–500 tall).
- Aspect ratio matters — design at the ratio your visual will be rendered.
- Don't summarize these columns — set to **Don't Summarize** in Power BI.

### GPS coordinates

If your objects have real GPS coordinates, convert them to canvas coordinates using DAX calculated columns:

```dax
Layout_X =
VAR lon_min = -68.9900
VAR lon_max = -68.9750
VAR canvas_w = 1400
RETURN
    DIVIDE([Longitude] - lon_min, lon_max - lon_min) * canvas_w

Layout_Y =
VAR lat_min = 18.4180
VAR lat_max = 18.4260
VAR canvas_h = 620
RETURN
    DIVIDE(lat_max - [Latitude], lat_max - lat_min) * canvas_h
```

---

## Browser & Power BI compatibility

| Environment | Status |
|---|---|
| Power BI Desktop (Windows) | ✓ Full support |
| Power BI Service (browser) | ✓ Full support |
| Power BI Mobile (iOS / Android) | ✓ Full support |
| Power BI Embedded | ✓ Full support |

Adapts automatically to the active Power BI report theme (light / dark / high contrast / custom).

---

## Architecture

```
SynopticStudio/
├── src/
│   ├── visual.ts          # Core visual — rendering, pan/zoom/rotate, events
│   └── settings.ts        # Format pane settings model
├── style/
│   └── visual.less        # Minimal styles
├── capabilities.json      # Data roles and mappings (table mapping)
├── pbiviz.json            # Visual metadata
└── assets/
    └── icon.png           # 20×20 visual icon
```

### Data flow

```
Power BI DataView (table mapping)
      ↓
  update() — parse rows by role; capture column metadata
      ↓
  Color rules engine — evalRule() per object
      ↓
  Layout engine — fixed coords or auto-grid; rotation-aware fit
      ↓
  SVG render — separate layers for shapes (rotates) and labels/fills (upright)
      ↓
  Events — hover tooltip, click cross-filter, multi-select legend filter
```

### Why `table` mapping?

Power BI custom visuals can use either `categorical` or `table` mapping for data binding. Synoptic Studio uses `table` because:

- It preserves every row from the source table (no implicit grouping)
- Respects the user's `Show items with no data` setting consistently
- Matches the natural mental model of "one object per row"
- Avoids edge cases where aggregated measures cause silent row filtering

---

## Building from Source

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
git clone https://github.com/Automatajm/synoptic-studio.git
cd synoptic-studio

npm install -g powerbi-visuals-tools
pbiviz install-cert

cd synopticStudio
npm install
```

### Development

```bash
pbiviz start    # Live development server (requires Power BI Desktop)
```

### Build

```bash
pbiviz package  # Generates dist/synopticStudio.pbiviz
```

---

## Comparison with OKViz Synoptics Panel

| Feature | OKViz Synoptics Panel | Synoptic Studio |
|---|---|---|
| Custom layout | Via SVG editor tool | Via X,Y,W,H columns in dataset |
| Color rules | Conditional formatting only | Built-in rule engine with persistence |
| Multi-field tooltips | Limited | Unlimited fields, auto-typed |
| Cross-filter | ✓ | ✓ |
| Multi-select legend | ✗ | ✓ (Ctrl+click) |
| Pan / Zoom / Rotation | Limited | Full + rotation persists |
| GPS coordinates | ✗ | ✓ (via DAX columns) |
| Theme adaptation | Limited | WCAG luminance, full dark/light |
| Mobile-friendly | Limited | Scrollable bars, touch-ready |
| Open source | ✗ | ✓ |
| Price | Paid | Free / Open Source |

---

## Roadmap

- [ ] Visual editor tool (web app for tracing object positions over a background image)
- [ ] Polygon support for irregular shapes (dental charts, geographical maps)
- [ ] Background image overlay in the visual itself
- [ ] Shape types: circle, diamond, hexagon per object
- [ ] Drill-through on object click
- [ ] Rule templates (semaphore, heatmap, occupancy)
- [ ] AppSource marketplace listing

---

## Contributing

Contributions are welcome. Please open an issue before submitting a pull request.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit: `git commit -m "feat: description"`
4. Push and open a Pull Request

---

## Privacy

Synoptic Studio runs entirely client-side. No data leaves the user's browser; no telemetry is sent. See [PRIVACY.md](./PRIVACY.md) for details.

---

## License

MIT License — see [LICENSE](./LICENSE) for details.

---

## Author

**Automatajm**
Financial Planning & Analytics | Enterprise Software Development
Dominican Republic
[github.com/Automatajm](https://github.com/Automatajm)

---

<p align="center">
  Built with passion for operations teams who need to <em>see</em> their data.
</p>