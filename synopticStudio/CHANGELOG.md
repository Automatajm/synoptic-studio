# Changelog

All notable changes to Synoptic Studio are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.1.0] — 2026-04-25

### Added
- **Persistent rules** — color rules now save via `host.persistProperties` and survive report reload, close/reopen, and Power BI Service publishing.
- **Persistent rotation** — the user's last selected rotation (0°/90°/180°/270°) survives close/reopen and report publishing. Stored internally in the `general` object.
- **Multi-field tooltip** — single `Tooltip Fields` bucket accepts unlimited measures, dates, and text fields. Auto-detects type and formats accordingly (numbers with separators, dates in locale format, text). Strips PBI prefixes like `Sum of`, `Avg of` while respecting user renames.
- **Multi-select legend with Ctrl+click** — click a chip for exclusive filter, Ctrl+click to add/remove from selection (union semantics). Re-click on a single active chip toggles off; click on canvas background clears all.
- **Educational hint banner** — appears when Main Value is bound as an aggregated measure (`Sum of`, `Avg of`, etc.), reminding users about Power BI's "Show items with no data" option. Sticky behavior: only dismissed by user; auto-resets when the risky configuration is removed.
- **Between operator with single-input syntax** — accepts `"3, 8"`, `"[3, 8]"`, `"(3, 8)"`, `"3..8"`, `"3 - 8"`. Auto-sorts; live red-border validation if format is wrong. Backward compatible with legacy two-field rules.
- **Quadrant-aware tooltip positioning** — tooltip appears in the opposite quadrant from the cursor, never occluding the area being explored.
- **Theme detection from Power BI host** — uses `host.colorPalette.background` with WCAG luminance to detect light/dark; refreshes on every theme change.
- **Cosmetic field-name cleanup** — `Sum of canteros_vacios` displays as `Canteros vacios` by default; user renames are respected.
- **Compass with fixed stator** — the ring and N/S/E/W letters stay screen-anchored; only the needle rotates to point to map north after rotation.
- **Adaptive labels on rotation** — labels stay upright when the map is rotated; horizontal rotation switches to inline (`Label | Text1 | MainVal`) layout to use the wider footprint.
- **Color contrast for values** — main value text picks black or white via WCAG luminance against the perceived (alpha-blended) fill color, so the number stays legible on every rule color in every theme.
- **Halo on text** — subtle opposite-color stroke separates values from the fill underneath when the metric is partial.
- **Rotation-aware fit-scale** — rotating 90°/270° reflows so content always fits the viewport regardless of orientation. Zoom remains independent.
- **Mobile-friendly UX** — both controls and legend bars now scrollable horizontally with hidden scrollbar (cross-browser CSS) and translucent edge arrows that appear only when overflow exists. Wheel events translated vertical-to-horizontal when overflow detected.
- **Single-line legend chips** — `whiteSpace: nowrap` + `flexShrink: 0`; long labels never wrap, overflow handled by the scrollable parent.

### Changed
- **Data view mapping switched to `table`** — guarantees every row from the source table reaches the visual, regardless of how the user aggregates measures. Combined with the user-controlled "Show items with no data" option in the Power BI field menu, this enables consistent rendering of objects without numeric data.
- **Default rules in English** — Low / Medium / High semaphore over Main Value, agnostic to industry. Replaces the previous Spanish defaults.
- **Default fallback color** — now carbon neutral (`#4a5560`) which works on light and dark themes. Replaces the previous slate (`#52626a`).
- **Color palette reorganized** — neutrals first, then semaphore order (red → amber → green), then accents.
- **Information hierarchy in compact cells** — Label takes priority over Value when space is limited (identity wins). 3-level inline cascade: `Label | Text1 | MainVal` → `Label | MainVal` → `Label`.
- **Reset button** — now icon-only (`↺`), consistent with `+`/`−` button sizing.

### Fixed
- **Numeric rules no longer match on null/undefined/NaN** — previously, JavaScript would coerce `null` to `0` and falsely match `< 40`. Now missing values cleanly fall to the fallback color.
- **Color picker popups no longer stack** — opening one palette popup closes any others that were open.
- **Reset preserves rotation choice** — reset zoom/pan but keeps the user-selected rotation.
- **Layout coordinate handling** — `layoutAt()` now returns undefined for null/missing coords instead of collapsing to `0`. Objects without valid layouts are skipped from rendering rather than placed at the origin.

### Removed
- Spanish placeholders and example rules in `settings.ts`.
- Redundant `Value 2`, `Value 3`, `Tooltip Extra`, `Text Field 2` buckets — consolidated into the single `Tooltip Fields` bucket.
- Redundant `✕ clear` button on the legend bar — re-click on an active chip already toggles off.

---

## [1.0.0] — 2026-04-23

### Added
- Initial release of Synoptic Studio
- SVG-based canvas renderer with fixed-position layout
- Color rules engine supporting 7 operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `between`)
- 13-color unified palette (5 semaphore + 8 field colors)
- Built-in rules editor panel with live legend preview
- Auto-grid layout fallback when no coordinates are provided
- Fixed-layout mode via `Layout_X`, `Layout_Y`, `Layout_W`, `Layout_H` data roles
- Pan and zoom (mouse wheel + drag + `+`/`−` buttons)
- Canvas rotation at 0° / 90° / 180° / 270° with upright label counter-rotation
- Fixed compass rose reflecting true North regardless of rotation
- Legend click cross-filter — click any legend chip to filter the visual and report
- Object click cross-filter with Ctrl+click multi-select
- Rich hover tooltip showing all mapped data fields with display names
- Format pane integration: toggle labels, toggle values, fallback color
- Rules stored as JSON in Format pane for programmatic configuration
- GPS-to-canvas coordinate support via DAX calculated columns
- Power BI selection manager integration for full report cross-filtering

---

## Architecture

These design decisions are stable across versions and worth keeping in mind for any future contribution:

- **Pure SVG rendering** — no external JavaScript libraries. Keeps the visual lightweight, fast to load, and free of supply-chain risk.
- **DOM-safe construction** — no `innerHTML` anywhere; every element is built with `createElement` and `setAttribute`. Passes Power BI's lint rules out of the box and is safe for AppSource certification.
- **Transform group pattern** — pan/zoom/rotate are applied to a single `<g>` element, separate from the upright fill and label layers. Lets the visual survive Power BI redraws without losing interaction state.
- **Persistent state via `host.persistProperties`** — both color rules and rotation use the official Power BI persistence API. State is part of the `.pbix` file; survives close/reopen, publishing to Service, and download from Service back to Desktop.
- **WCAG-based contrast picking** — text colors against rule-colored fills are chosen via relative luminance computation, considering alpha-blended fill perception. Ensures legibility in every theme and color combination.
- **Theme detection from PBI host** — adapts to the active report theme via `host.colorPalette.background` rather than OS-level `prefers-color-scheme`. Respects the report author's chosen theme.
- **TypeScript strict mode compatible** — full type coverage; no `any` escapes in production paths.