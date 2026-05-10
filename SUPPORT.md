# Support — Synoptic Studio

## Getting Help

- **Bug reports:** [Open an issue](https://github.com/Automatajm/synoptic-studio/issues)
- **Feature requests:** [Open an issue](https://github.com/Automatajm/synoptic-studio/issues) with label `enhancement`
- **Questions:** [GitHub Discussions](https://github.com/Automatajm/synoptic-studio/discussions)

## Common Issues

### Some objects don't appear on the map

**Cause:** Power BI core filters out rows where the Main Value (or any other measure in the visual) returns blank/null after aggregation. This is the documented Power BI default behavior — it applies to all visuals, not just custom ones.

**Solution:** Enable **Show items with no data** on your fields:

1. In the Visualizations panel, locate the field in its bucket (Object ID or any Layout field).
2. Click the dropdown arrow next to the field name (or right-click).
3. Select **Show items with no data**.
4. Repeat for **Object ID** and each of the four **Layout** fields.

The visual will detect this configuration risk automatically and display a help banner pointing to this fix. Click ✕ to dismiss the banner once you've handled it.

### Visual shows "Drag the Object ID field to the visual"

The **Object ID** field is required. Drag a text column representing each object's unique identifier into that bucket.

### Objects are arranged in a grid instead of fixed positions

The Layout X/Y/W/H columns are either not bound to the visual or are being summarized.

**Solution:**
1. Bind your X, Y, W, H columns to the corresponding `Layout X/Y/W/H` field roles.
2. Right-click each column in the Power BI fields list → **Don't Summarize**.

### Layout coordinates show as 1, 2, 3... instead of real positions

Power BI is summarizing your coordinate columns. Right-click each Layout column → **Don't Summarize**.

### Color rules don't apply

Most rule failures are due to one of these causes:

- **Wrong field in the rule:** in the rule editor, only `Text Field 1` and `Main Value` are available as targets. If you bound a status column to a different role, the rules can't see it.
- **Mismatched value:** for `=` and `≠` operators, the comparison is exact text match (case-sensitive). `OK` will not match `ok`.
- **Rule disabled:** check the toggle on the left of each rule.
- **Rule order:** rules evaluate top-to-bottom and the first match wins. Reorder with ↑↓.
- **Null/empty value:** numeric rules (`<`, `>`, `between`, etc.) do **not** match when the value is missing — the object falls back to the default color. Categorical rules (`=`, `≠`) also skip empty strings.

### Rules don't persist after closing the report

This was a known issue in early versions; resolved in **v1.0+**. Rules now persist via Power BI's `persistProperties` API and survive close/reopen and report publishing. Update to the latest release.

### Rotation resets after closing the report

This was a known issue in **v1.0**; resolved in **v1.1+**. Rotation now persists alongside rules. Update to v1.1 or later.

### Zoom or pan not working

Power BI Desktop intercepts some mouse events. Try clicking inside the visual first, then using the wheel. Use the `+` / `−` buttons in the top bar as an alternative. The `↺` button resets zoom, pan, and rotation.

### "Between" operator giving unexpected results

The `between` operator accepts a single input field with multiple formats:

- `3, 8`
- `[3, 8]`
- `(3, 8)`
- `3..8`
- `3 - 8`

Bounds are auto-sorted (`8, 3` works the same as `3, 8`) and inclusive on both sides. The input has live red-border validation if the format is invalid.

### Tooltip fields show "Sum of …" prefix

By default Synoptic Studio cleans common Power BI prefixes (`Sum of`, `Avg of`, `Count of`, etc.) for cleaner display. If you want a different name:

- Right-click the field in your data pane → **Rename for this visual** → type your preferred name.
- Synoptic Studio respects the renamed name as-is, without further cleanup.

### Mobile / narrow viewport: controls or legend cut off

Both bars are horizontally scrollable with **hidden** scrollbars. Use:

- Mouse wheel over the bar (vertical wheel translates to horizontal scroll)
- Touch swipe (on mobile)
- Translucent `‹` / `›` arrows that appear on the edges when overflow exists

### Theme colors look wrong

Synoptic Studio adapts to the active Power BI report theme via `host.colorPalette`. If the colors look off:

- Check Format pane → Visual → "Default color" — set to a neutral color that works in both themes.
- The fallback default is `#4a5560` (carbon neutral) which works on both light and dark themes.
- The internal palette has 14 curated colors arranged from neutrals → semaphore → accents. Pick from those for best WCAG contrast.

---

## Version history

See [CHANGELOG.md](./CHANGELOG.md) for the full list of changes per release.

---

## Reporting security issues

For sensitive security issues, please contact the maintainer directly via the email listed in [github.com/Automatajm](https://github.com/Automatajm). Please do not open public issues for security disclosures.