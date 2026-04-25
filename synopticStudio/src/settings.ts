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
class ReglaColorCard extends FormattingSettingsCard {
    reglasJson = new formattingSettings.TextInput({
        name: "reglasJson",
        displayName: "Rules (JSON)",
        description: "Internal: color-rule definitions. Edit via the built-in Rules editor (gear icon).",
        value: "",
        placeholder: "",
    });

    name:        string = "reglas";
    displayName: string = "Color Rules";
    slices: Array<FormattingSettingsSlice> = [this.reglasJson];
}

// ─────────────────────────────────────────────────────────────────────────────
// General card — visibility toggles and the fallback color (used when no rule matches)
// ─────────────────────────────────────────────────────────────────────────────
class GeneralCard extends FormattingSettingsCard {
    mostrarEtiqueta = new formattingSettings.ToggleSwitch({
        name: "mostrarEtiqueta",
        displayName: "Show label",
        value: true,
    });

    mostrarValor = new formattingSettings.ToggleSwitch({
        name: "mostrarValor",
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
    rotation = new formattingSettings.NumUpDown({
        name: "rotation",
        displayName: "Rotation",
        value: 180,
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
        this.mostrarEtiqueta,
        this.mostrarValor,
        this.colorFallback,
        this.backgroundOpacity,
        this.rotation,
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    reglaColorCard = new ReglaColorCard();
    generalCard    = new GeneralCard();

    cards = [this.reglaColorCard, this.generalCard];
}