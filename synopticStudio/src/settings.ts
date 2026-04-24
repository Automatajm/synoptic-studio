"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

// ── Reglas de Color ───────────────────────────────────────────────────────────
class ReglaColorCard extends FormattingSettingsCard {
    reglasJson = new formattingSettings.TextInput({
        name: "reglasJson",
        displayName: "Reglas (JSON)",
        description: "Define las reglas de color. Ejemplo: [{\"field\":\"estado\",\"op\":\"eq\",\"value\":\"OK\",\"color\":\"#00e5a0\",\"label\":\"OK\"}]",
        placeholder: "[]",
        value: JSON.stringify([
            { field: "campoTexto1", op: "eq",  value: "Crítico",   color: "#ef4444", label: "Crítico",    enabled: true },
            { field: "campoTexto1", op: "eq",  value: "Alerta",    color: "#fb923c", label: "Alerta",     enabled: true },
            { field: "campoTexto1", op: "eq",  value: "Atención",  color: "#f59e0b", label: "Atención",   enabled: true },
            { field: "campoTexto1", op: "eq",  value: "OK",        color: "#00e5a0", label: "OK",         enabled: true },
            { field: "campoTexto1", op: "eq",  value: "Vacío",     color: "#52626a", label: "Vacío",      enabled: true },
        ])
    });

    name: string = "reglas";
    displayName: string = "Reglas de Color";
    slices: Array<FormattingSettingsSlice> = [this.reglasJson];
}

// ── General ───────────────────────────────────────────────────────────────────
class GeneralCard extends FormattingSettingsCard {
    mostrarEtiqueta = new formattingSettings.ToggleSwitch({
        name: "mostrarEtiqueta",
        displayName: "Mostrar etiqueta",
        value: true
    });

    mostrarValor = new formattingSettings.ToggleSwitch({
        name: "mostrarValor",
        displayName: "Mostrar valor principal",
        value: true
    });

    colorFallback = new formattingSettings.ColorPicker({
        name: "colorFallback",
        displayName: "Color sin regla",
        value: { value: "#52626a" }
    });

    name: string = "general";
    displayName: string = "General";
    slices: Array<FormattingSettingsSlice> = [
        this.mostrarEtiqueta,
        this.mostrarValor,
        this.colorFallback
    ];
}

// ── Model ─────────────────────────────────────────────────────────────────────
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    reglaColorCard = new ReglaColorCard();
    generalCard    = new GeneralCard();
    cards = [this.generalCard, this.reglaColorCard];
}