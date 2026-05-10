"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard  = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

// ─────────────────────────────────────────────────────────────────────────────
// Color Rules card — a single text property holds the JSON-serialized rule list.
// Users never edit this field directly; the in-visual rules editor reads, writes
// and persists it via host.persistProperties.
// ─────────────────────────────────────────────────────────────────────────────
class ColorRulesCard extends FormattingSettingsCard {
    rulesJson = new formattingSettings.TextInput({
        name: "rulesJson",
        displayName: "Rules (JSON)",
        description: "Internal: color-rule definitions. Edit via the built-in Rules editor (gear icon).",
        value: "",
        placeholder: "",
    });

    name:        string = "colorRules";
    displayName: string = "Color Rules";
    slices: Array<FormattingSettingsSlice> = [this.rulesJson];
}

// ─────────────────────────────────────────────────────────────────────────────
// General card — visibility toggles and the fallback color (used when no rule matches)
// ─────────────────────────────────────────────────────────────────────────────
class GeneralCard extends FormattingSettingsCard {
    showLabel = new formattingSettings.ToggleSwitch({
        name: "showLabel",
        displayName: "Show label",
        value: true,
    });

    showValue = new formattingSettings.ToggleSwitch({
        name: "showValue",
        displayName: "Show main value",
        value: true,
    });

    colorFallback = new formattingSettings.ColorPicker({
        name: "colorFallback",
        displayName: "Default color",
        description: "Color used when no rule matches the object.",
        value: { value: "#4a5560" },
    });

    // Internal: persists the user's last selected rotation so it survives
    // close/reopen and report publishing. Hidden from the Format pane —
    // only the visual itself reads/writes it via host.persistProperties.
    // Default 0 = natural orientation (image as authored in the editor).
    rotation = new formattingSettings.NumUpDown({
        name: "rotation",
        displayName: "Rotation",
        value: 0,
        visible: false,
    });

    // User-controlled opacity for the background image (0-100).
    // Lower values make the rule colors stand out more; higher values
    // emphasize the picture. 50 is a balanced default.
    backgroundOpacity = new formattingSettings.NumUpDown({
        name: "backgroundOpacity",
        displayName: "Background image opacity",
        description: "How visible the background image is behind the shapes (0-100). Lower values let the rule colors stand out more.",
        value: 50,
    });

    name:        string = "general";
    displayName: string = "General";
    slices: Array<FormattingSettingsSlice> = [
        this.showLabel,
        this.showValue,
        this.colorFallback,
        this.backgroundOpacity,
        this.rotation,
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes card — controls how route lines are drawn between centroids.
// Only relevant when Route_Order OR Route_From+Route_To are bound to data.
// ─────────────────────────────────────────────────────────────────────────────
class RoutesCard extends FormattingSettingsCard {
    showRoutes = new formattingSettings.ToggleSwitch({
        name: "showRoutes",
        displayName: "Show routes",
        value: true,
    });

    routeColor = new formattingSettings.ColorPicker({
        name: "routeColor",
        displayName: "Route color",
        value: { value: "#00e5a0" },
    });

    routeThickness = new formattingSettings.NumUpDown({
        name: "routeThickness",
        displayName: "Line thickness",
        description: "Base thickness in pixels (1-10). When Route Weight is bound, scales proportionally.",
        value: 2,
    });

    routeOpacity = new formattingSettings.NumUpDown({
        name: "routeOpacity",
        displayName: "Opacity",
        description: "Line opacity (0-100). Lower values let underlying shapes show through.",
        value: 70,
    });

    showArrows = new formattingSettings.ToggleSwitch({
        name: "showArrows",
        displayName: "Show direction arrows",
        value: true,
    });

    name:        string = "routes";
    displayName: string = "Routes";
    slices: Array<FormattingSettingsSlice> = [
        this.showRoutes,
        this.routeColor,
        this.routeThickness,
        this.routeOpacity,
        this.showArrows,
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    colorRulesCard = new ColorRulesCard();
    generalCard    = new GeneralCard();
    routesCard     = new RoutesCard();

    cards = [this.colorRulesCard, this.generalCard, this.routesCard];
}
