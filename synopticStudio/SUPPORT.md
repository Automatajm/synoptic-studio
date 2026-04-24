# Support — Synoptic Studio

## Getting Help

- **Bug reports:** [Open an issue](https://github.com/Automatajm/synoptic-studio/issues)
- **Feature requests:** [Open an issue](https://github.com/Automatajm/synoptic-studio/issues) with label `enhancement`
- **Questions:** [GitHub Discussions](https://github.com/Automatajm/synoptic-studio/discussions)

## Common Issues

### Visual shows "Drag Invernadero (ID) field to the visual"
The **Invernadero (ID)** field role is required. Make sure you have dragged a text column representing each object's unique identifier.

### Objects are arranged in a grid instead of fixed positions
The Layout X/Y/W/H fields are either not mapped or not set to **Don't summarize** in the model. Go to Column Tools → Summarization → Don't summarize for each coordinate column.

### Color rules not applying
Check that the field key in your JSON rules matches exactly: `campoTexto1`, `campoTexto2`, `valorPrincipal`, `valor2`, or `valor3`. Field keys are case-sensitive.

### Zoom/pan not working
Power BI Desktop intercepts some mouse events. Try clicking inside the visual first, then using the wheel. Use the `+` / `−` buttons in the top bar as an alternative.
