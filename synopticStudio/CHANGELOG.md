# Changelog

All notable changes to Synoptic Studio are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2025-04-23

### Added
- Initial release of Synoptic Studio
- SVG-based canvas renderer with fixed-position layout
- Color rules engine supporting 7 operators (eq, neq, gt, gte, lt, lte, between)
- 13-color unified palette (5 semaphore + 8 field colors)
- Built-in rules editor panel with live legend preview
- Auto-grid layout fallback when no coordinates are provided
- Fixed-layout mode via Layout_X, Layout_Y, Layout_W, Layout_H data roles
- Pan and zoom (mouse wheel + drag + +/− buttons)
- Canvas rotation at 0°/90°/180°/270° with upright label counter-rotation
- Fixed compass rose reflecting true North regardless of rotation
- Legend click cross-filter — click any legend chip to filter the visual and report
- Object click cross-filter with Ctrl+click multi-select
- Rich hover tooltip showing all mapped data fields with display names
- Format pane integration: toggle labels, toggle values, fallback color
- Rules stored as JSON in Format pane for programmatic configuration
- GPS-to-canvas coordinate support via DAX calculated columns
- Power BI selection manager integration for full report cross-filtering

### Architecture
- Pure SVG rendering — no external JavaScript libraries
- DOM-safe construction (no innerHTML) — passes Power BI lint rules
- Transform group pattern for pan/zoom/rotate that survives Power BI redraws
- TypeScript strict mode compatible
