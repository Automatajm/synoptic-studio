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
        value: { value: "#52626a" },
    });

    name:        string = "general";
    displayName: string = "General";
    slices: Array<FormattingSettingsSlice> = [
        this.mostrarEtiqueta,
        this.mostrarValor,
        this.colorFallback,
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    reglaColorCard = new ReglaColorCard();
    generalCard    = new GeneralCard();

    cards = [this.reglaColorCard, this.generalCard];
}