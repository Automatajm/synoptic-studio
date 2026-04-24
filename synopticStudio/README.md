# Synoptic Studio — Power BI Custom Visual

<p align="center">
  <img src="assets/banner.png" alt="Synoptic Studio Banner" width="800"/>
</p>

<p align="center">
  <a href="https://github.com/Automatajm/synoptic-studio/releases"><img src="https://img.shields.io/github/v/release/Automatajm/synoptic-studio?color=00e5a0&label=version" alt="Version"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-00e5a0" alt="License"/></a>
  <a href="https://github.com/Automatajm/synoptic-studio/issues"><img src="https://img.shields.io/github/issues/Automatajm/synoptic-studio?color=38bdf8" alt="Issues"/></a>
</p>

> **A fully configurable synoptic map visual for Power BI.** Place any object on a canvas, define color rules against your data fields, and get instant cross-filtering with the rest of your report — no coding required.

---

## What is Synoptic Studio?

Synoptic Studio is a Power BI custom visual that renders a **position-based map** of objects — greenhouses, tables, seats, machines, rooms, or anything you define — colored by configurable business rules applied to your data.

Unlike generic map visuals, Synoptic Studio is **layout-driven**: each object has explicit X, Y, W, H coordinates in your dataset, so your visual matches the physical reality of your operation.

### Built for operations teams

Originally designed for large-scale ornamental plant production (2.8M plants across 118 greenhouses), Synoptic Studio solves the core problem of any field operations dashboard:

> *"I need to see the status of every physical location at a glance, colored by what matters today."*

---

## Key Features

| Feature | Description |
|---|---|
| **Color Rules Engine** | Define up to 20 rules per visual. First match wins. Rules evaluate text fields (equals, not equals) and numeric fields (greater, less, between). |
| **13-color palette** | 5 semaphore colors (gray, green, yellow, orange, red) + 8 field colors. Pick any per rule. |
| **Fixed layout** | Assign X, Y, W, H coordinates to each object. The visual renders them at exact positions — reflecting real-world geometry. |
| **Auto-grid fallback** | No coordinates? The visual auto-arranges objects in an optimized grid. |
| **Pan & Zoom** | Mouse wheel zoom, drag to pan, +/− buttons. |
| **Rotation** | Rotate the canvas 0°/90°/180°/270° to match your map orientation. Labels stay upright. |
| **Compass rose** | Fixed compass that reflects real-world orientation regardless of canvas rotation. |
| **Legend click filter** | Click any legend chip to highlight and cross-filter matching objects. |
| **Tooltip** | Hover any object to see all data fields with their display names. |
| **Cross-filter** | Click any object to filter other visuals in the report. Ctrl+click for multi-select. |
| **Rules editor** | Built-in rule editor panel — no JSON editing required. |

---

## Screenshots

<p align="center">
  <img src="assets/screenshot-main.png" alt="Main view" width="780"/>
  <br/><em>Synoptic Studio showing 118 greenhouses colored by weeding status</em>
</p>

<p align="center">
  <img src="assets/screenshot-rules.png" alt="Rules editor" width="780"/>
  <br/><em>Built-in color rules editor</em>
</p>

---

## Getting Started

### Installation

1. Download the latest `.pbiviz` file from [Releases](https://github.com/Automatajm/synoptic-studio/releases)
2. In Power BI Desktop: **Visualizations pane → ··· → Import a visual from a file**
3. Select the `.pbiviz` file and accept the security prompt
4. The Synoptic Studio icon appears in your visualizations panel

### Basic Setup

#### Step 1 — Prepare your data table

Your dataset needs at minimum:

| Column | Type | Description |
|---|---|---|
| `ID` | Text | Unique identifier per object (e.g. `A01`, `Table-12`) |
| `Status` | Text | Categorical field for color rules (e.g. `OK`, `Alert`, `Critical`) |
| `Value` | Number | Numeric measure (e.g. occupancy %, score, count) |

#### Step 2 — Add coordinates (optional but recommended)

For fixed layout, add four numeric columns:

| Column | Description | Range |
|---|---|---|
| `Layout_X` | Horizontal position | 0 – Canvas_W |
| `Layout_Y` | Vertical position | 0 – Canvas_H |
| `Layout_W` | Object width in pixels | Typically 14–38 |
| `Layout_H` | Object height in pixels | Typically 36–105 |

> **Important:** Set these columns to **Don't summarize** in the Power BI model (Column tools → Summarization → Don't summarize).

#### Step 3 — Map fields to the visual

| Visual role | Map to |
|---|---|
| Invernadero (ID) | Your unique ID column |
| Valor Principal | Your numeric measure |
| Campo Texto 1 | Your categorical status column |
| Layout X / Y / W / H | Your coordinate columns |

#### Step 4 — Configure color rules

Click **⚙ Color rules** in the visual's top bar. Add rules in order of priority:

```
Field: Campo Texto 1   Operator: = equal   Value: Critical   Color: Red     Label: Critical
Field: Campo Texto 1   Operator: = equal   Value: Alert      Color: Orange  Label: Alert
Field: Campo Texto 1   Operator: = equal   Value: OK         Color: Green   Label: OK
```

Click **✓ Save rules**. The visual updates immediately.

---

## Advanced Usage

### Rule syntax (JSON)

Rules are stored as JSON in the Format pane under **Color Rules → Rules (JSON)**. You can edit them directly:

```json
[
  {
    "field": "campoTexto1",
    "op": "eq",
    "value": "Critical",
    "color": "#ef4444",
    "label": "Critical",
    "enabled": true
  },
  {
    "field": "valorPrincipal",
    "op": "between",
    "value": "75",
    "value2": "90",
    "color": "#f59e0b",
    "label": "High 75–90%",
    "enabled": true
  }
]
```

**Supported operators:**

| Operator | Description |
|---|---|
| `eq` | Equals (text or number) |
| `neq` | Not equals |
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |
| `between` | Between value and value2 (inclusive) |

**Available fields in rules:**

| Field key | Maps to visual role |
|---|---|
| `campoTexto1` | Campo Texto 1 |
| `campoTexto2` | Campo Texto 2 |
| `valorPrincipal` | Valor Principal |
| `valor2` | Valor 2 |
| `valor3` | Valor 3 |

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

### Pan, Zoom & Rotation

| Control | Action |
|---|---|
| Mouse wheel | Zoom in/out |
| Drag on background | Pan |
| `0° 90° 180° 270°` buttons | Rotate canvas |
| `⊙ reset` button | Reset zoom, pan, and rotation |

The compass rose always points true North regardless of canvas rotation. Labels remain upright at all rotation angles.

---

## Architecture

```
SynopticStudio/
├── src/
│   ├── visual.ts          # Core visual — rendering, pan/zoom/rotate, events
│   └── settings.ts        # Format pane settings model
├── style/
│   └── visual.less        # Minimal styles
├── capabilities.json      # Data roles and mappings
├── pbiviz.json           # Visual metadata
└── assets/
    └── icon.png          # 20×20 visual icon
```

### Data flow

```
Power BI DataView
      ↓
  update() — parse categories and values by role
      ↓
  Color rules engine — evalRule() per object
      ↓
  Layout engine — fixed coords or auto-grid
      ↓
  SVG render — transform group for pan/zoom/rotate
      ↓
  Events — hover tooltip, click cross-filter, legend filter
```

---

## Comparison with OKViz Synoptics Panel

| Feature | OKViz Synoptics Panel | Synoptic Studio |
|---|---|---|
| Custom layout | Via SVG editor tool | Via X,Y,W,H columns in dataset |
| Color rules | Conditional formatting | Built-in rule engine with JSON |
| Cross-filter | ✓ | ✓ |
| Pan/Zoom | ✓ | ✓ |
| Rotation | ✗ | ✓ (0/90/180/270°) |
| GPS coordinates | ✗ | ✓ (via DAX columns) |
| Open source | ✗ | ✓ |
| Price | Paid | Free / Open Source |

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

cd SynopticStudio
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

## Roadmap

- [ ] Shape types: circle, diamond, hexagon per object
- [ ] Image/icon overlay per object
- [ ] Drill-through on object click
- [ ] Mobile touch support (pinch zoom)
- [ ] Import layout from GeoJSON/KML
- [ ] Multiple canvas pages
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

## License

MIT License — see [LICENSE](LICENSE) for details.

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
