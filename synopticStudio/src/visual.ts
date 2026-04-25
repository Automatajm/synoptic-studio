"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions      = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual                  = powerbi.extensibility.visual.IVisual;
import ISelectionManager        = powerbi.extensibility.ISelectionManager;
import ISelectionId             = powerbi.visuals.ISelectionId;

import { VisualFormattingSettingsModel } from "./settings";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ColorRule {
    id:      string;
    field:   string;
    op:      string;
    value:   string;
    value2:  string;
    color:   string;
    label:   string;
    enabled: boolean;
}

interface TooltipField {
    name:  string;
    value: string;
    isNumeric: boolean;
}

interface SynopticObject {
    id:             string;
    label:          string;
    valorPrincipal?: number;
    campoTexto1?:   string;
    layoutX?:       number;
    layoutY?:       number;
    layoutW?:       number;
    layoutH?:       number;
    // Extra tooltip data — now arrays so users can add as many fields as they want
    tooltipNumbers: TooltipField[];
    tooltipTexts:   TooltipField[];
    selectionId:    ISelectionId;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const PALETTE = [
    "#52626a","#00e5a0","#f59e0b","#fb923c","#ef4444",
    "#38bdf8","#a78bfa","#ec4899","#2dd4bf","#84cc16",
    "#e879f9","#fbbf24","#ffffff","#94a3b8",
];

// ── Theme — adapts to Power BI report theme via host color palette ────────────
// PBI calls update() whenever the report theme changes, so we refresh CLR there.
function isDarkFromBg(bgHex: string): boolean {
    // Compute relative luminance; treat anything below 0.5 as dark
    if (!bgHex || bgHex.length < 7) return true; // default to dark
    const r = parseInt(bgHex.slice(1,3),16) / 255;
    const g = parseInt(bgHex.slice(3,5),16) / 255;
    const b = parseInt(bgHex.slice(5,7),16) / 255;
    const lum = 0.2126*r + 0.7152*g + 0.0722*b;
    return lum < 0.5;
}
function getTheme(dark: boolean) {
    return {
        bg:      dark ? "#07090a" : "#f4f6f8",
        surface: dark ? "#0c1014" : "#ffffff",
        panel:   dark ? "#0d1318" : "#ffffff",
        card:    dark ? "#121820" : "#f0f4f7",
        border:  dark ? "#202a34" : "#d0dae3",
        hi:      dark ? "#2a3e50" : "#c8d8e8",
        green:   dark ? "#00e5a0" : "#008855",
        // dim: label text in tooltips / secondary captions — must be clearly readable
        dim:     dark ? "#8aa5b8" : "#4a5a6a",
        // text: primary body text
        text:    dark ? "#e0eef7" : "#0f1820",
        lo:      dark ? "#0e1418" : "#e8eef2",
        // muted: description text (info panels, footnotes)
        muted:   dark ? "#a0b8c8" : "#3a4a5a",
        red:     "#ef4444",
        glo:     dark ? "#00301e" : "#d4f0e4",
    };
}
// Initialize with dark as sensible default until update() gets the real PBI theme
let CLR = getTheme(true);

// ── Helpers ───────────────────────────────────────────────────────────────────
let _uid = 0;
function uid(): string { return String(Date.now()) + String(_uid++); }
function clearNode(n: Node): void { while (n.firstChild) n.removeChild(n.firstChild); }

function hexToRgba(hex: string, a: number): string {
    if (!hex || hex.length < 7) return `rgba(128,128,128,${a})`;
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
}

/**
 * Pick readable text color against a semi-transparent fill over a theme background.
 * The fill in the visual is drawn at ~0.35 alpha, so the perceived color is a mix
 * of the rule color and the theme background. We compute that mix, then decide
 * text color by WCAG luminance.
 * This handles both modes correctly: light theme with pastel fills → dark text;
 * dark theme with muted/darkened fills → light text.
 */
function readableOn(hex: string, bgHex = "#07090a", alpha = 0.35,
                    darkTxt = "#0a0f14", lightTxt = "#f4f8fb"): string {
    if (!hex || hex.length < 7) return lightTxt;
    // Parse rule color
    const fr = parseInt(hex.slice(1,3),16) / 255;
    const fg = parseInt(hex.slice(3,5),16) / 255;
    const fb = parseInt(hex.slice(5,7),16) / 255;
    // Parse theme background
    const br = parseInt(bgHex.slice(1,3),16) / 255;
    const bg = parseInt(bgHex.slice(3,5),16) / 255;
    const bb = parseInt(bgHex.slice(5,7),16) / 255;
    // Blend: perceived = fill * alpha + bg * (1 - alpha)
    const mr = fr * alpha + br * (1 - alpha);
    const mg = fg * alpha + bg * (1 - alpha);
    const mb = fb * alpha + bb * (1 - alpha);
    // WCAG relative luminance on the blended color
    const lum = 0.2126*mr + 0.7152*mg + 0.0722*mb;
    return lum >= 0.55 ? darkTxt : lightTxt;
}

/**
 * Cosmetic cleanup for column display names.
 * Strips common PBI aggregator prefixes ("Sum of ", "Avg of ", etc.),
 * replaces underscores with spaces, and capitalizes the first letter.
 * If the user has explicitly renamed the column ("Rename for this visual"),
 * Power BI passes that custom name through, and our cleanup is gentle enough
 * to leave it intact.
 */
function cleanFieldName(name: string): string {
    if (!name) return "";
    let out = String(name);
    // Strip common aggregator prefixes (case-insensitive)
    const prefixes = [
        /^Sum of\s+/i, /^Average of\s+/i, /^Avg of\s+/i, /^Max of\s+/i,
        /^Min of\s+/i, /^Count of\s+/i, /^Count\s+/i,
        /^Distinct count of\s+/i, /^Median of\s+/i, /^Variance of\s+/i,
        /^Std dev of\s+/i, /^First\s+/i, /^Last\s+/i,
    ];
    for (const re of prefixes) out = out.replace(re, "");
    // Replace separators with spaces
    out = out.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
    // Capitalize first letter only (don't title-case — preserves intentional casing)
    if (out.length > 0) out = out.charAt(0).toUpperCase() + out.slice(1);
    return out;
}

/**
 * Format a value for tooltip display.
 *  - Numbers: thousand separators, up to 2 decimal places when fractional
 *  - Dates: locale short format
 *  - Strings: as-is
 *  - null/undefined: empty string
 */
function formatTooltipValue(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) {
        try { return v.toLocaleDateString(); } catch { return String(v); }
    }
    if (typeof v === "number") {
        if (!isFinite(v)) return "";
        const isInt = Number.isInteger(v);
        return isInt
            ? v.toLocaleString("en-US")
            : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
    }
    return String(v);
}

function mk(tag: string, css?: Partial<CSSStyleDeclaration>): HTMLElement {
    const e = document.createElement(tag);
    if (css) Object.assign(e.style, css);
    return e;
}

function svgEl(tag: string, attrs: Record<string,string>): SVGElement {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([k,v]) => e.setAttribute(k,v));
    return e;
}

const INP: Partial<CSSStyleDeclaration> = {
    background:CLR.surface, border:`1px solid ${CLR.border}`,
    color:CLR.text, borderRadius:"4px", padding:"2px 5px",
    fontSize:"8px", fontFamily:"'Segoe UI',sans-serif", outline:"none",
};

function btn(color: string, bg = "none"): Partial<CSSStyleDeclaration> {
    return { background:bg, border:`1px solid ${color}`, color,
             borderRadius:"4px", padding:"2px 7px", cursor:"pointer",
             fontFamily:"'Segoe UI',sans-serif", fontSize:"8px" };
}

// ── Color engine ──────────────────────────────────────────────────────────────

/**
 * Default rules seeded on first use. Generic 3-level semaphore on Main Value:
 *  - Low     (< 40)    → red
 *  - Medium  (40–70)   → amber
 *  - High    (≥ 70)    → green
 * Users can change everything in the rule editor; these are just a starting point
 * so a freshly-added visual looks meaningful instead of a wall of gray.
 */
function defaultRules(): ColorRule[] {
    return [
        { id: uid(), field: "valorPrincipal", op: "lt",      value: "40",    value2: "",
          color: "#ef4444", label: "Low",    enabled: true },
        { id: uid(), field: "valorPrincipal", op: "between", value: "40,70", value2: "",
          color: "#f59e0b", label: "Medium", enabled: true },
        { id: uid(), field: "valorPrincipal", op: "gte",     value: "70",    value2: "",
          color: "#00e5a0", label: "High",   enabled: true },
    ];
}

/**
 * Parse a "between" range from the rule.value string. Tolerant format:
 * accepts "3,8", "[3,8]", "(3,8)", "3..8", "3 - 8", with optional decimals.
 * Falls back to [rule.value, rule.value2] for backward compatibility with
 * rules persisted before this change.
 * Returns [min, max] (auto-sorts) or null if unparseable.
 */
function parseBetween(value: string, value2?: string): [number, number] | null {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
        const s = String(value).trim()
            .replace(/^[\[\(]+/, "")
            .replace(/[\]\)]+$/, "");
        const parts = s.split(/\s*(?:,|\.\.|\s+to\s+|\s-\s|;)\s*/)
                       .map(p => p.trim())
                       .filter(p => p.length > 0);
        if (parts.length >= 2) {
            const a = parseFloat(parts[0]);
            const b = parseFloat(parts[1]);
            if (!isNaN(a) && !isNaN(b)) {
                return a <= b ? [a, b] : [b, a];
            }
        }
        if (parts.length === 1 && value2) {
            const a = parseFloat(parts[0]);
            const b = parseFloat(value2);
            if (!isNaN(a) && !isNaN(b)) return a <= b ? [a, b] : [b, a];
        }
    }
    // Legacy fallback: two separate fields
    if (value2 !== undefined) {
        const a = parseFloat(value || "");
        const b = parseFloat(value2);
        if (!isNaN(a) && !isNaN(b)) return a <= b ? [a, b] : [b, a];
    }
    return null;
}

function evalRule(rule: ColorRule, obj: SynopticObject): boolean {
    const map: Record<string,string|number|undefined> = {
        campoTexto1:    obj.campoTexto1,
        valorPrincipal: obj.valorPrincipal,
    };
    const raw = map[rule.field];
    if (raw === undefined || raw === null) return false;
    const rv = parseFloat(rule.value);
    const nv = typeof raw==="number" ? raw : parseFloat(String(raw));
    switch(rule.op){
        case "eq":      return String(raw)===String(rule.value);
        case "neq":     return String(raw)!==String(rule.value);
        case "gt":      return nv>rv;
        case "gte":     return nv>=rv;
        case "lt":      return nv<rv;
        case "lte":     return nv<=rv;
        case "between": {
            const range = parseBetween(rule.value, rule.value2);
            if (!range) return false;
            return nv >= range[0] && nv <= range[1];
        }
        default:        return false;
    }
}

function applyRules(rules: ColorRule[], obj: SynopticObject, fb: string): {color:string;label:string} {
    for (const r of rules) {
        if (!r.enabled) continue;
        if (evalRule(r,obj)) return {color:r.color,label:r.label};
    }
    return {color:fb,label:"—"};
}

// ── Layout ────────────────────────────────────────────────────────────────────
interface Cell { id:string; x:number; y:number; w:number; h:number; }

function autoLayout(ids: string[], W: number, H: number): Cell[] {
    const n=ids.length, asp=W/H;
    const cols=Math.max(1,Math.round(Math.sqrt(n*asp)));
    const pad=5;
    const cw=Math.floor((W-pad*(cols+1))/cols);
    const rows=Math.max(1,Math.ceil(n/cols));
    const ch=Math.floor((H-pad*(rows+1))/rows);
    return ids.map((id,i)=>({
        id, x:pad+(i%cols)*(cw+pad), y:pad+Math.floor(i/cols)*(ch+pad), w:cw, h:ch,
    }));
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function buildTooltip(obj: SynopticObject, color: string, ruleLabel: string,
                      mainValName: string): HTMLElement {
    const wrap = mk("div",{
        background:CLR.panel, border:`1px solid ${color}66`, borderRadius:"10px",
        padding:"13px 16px", minWidth:"200px", maxWidth:"320px",
        fontFamily:"'Segoe UI',sans-serif",
        boxShadow:"0 10px 32px rgba(0,0,0,.55)", pointerEvents:"none",
    });
    const hdr = mk("div",{display:"flex",justifyContent:"space-between",
                           alignItems:"center",marginBottom:"10px",gap:"10px"});
    const ttl = mk("div",{color:color,fontWeight:"700",fontSize:"14px",letterSpacing:".03em"});
    ttl.textContent = obj.label||obj.id;
    const badgeTxt = readableOn(color, CLR.panel, 1);
    const bdg = mk("span",{
        background:color, border:"none",
        borderRadius:"4px", padding:"2px 9px", fontSize:"9px",
        color:badgeTxt, fontWeight:"700", letterSpacing:".04em",
        textTransform:"uppercase", whiteSpace:"nowrap", flexShrink:"0",
    });
    bdg.textContent = ruleLabel;
    hdr.appendChild(ttl); hdr.appendChild(bdg); wrap.appendChild(hdr);

    const tbl = mk("table",{borderCollapse:"collapse",width:"100%"});
    const addRow = (lbl: string, val: string, isNumeric: boolean) => {
        if (!val) return;
        const tr = mk("tr");
        const td1 = mk("td",{
            color:CLR.dim,fontSize:"10px",
            textTransform:"uppercase",letterSpacing:".06em",fontWeight:"600",
            padding:"3px 12px 3px 0",whiteSpace:"nowrap",
            verticalAlign:"top",
        });
        const td2 = mk("td",{
            color:CLR.text,fontSize:"11px",fontWeight:"600",padding:"3px 0",
            textAlign: isNumeric ? "right" : "left",
            verticalAlign:"top",
        });
        td1.textContent = lbl;
        td2.textContent = val;
        tr.appendChild(td1); tr.appendChild(td2); tbl.appendChild(tr);
    };

    // Main Value first if present (it's the primary metric — drives the fill bar)
    if (obj.valorPrincipal !== undefined && obj.valorPrincipal !== null) {
        addRow(cleanFieldName(mainValName) || "Main Value",
               formatTooltipValue(obj.valorPrincipal),
               true);
    }
    // Text Field 1 next — the categorical field used by rules
    if (obj.campoTexto1) {
        addRow("Status", formatTooltipValue(obj.campoTexto1), false);
    }
    // Then user-added numeric tooltip fields, in order
    for (const f of obj.tooltipNumbers) {
        addRow(cleanFieldName(f.name), f.value, true);
    }
    // Then user-added text tooltip fields, in order
    for (const f of obj.tooltipTexts) {
        addRow(cleanFieldName(f.name), f.value, false);
    }

    wrap.appendChild(tbl);
    return wrap;
}

// ── Rules Editor ──────────────────────────────────────────────────────────────
const OPS = [
    {k:"eq",l:"= equals"},{k:"neq",l:"≠ not equals"},
    {k:"gt",l:"> greater"},{k:"gte",l:"≥ greater/equal"},
    {k:"lt",l:"< less"},{k:"lte",l:"≤ less/equal"},
    {k:"between",l:"between"},
];
const FIELDS = [
    {k:"campoTexto1",   l:"Text Field 1"},
    {k:"valorPrincipal",l:"Main Value"},
];

class RulesEditor {
    private panel:   HTMLElement;
    private listEl:  HTMLElement;
    private legEl:   HTMLElement;
    private rules:   ColorRule[] = [];
    private visible  = false;
    private onSave:  (r: ColorRule[]) => void;

    constructor(parent: HTMLElement, onSave: (r: ColorRule[]) => void) {
        this.onSave = onSave;

        this.panel = mk("div",{
            position:"absolute", top:"32px", right:"0",
            width:"550px", maxHeight:"calc(100% - 40px)",
            background:CLR.surface, border:`1px solid ${CLR.hi}`,
            borderRadius:"10px", boxShadow:"0 12px 40px rgba(0,0,0,.8)",
            zIndex:"1000", display:"none", overflowY:"auto",
            fontFamily:"'Segoe UI',sans-serif",
        });

        // Header
        const hdr = mk("div",{
            padding:"10px 14px", borderBottom:`1px solid ${CLR.border}`,
            display:"flex", justifyContent:"space-between", alignItems:"center",
            position:"sticky", top:"0", background:CLR.surface, zIndex:"10",
        });
        const ht = mk("div");
        const hs = mk("div",{fontSize:"7px",color:CLR.dim,letterSpacing:".12em",
                              textTransform:"uppercase",marginBottom:"1px"});
        hs.textContent="Synoptic Studio";
        const hm = mk("div",{fontSize:"13px",color:CLR.green,fontWeight:"700"});
        hm.textContent="Color Rules Engine";
        ht.appendChild(hs); ht.appendChild(hm);
        const cb = mk("button",btn(CLR.dim)); cb.textContent="✕ close";
        cb.addEventListener("click",()=>this.hide());
        hdr.appendChild(ht); hdr.appendChild(cb);
        this.panel.appendChild(hdr);

        // Body
        const body = mk("div",{padding:"12px 14px"});

        // Info
        const info = mk("div",{
            background:CLR.card, border:`1px solid ${CLR.border}`,
            borderLeft:`3px solid ${CLR.green}`, borderRadius:"6px",
            padding:"7px 10px", marginBottom:"10px",
            fontSize:"8px", color:CLR.muted, lineHeight:"1.6",
        });
        info.textContent="Rules evaluate top to bottom — first match sets the color. Use ↑↓ to adjust priority. Checkbox enables/disables without deleting.";
        body.appendChild(info);

        // Palette
        const pb = mk("div",{background:CLR.card,border:`1px solid ${CLR.border}`,
                               borderRadius:"6px",padding:"7px 10px",marginBottom:"10px"});
        const pt = mk("div",{fontSize:"7px",color:CLR.dim,textTransform:"uppercase",
                               letterSpacing:".08em",marginBottom:"5px"});
        pt.textContent="PALETTE"; pb.appendChild(pt);
        const pr = mk("div",{display:"flex",flexWrap:"wrap",gap:"4px"});
        PALETTE.forEach(h=>{
            const d=mk("div",{width:"20px",height:"20px",borderRadius:"4px",
                               background:h,border:"1px solid rgba(255,255,255,.12)"});
            d.title=h; pr.appendChild(d);
        });
        pb.appendChild(pr); body.appendChild(pb);

        // Rules header row
        const rh=mk("div",{display:"flex",justifyContent:"space-between",
                             alignItems:"center",marginBottom:"6px"});
        const rl=mk("div",{fontSize:"8px",color:CLR.dim});
        rl.textContent="RULES — evaluated in order";
        const ab=mk("button",{...btn(CLR.green,CLR.glo),padding:"3px 10px"});
        ab.textContent="+ Add rule";
        ab.addEventListener("click",()=>{
            this.rules.push({id:uid(),field:"campoTexto1",op:"eq",
                              value:"",value2:"",color:"#00e5a0",
                              label:"New rule",enabled:true});
            this.renderList();
        });
        rh.appendChild(rl); rh.appendChild(ab); body.appendChild(rh);

        this.listEl=mk("div"); body.appendChild(this.listEl);

        // Legend label
        const ll=mk("div",{fontSize:"7px",color:CLR.dim,textTransform:"uppercase",
                             letterSpacing:".08em",marginTop:"10px",marginBottom:"5px"});
        ll.textContent="LEGEND PREVIEW"; body.appendChild(ll);
        this.legEl=mk("div",{display:"flex",flexWrap:"wrap",gap:"4px"});
        body.appendChild(this.legEl);

        // Save
        const sw=mk("div",{marginTop:"12px",paddingTop:"10px",
                             borderTop:`1px solid ${CLR.border}`,
                             display:"flex",justifyContent:"flex-end"});
        const sb=mk("button",{...btn(CLR.green,CLR.glo),
                                padding:"6px 18px",fontSize:"10px",fontWeight:"700"});
        sb.textContent="✓ Save rules";
        sb.addEventListener("click",()=>{ this.onSave(this.rules); this.hide(); });
        sw.appendChild(sb); body.appendChild(sw);

        this.panel.appendChild(body);
        parent.appendChild(this.panel);
    }

    load(rules: ColorRule[]): void {
        this.rules=rules.map(r=>({...r,id:r.id||uid()}));
        this.renderList();
    }

    show():   void { this.panel.style.display="block"; this.visible=true; }
    hide():   void { this.panel.style.display="none";  this.visible=false; }
    toggle(): void { this.visible ? this.hide() : this.show(); }

    private renderList(): void {
        clearNode(this.listEl);
        this.rules.forEach((r,i)=>this.listEl.appendChild(this.buildRow(r,i)));
        clearNode(this.legEl);
        this.rules.filter(r=>r.enabled).forEach(r=>{
            const c=mk("div",{display:"flex",alignItems:"center",gap:"3px",
                               padding:"2px 7px",borderRadius:"3px",
                               background:hexToRgba(r.color,.12),
                               border:`1px solid ${hexToRgba(r.color,.4)}`});
            const d=mk("div",{width:"7px",height:"7px",borderRadius:"1px",background:r.color,flexShrink:"0"});
            const l=mk("span",{fontSize:"8px",color:r.color});
            l.textContent=r.label||"—";
            c.appendChild(d); c.appendChild(l); this.legEl.appendChild(c);
        });
    }

    private buildRow(rule: ColorRule, idx: number): HTMLElement {
        const row=mk("div",{
            display:"flex", alignItems:"center", gap:"4px",
            padding:"5px 7px", borderRadius:"5px", marginBottom:"3px",
            background:rule.enabled?CLR.card:CLR.lo,
            border:`1px solid ${rule.enabled?hexToRgba(rule.color,.4):CLR.border}`,
            opacity:rule.enabled?"1":"0.45",
        });

        // Toggle
        const ck=mk("div",{
            width:"12px",height:"12px",borderRadius:"2px",flexShrink:"0",
            background:rule.enabled?rule.color:"none",
            border:`1.5px solid ${rule.color}`,cursor:"pointer",
        });
        ck.addEventListener("click",()=>{ rule.enabled=!rule.enabled; this.renderList(); });
        row.appendChild(ck);

        // Color dot + popup
        const cd=mk("div",{
            width:"16px",height:"16px",borderRadius:"3px",
            background:rule.color,cursor:"pointer",flexShrink:"0",
            border:"1.5px solid rgba(255,255,255,.2)",position:"relative",
        });
        const pop=mk("div",{
            position:"absolute",top:"22px",left:"0",zIndex:"2000",
            background:CLR.panel,border:`1px solid ${CLR.hi}`,
            borderRadius:"8px",padding:"6px",
            display:"none",flexWrap:"wrap",gap:"3px",width:"130px",
            boxShadow:"0 8px 24px rgba(0,0,0,.9)",
        });
        // Tag this popup so we can find and close sibling popups
        pop.setAttribute("data-palette-popup", "1");
        PALETTE.forEach(h=>{
            const s=mk("div",{
                width:"18px",height:"18px",borderRadius:"3px",background:h,cursor:"pointer",
                border:rule.color===h?"2.5px solid #fff":"1px solid rgba(255,255,255,.15)",
            });
            s.addEventListener("click",(e)=>{
                e.stopPropagation(); rule.color=h;
                pop.style.display="none"; this.renderList();
            });
            pop.appendChild(s);
        });
        cd.appendChild(pop);
        cd.addEventListener("click",(e)=>{
            e.stopPropagation();
            const opening = pop.style.display === "none";
            // Close every other open palette before opening this one — prevents
            // multiple popups stacking on top of each other.
            document.querySelectorAll('[data-palette-popup="1"]').forEach(el => {
                if (el !== pop) (el as HTMLElement).style.display = "none";
            });
            pop.style.display = opening ? "flex" : "none";
        });
        row.appendChild(cd);

        // Field
        const fs=mk("select",{...INP,maxWidth:"108px",flexShrink:"0"}) as HTMLSelectElement;
        FIELDS.forEach(f=>{
            const o=document.createElement("option");
            o.value=f.k; o.textContent=f.l;
            if(f.k===rule.field) o.selected=true;
            fs.appendChild(o);
        });
        fs.addEventListener("change",()=>rule.field=fs.value);
        row.appendChild(fs);

        // Op
        const os=mk("select",{...INP,maxWidth:"88px",flexShrink:"0"}) as HTMLSelectElement;
        OPS.forEach(o=>{
            const opt=document.createElement("option");
            opt.value=o.k; opt.textContent=o.l;
            if(o.k===rule.op) opt.selected=true;
            os.appendChild(opt);
        });
        os.addEventListener("change",()=>{ rule.op=os.value; this.renderList(); });
        row.appendChild(os);

        // Value — placeholder adapts to the operator.
        // For "between" we use a single input that accepts "a, b" (tolerant).
        const vi = mk("input",{...INP,flex:"1",minWidth:"0"}) as HTMLInputElement;
        if (rule.op === "between") {
            // If coming from the old two-field format, coalesce into "a, b"
            if (!rule.value && rule.value2) {
                rule.value = rule.value2;
                rule.value2 = "";
            } else if (rule.value && rule.value2 && !rule.value.includes(",")) {
                rule.value = `${rule.value}, ${rule.value2}`;
                rule.value2 = "";
            }
            vi.placeholder = "e.g. 3, 8";
        } else if (rule.op === "eq" || rule.op === "neq") {
            vi.placeholder = "text value";
        } else {
            vi.placeholder = "number";
        }
        vi.value = rule.value;
        const validateBetween = () => {
            if (rule.op !== "between") { vi.style.borderColor = CLR.border; return; }
            const ok = parseBetween(vi.value) !== null;
            vi.style.borderColor = ok || vi.value.trim() === "" ? CLR.border : CLR.red;
        };
        vi.addEventListener("input", () => {
            rule.value = vi.value;
            validateBetween();
        });
        validateBetween();
        row.appendChild(vi);

        // Label
        const li=mk("input",{...INP,width:"78px",flexShrink:"0"}) as HTMLInputElement;
        li.value=rule.label; li.placeholder="label";
        li.addEventListener("input",()=>rule.label=li.value);
        row.appendChild(li);

        // Up
        const ub=mk("button",btn(idx===0?CLR.lo:CLR.dim)); ub.textContent="↑";
        (ub as HTMLButtonElement).disabled=idx===0;
        ub.addEventListener("click",()=>{
            if(idx>0){ [this.rules[idx-1],this.rules[idx]]=[this.rules[idx],this.rules[idx-1]]; this.renderList(); }
        });
        row.appendChild(ub);

        // Down
        const db=mk("button",btn(idx===this.rules.length-1?CLR.lo:CLR.dim)); db.textContent="↓";
        (db as HTMLButtonElement).disabled=idx===this.rules.length-1;
        db.addEventListener("click",()=>{
            if(idx<this.rules.length-1){ [this.rules[idx],this.rules[idx+1]]=[this.rules[idx+1],this.rules[idx]]; this.renderList(); }
        });
        row.appendChild(db);

        // Del
        const xb=mk("button",btn(CLR.red)); xb.textContent="✕";
        xb.addEventListener("click",()=>{ this.rules.splice(idx,1); this.renderList(); });
        row.appendChild(xb);

        return row;
    }
}

// ── Visual ────────────────────────────────────────────────────────────────────
export class Visual implements IVisual {
    private target:      HTMLElement;
    private wrapper:     HTMLElement;
    private svg:         SVGSVGElement;
    private tooltipDiv:  HTMLDivElement;
    private legendBar:   HTMLElement;
    private editor:      RulesEditor;
    private fmtSvc:      FormattingSettingsService;
    private fmtSettings: VisualFormattingSettingsModel;
    private selMgr:      ISelectionManager;
    private host:        powerbi.extensibility.visual.IVisualHost;
    private selectedIds: Set<string>     = new Set();
    private rules:       ColorRule[]     = [];
    private objects:     SynopticObject[]= [];
    private legendFilter: string | null   = null;
    // Pan / Zoom / Rotation state
    private panX     = 0;
    private panY     = 0;
    private zoomLevel= 1.0;
    // Rotation is stored in INTERNAL degrees (math space).
    // The UI labels use DISPLAY degrees where 0° = natural orientation of this layout.
    // Conversion: internal = (display + 180) % 360   |   display = (internal + 180) % 360
    private rotation = 180; // internal 180 = display 0° (natural orientation)
    private isPanning= false;
    private panStartX= 0;
    private panStartY= 0;
    private panOriginX=0;
    private panOriginY=0;
    private transformGroup: SVGElement | null = null;
    private textLayer:      SVGElement | null = null;
    private labelsGroup:    SVGElement | null = null;
    private fillLayer:      SVGElement | null = null;
    private mainValueName: string = "";
    private fallback     = "#52626a";
    private showLabel    = true;
    private showValue    = true;
    private vpW          = 0;
    private vpH          = 0;

    constructor(options: VisualConstructorOptions) {
        this.host   = options.host;
        this.target = options.element;
        this.selMgr = this.host.createSelectionManager();
        this.fmtSvc = new FormattingSettingsService();

        // Detect PBI report theme from host color palette
        CLR = getTheme(this.isHostDark());
        this.target.style.cssText=
            `position:relative;width:100%;height:100%;overflow:hidden;`+
            `background:${CLR.bg};font-family:'Segoe UI',sans-serif;`;

        // Top bar
        const bar=mk("div",{
            position:"absolute",top:"0",left:"0",right:"0",height:"30px",
            background:CLR.surface,borderBottom:`1px solid ${CLR.border}`,
            display:"flex",alignItems:"center",padding:"0 10px",gap:"6px",zIndex:"100",
            boxShadow:"0 1px 4px rgba(0,0,0,.15)",
        });
        // ── Row 1: controls bar ──────────────────────────────────────────────────
        const gb=mk("button",{
            background:CLR.green,border:"none",color:"#07090a",
            borderRadius:"4px",padding:"3px 7px",cursor:"pointer",
            fontFamily:"'Segoe UI',sans-serif",fontSize:"13px",fontWeight:"700",
            lineHeight:"1",flexShrink:"0",
        });
        gb.textContent="⚙";
        gb.setAttribute("title","Color Rules");
        bar.appendChild(gb);
        bar.appendChild(mk("div",{width:"1px",height:"16px",background:CLR.border,
                                   flexShrink:"0",margin:"0 4px"}));
        // Controls go directly in bar row 1
        const ctrlWrap=mk("div",{
            display:"flex",alignItems:"center",gap:"3px",
            flex:"1",flexWrap:"nowrap",overflow:"hidden",
        });
        bar.appendChild(ctrlWrap);
        this.target.appendChild(bar);

        // ── Row 2: legend bar (full width, always visible) ───────────────────
        const legendRow=mk("div",{
            position:"absolute",top:"30px",left:"0",right:"0",
            height:"24px",minHeight:"24px",
            background:CLR.panel,
            borderBottom:`1px solid ${CLR.border}`,
            display:"flex",alignItems:"center",
            padding:"0 8px",gap:"5px",zIndex:"99",
            overflow:"hidden",
        });
        this.legendBar=mk("div",{
            display:"flex",gap:"5px",flexWrap:"nowrap",
            alignItems:"center",flex:"1",overflow:"hidden",minWidth:"0",
        });
        legendRow.appendChild(this.legendBar);
        this.target.appendChild(legendRow);

        // Canvas wrapper
        this.wrapper=mk("div",{position:"absolute",top:"54px",left:"0",right:"0",bottom:"0"});
        this.target.appendChild(this.wrapper);

        // SVG — set up persistent structure once
        this.svg=document.createElementNS("http://www.w3.org/2000/svg","svg") as SVGSVGElement;
        this.svg.style.cssText="position:absolute;top:0;left:0;width:100%;height:100%";
        this.wrapper.appendChild(this.svg);

        // Create persistent layers immediately
        // Order: bg → shapes (rotates) → fill (upright) → labels (upright) → compass
        const initBg = svgEl("rect",{"id":"bg-rect",width:"100%",height:"100%",fill:CLR.bg});
        this.svg.appendChild(initBg);
        const initTg = svgEl("g",{"id":"transform-group"});
        this.svg.appendChild(initTg);
        this.transformGroup = initTg;
        const initFl = svgEl("g",{"id":"fill-layer"});
        this.svg.appendChild(initFl);
        this.fillLayer = initFl;
        const initTlg = svgEl("g",{"id":"text-layer"});
        this.svg.appendChild(initTlg);
        this.textLayer = initTlg;
        const initLg = svgEl("g",{"id":"labels-group"});
        this.svg.appendChild(initLg);
        this.labelsGroup = initLg;

        // Tooltip
        this.tooltipDiv=document.createElement("div") as HTMLDivElement;
        this.tooltipDiv.style.cssText="position:absolute;display:none;z-index:9999;pointer-events:none";
        this.wrapper.appendChild(this.tooltipDiv);

        // Editor
        this.editor=new RulesEditor(this.target,(rules)=>{
            this.rules=rules;
            const json = JSON.stringify(rules);
            this.fmtSettings.reglaColorCard.reglasJson.value = json;
            // CRITICAL: persist to PBI so rules survive reload / close-reopen.
            // Without this the rules only live in memory and get lost.
            this.host.persistProperties({
                merge: [{
                    objectName: "reglas",
                    selector: null as unknown as powerbi.data.Selector,
                    properties: { reglasJson: json },
                }],
            });
            this.draw(); this.drawLegend();
        });

        gb.addEventListener("click",(e)=>{ e.stopPropagation(); this.editor.toggle(); });

        // Separator
        // Controls separator — pushed right, never shrinks
        ctrlWrap.appendChild(mk("div",{width:"1px",height:"20px",background:CLR.border,
                                   marginLeft:"4px",flexShrink:"0"}));

        // Rotation buttons
        const rotLabel = mk("span",{fontSize:"9px",color:CLR.text,
                                     fontFamily:"'Segoe UI',sans-serif",
                                     marginLeft:"4px",fontWeight:"600",flexShrink:"0"});
        rotLabel.textContent="Rotate:";
        ctrlWrap.appendChild(rotLabel);

        [0,90,180,270].forEach(displayDeg=>{
            const internalDeg = (displayDeg + 180) % 360;
            const rb=mk("button",{
                fontFamily:"'Segoe UI',sans-serif",fontSize:"9px",
                padding:"2px 8px",background:CLR.card,
                border:`1px solid ${CLR.border}`,color:CLR.text,
                borderRadius:"3px",cursor:"pointer",marginLeft:"2px",
                fontWeight:"500",
            });
            rb.textContent=`${displayDeg}°`;
            rb.id=`rot-btn-${internalDeg}`;
            rb.addEventListener("click",(e)=>{
                e.stopPropagation();
                this.rotation=internalDeg;
                this.panX=0; this.panY=0; this.zoomLevel=1.0;
                this.applyTransform();
                this.drawCompassRotated();
            });
            ctrlWrap.appendChild(rb);
        });

        // Zoom controls
        ctrlWrap.appendChild(mk("div",{width:"1px",height:"20px",background:CLR.border,
                                   marginLeft:"6px",flexShrink:"0"}));
        const zoomIn=mk("button",{fontFamily:"'Segoe UI',sans-serif",fontSize:"12px",
            padding:"1px 9px",background:CLR.card,
            border:`1px solid ${CLR.border}`,color:CLR.text,
            borderRadius:"3px",cursor:"pointer",marginLeft:"4px",fontWeight:"700"});
        zoomIn.textContent="+";
        zoomIn.addEventListener("click",(e)=>{
            e.stopPropagation();
            this.zoomLevel=Math.min(this.zoomLevel*1.25,5);
            this.applyTransform();
        });
        ctrlWrap.appendChild(zoomIn);

        const zoomOut=mk("button",{fontFamily:"'Segoe UI',sans-serif",fontSize:"12px",
            padding:"1px 9px",background:CLR.card,
            border:`1px solid ${CLR.border}`,color:CLR.text,
            borderRadius:"3px",cursor:"pointer",marginLeft:"2px",fontWeight:"700"});
        zoomOut.textContent="−";
        zoomOut.addEventListener("click",(e)=>{
            e.stopPropagation();
            this.zoomLevel=Math.max(this.zoomLevel/1.25,0.2);
            this.applyTransform();
        });
        ctrlWrap.appendChild(zoomOut);

        const zoomDisplay = mk("span",{
            fontFamily:"'Segoe UI',sans-serif",fontSize:"9px",
            color:CLR.text,marginLeft:"4px",minWidth:"32px",
            textAlign:"center",fontWeight:"600",flexShrink:"0",
        });
        zoomDisplay.id="zoom-display";
        zoomDisplay.textContent="100%";
        ctrlWrap.appendChild(zoomDisplay);

        // Reset button — resets to 180° (the natural orientation for this layout)
        const resetBtn=mk("button",{fontFamily:"'Segoe UI',sans-serif",fontSize:"9px",
            padding:"2px 9px",background:CLR.card,
            border:`1px solid ${CLR.border}`,color:CLR.text,
            borderRadius:"3px",cursor:"pointer",marginLeft:"4px",fontWeight:"500"});
        resetBtn.textContent="↺ Reset";
        resetBtn.addEventListener("click",(e)=>{
            e.stopPropagation();
            this.panX=0; this.panY=0; this.zoomLevel=1.0; this.rotation=180;
            this.applyTransform();
            this.drawCompassRotated();
        });
        ctrlWrap.appendChild(resetBtn);
        this.svg.addEventListener("click",()=>{
            this.selectedIds.clear(); this.selMgr.clear();
            this.legendFilter = null;
            this.editor.hide();
            this.drawLegend();
        });

        // Wheel zoom — use capture to intercept before PBI
        this.wrapper.addEventListener("wheel",(e:WheelEvent)=>{
            e.preventDefault();
            e.stopPropagation();
            const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
            this.zoomLevel = Math.max(0.15, Math.min(8, this.zoomLevel * factor));
            this.applyTransform();
        }, {passive:false, capture:true});

        // Pan — mousedown
        this.wrapper.addEventListener("mousedown",(e:MouseEvent)=>{
            // Pan on background click (left button on blank canvas)
                if((e.target as Element)===this.svg||
                   (e.target as Element)===this.svg.firstElementChild){
                    this.isPanning=true;
                    this.panStartX=e.clientX;
                    this.panStartY=e.clientY;
                    this.panOriginX=this.panX;
                    this.panOriginY=this.panY;
                    this.wrapper.style.cursor="grabbing";
                }
        });
        window.addEventListener("mousemove",(e:MouseEvent)=>{
            if(!this.isPanning) return;
            this.panX=this.panOriginX+(e.clientX-this.panStartX);
            this.panY=this.panOriginY+(e.clientY-this.panStartY);
            this.applyTransform();
        });
        window.addEventListener("mouseup",()=>{
            if(this.isPanning){
                this.isPanning=false;
                this.wrapper.style.cursor="default";
            }
        });
    }

    public update(options: VisualUpdateOptions): void {
        CLR = getTheme(this.isHostDark());
        this.target.style.background = CLR.bg;
        this.fmtSettings=this.fmtSvc.populateFormattingSettingsModel(
            VisualFormattingSettingsModel, options.dataViews[0]);

        this.vpW=options.viewport.width;
        this.vpH=options.viewport.height-54;
        this.svg.setAttribute("viewBox",`0 0 ${this.vpW} ${this.vpH}`);

        // Parse persisted rules. Distinguish between:
        //  - Never configured (value is empty/null)  → inject defaults
        //  - User cleared all rules (value is "[]")  → respect empty state
        const persistedRaw = this.fmtSettings.reglaColorCard.reglasJson.value;
        const neverConfigured = persistedRaw === undefined
                             || persistedRaw === null
                             || String(persistedRaw).trim() === "";
        if (neverConfigured) {
            this.rules = defaultRules();
            // Persist defaults so user sees same rules on reopen
            const seedJson = JSON.stringify(this.rules);
            this.fmtSettings.reglaColorCard.reglasJson.value = seedJson;
            this.host.persistProperties({
                merge: [{
                    objectName: "reglas",
                    selector: null as unknown as powerbi.data.Selector,
                    properties: { reglasJson: seedJson },
                }],
            });
        } else {
            try { this.rules = JSON.parse(String(persistedRaw) || "[]"); }
            catch { this.rules = []; }
        }
        this.rules = this.rules.map(r => ({...r, id: r.id || uid()}));
        this.editor.load(this.rules);

        this.fallback  =this.fmtSettings.generalCard.colorFallback.value.value||"#52626a";
        this.showLabel =this.fmtSettings.generalCard.mostrarEtiqueta.value;
        this.showValue =this.fmtSettings.generalCard.mostrarValor.value;

        const dv=options.dataViews?.[0];
        if(!dv?.categorical?.categories?.length){ this.drawEmpty(); return; }

        const cats = dv.categorical.categories;
        const vals = dv.categorical.values || [];

        // Single-value role indices (the first occurrence wins)
        const ri: Record<string, number> = {};
        cats.forEach((c, i) => {
            if (c.source.roles) Object.keys(c.source.roles).forEach(r => {
                if (ri[r] === undefined) ri[r] = i;
            });
        });
        const vi: Record<string, number> = {};
        vals.forEach((v, i) => {
            if (v.source.roles) Object.keys(v.source.roles).forEach(r => {
                if (vi[r] === undefined) vi[r] = i;
            });
        });

        // Multi-value role indices (collect ALL items with the role)
        const tooltipTextIdx: number[] = [];
        cats.forEach((c, i) => {
            if (c.source.roles && c.source.roles["tooltipText"]) tooltipTextIdx.push(i);
        });
        const tooltipNumIdx: number[] = [];
        vals.forEach((v, i) => {
            if (v.source.roles && v.source.roles["tooltipNumbers"]) tooltipNumIdx.push(i);
        });

        // Capture display name of the Main Value column for the tooltip header row
        this.mainValueName = vi["valorPrincipal"] !== undefined
            ? vals[vi["valorPrincipal"]].source.displayName
            : "";

        // Get a single-value field by role (used for ID, label, layout, etc.)
        const valueAt = (role: string, i: number): string|undefined =>
            ri[role] !== undefined ? String(cats[ri[role]].values[i] ?? "") : undefined;
        const numAt = (role: string, i: number): number|undefined => {
            if (vi[role] === undefined) return undefined;
            const raw = vals[vi[role]].values[i];
            if (raw === null || raw === undefined) return undefined;
            const n = Number(raw);
            return isNaN(n) ? undefined : n;
        };
        const layoutAt = (role: string, i: number, fallback: number): number|undefined => {
            if (ri[role] === undefined) return undefined;
            const raw = cats[ri[role]].values[i];
            const n = parseFloat(String(raw ?? fallback));
            return isNaN(n) ? fallback : n;
        };

        const n = cats[0]?.values?.length || 0;
        this.objects = [];
        for (let i = 0; i < n; i++) {
            const id = valueAt("invernadero", i) || String(i);

            // Collect this row's tooltip extras
            const tooltipNumbers: TooltipField[] = tooltipNumIdx.map(idx => {
                const raw = vals[idx].values[i];
                return {
                    name:  vals[idx].source.displayName,
                    value: formatTooltipValue(raw),
                    isNumeric: true,
                };
            }).filter(f => f.value !== "");

            const tooltipTexts: TooltipField[] = tooltipTextIdx.map(idx => {
                const raw = cats[idx].values[i];
                return {
                    name:  cats[idx].source.displayName,
                    value: formatTooltipValue(raw),
                    isNumeric: false,
                };
            }).filter(f => f.value !== "");

            this.objects.push({
                id,
                label:          valueAt("etiqueta", i) || id,
                valorPrincipal: numAt("valorPrincipal", i),
                campoTexto1:    valueAt("campoTexto1", i),
                layoutX:        layoutAt("layoutX", i, 0),
                layoutY:        layoutAt("layoutY", i, 0),
                layoutW:        layoutAt("layoutW", i, 22),
                layoutH:        layoutAt("layoutH", i, 46),
                tooltipNumbers,
                tooltipTexts,
                selectionId: this.host.createSelectionIdBuilder()
                    .withCategory(cats[ri["invernadero"] ?? 0], i)
                    .createSelectionId(),
            });
        }
        this.draw(); this.drawLegend();
    }

    private draw(): void {
        const W=this.vpW, H=this.vpH;

        // Update background rect without clearing entire SVG
        let bgRect = this.svg.getElementById("bg-rect") as SVGElement;
        if(!bgRect){
            bgRect = svgEl("rect",{"id":"bg-rect"});
            this.svg.insertBefore(bgRect, this.svg.firstChild);
        }
        bgRect.setAttribute("width",String(W));
        bgRect.setAttribute("height",String(H));
        bgRect.setAttribute("fill",CLR.bg);

        if(!this.objects.length){ this.drawEmpty(); return; }

        // Transform group — clear contents only, preserve the element (keeps transform)
        let tg = this.svg.getElementById("transform-group") as SVGElement;
        if(!tg){
            tg = svgEl("g",{"id":"transform-group"});
            this.svg.appendChild(tg);
        }
        clearNode(tg);
        this.transformGroup = tg;

        // Fill layer — clear contents, keep element (upright, gravity-aware)
        let fl = this.svg.getElementById("fill-layer") as SVGElement;
        if(!fl){
            fl = svgEl("g",{"id":"fill-layer"});
            this.svg.appendChild(fl);
        }
        clearNode(fl);
        this.fillLayer = fl;

        // Text layer — clear contents, keep element
        let tlg = this.svg.getElementById("text-layer") as SVGElement;
        if(!tlg){
            tlg = svgEl("g",{"id":"text-layer"});
            this.svg.appendChild(tlg);
        }
        clearNode(tlg);
        this.textLayer = tlg;

        // Labels group — pan+zoom only, NO rotation
        let lg = this.svg.getElementById("labels-group") as SVGElement;
        if(!lg){
            lg = svgEl("g",{"id":"labels-group"});
            this.svg.appendChild(lg);
        }
        clearNode(lg);
        this.labelsGroup = lg;

        // Remove old compass before redrawing
        const oldCompass = this.svg.getElementById("compass-group");
        if(oldCompass && oldCompass.parentNode) oldCompass.parentNode.removeChild(oldCompass);

        // Use fixed layout if objects have layoutX/layoutY, else auto-grid
        const hasFixed = this.objects.length > 0 && this.objects[0].layoutX !== undefined;
        let layout: Cell[];
        if (hasFixed) {
            // Scale fixed coords to current viewport
            const srcW = this.objects[0].layoutX !== undefined
                ? Math.max(...this.objects.map(o=>( o.layoutX||0)+(o.layoutW||22))) : 940;
            const srcH = Math.max(...this.objects.map(o=>(o.layoutY||0)+(o.layoutH||46)));
            const scaleX = W / Math.max(srcW, 1);
            const scaleY = H / Math.max(srcH, 1);
            const scale  = Math.min(scaleX, scaleY) * 0.96;
            const offX   = (W - srcW * scale) / 2;
            const offY   = (H - srcH * scale) / 2;
            layout = this.objects.map(o => ({
                id: o.id,
                x:  Math.round((o.layoutX||0) * scale + offX),
                y:  Math.round((o.layoutY||0) * scale + offY),
                w:  Math.round((o.layoutW||22) * scale),
                h:  Math.round((o.layoutH||46) * scale),
            }));
        } else {
            layout = autoLayout(this.objects.map(o=>o.id),W,H);
        }
        const cm: Record<string,Cell>={};
        layout.forEach(c=>cm[c.id]=c);

        this.objects.forEach(obj=>{
            const cell=cm[obj.id]; if(!cell) return;
            const {color,label:rl}=applyRules(this.rules,obj,this.fallback);
            const isSel=this.selectedIds.has(obj.id);
            const dimmed=this.selectedIds.size>0&&!isSel;
            const g=svgEl("g",{});
            g.setAttribute("style","cursor:pointer");

            // Container rect (rotates with shapes)
            g.appendChild(svgEl("rect",{
                x:String(cell.x),y:String(cell.y),
                width:String(cell.w),height:String(cell.h),rx:"3",
                fill:hexToRgba(color,dimmed?.04:.12),
                stroke:isSel?CLR.green:dimmed?CLR.border:color+"66",
                "stroke-width":isSel?"2":".8",
            }));

            // Store fill + label metadata for upright rendering in fill-layer and labels-group
            if(!dimmed){
                const hasMainVal = obj.valorPrincipal !== undefined
                                && obj.valorPrincipal !== null
                                && !isNaN(obj.valorPrincipal as number);
                g.setAttribute("data-lbl", obj.label);
                // data-val: only set if user provided a metric. If empty, no number drawn.
                g.setAttribute("data-val", hasMainVal
                    ? String(Math.round(obj.valorPrincipal as number)) : "");
                // data-pct: drives fill height. With no metric → 100% (full container).
                // This makes the visual usable for non-percentage cases (status maps,
                // planning grids, occupancy by category, etc).
                g.setAttribute("data-pct", hasMainVal
                    ? String(Math.min(obj.valorPrincipal as number, 100) / 100)
                    : "1");
                // Inline secondary field — text1 (categorical) only.
                // Tooltip Numbers / Tooltip Text are tooltip-only (not inline).
                g.setAttribute("data-txt1", obj.campoTexto1 ? String(obj.campoTexto1) : "");
                g.setAttribute("data-cx",  String(cell.x+cell.w/2));
                g.setAttribute("data-cy",  String(cell.y+cell.h/2));
                g.setAttribute("data-cw",  String(cell.w));
                g.setAttribute("data-ch",  String(cell.h));
                g.setAttribute("data-col", color);
            }

            const hr=svgEl("rect",{
                x:String(cell.x-2),y:String(cell.y-2),
                width:String(cell.w+4),height:String(cell.h+4),rx:"4",
                fill:"none",stroke:CLR.green,"stroke-width":"1.2",opacity:"0",
            });
            hr.setAttribute("pointer-events","none");
            hr.setAttribute("style","pointer-events:none;transition:opacity .12s");
            g.appendChild(hr);

            g.addEventListener("mouseenter",(e:MouseEvent)=>{
                hr.setAttribute("opacity","0.7");
                clearNode(this.tooltipDiv);
                this.tooltipDiv.appendChild(buildTooltip(obj,color,rl,this.mainValueName));
                this.tooltipDiv.style.display="block";
                this.positionTip(e);
            });
            g.addEventListener("mousemove",(e:MouseEvent)=>this.positionTip(e));
            g.addEventListener("mouseleave",()=>{
                hr.setAttribute("opacity","0");
                this.tooltipDiv.style.display="none";
            });
            g.addEventListener("click",(e:MouseEvent)=>{
                e.stopPropagation();
                this.tooltipDiv.style.display="none";
                this.editor.hide();
                if(e.ctrlKey||e.metaKey){
                    this.selectedIds.has(obj.id)?this.selectedIds.delete(obj.id):this.selectedIds.add(obj.id);
                    this.selMgr.select(obj.selectionId,true);
                } else {
                    if(this.selectedIds.size===1&&this.selectedIds.has(obj.id)){
                        this.selectedIds.clear(); this.selMgr.clear();
                    } else {
                        this.selectedIds.clear(); this.selectedIds.add(obj.id);
                        this.selMgr.select(obj.selectionId,false);
                    }
                }
                this.draw();
            });
            tg.appendChild(g);
        });

        // Apply shape transform first
        if(this.transformGroup) this.applyTransform();

        // Compass fixed on SVG top
        this.drawCompass(this.vpW, this.vpH);
        this.drawCompassRotated();
    }

    private drawCompass(W: number, H: number): void {
        const cx = W - 22, cy = H - 22, r = 16;
        const g = svgEl("g",{"id":"compass-group"});

        // ── Stator (always fixed to screen — N is always at top) ─────────────
        // Outer ring
        g.appendChild(svgEl("circle",{
            cx:String(cx),cy:String(cy),r:String(r),
            fill:CLR.panel,stroke:CLR.border,"stroke-width":"0.7",
        }));
        // Inner hub
        g.appendChild(svgEl("circle",{
            cx:String(cx),cy:String(cy),r:"1.8",
            fill:CLR.dim,
        }));
        // Cardinal letters — fixed on screen
        [{l:"N",dx:0,dy:-13,c:"#ef4444"},{l:"S",dx:0,dy:17,c:CLR.dim},
         {l:"E",dx:13,dy:3,c:CLR.dim},   {l:"O",dx:-13,dy:3,c:CLR.dim}]
        .forEach(({l,dx,dy,c}) => {
            const t = svgEl("text",{
                x:String(cx+dx),y:String(cy+dy),"text-anchor":"middle",
                "font-size":"5.5","font-family":"Segoe UI,sans-serif",
                "font-weight":"700",fill:c,
            });
            t.textContent=l; g.appendChild(t);
        });

        // ── Rotor (needle — rotates with map) ────────────────────────────────
        // Wrapped in its own group so drawCompassRotated() can rotate it around (cx,cy)
        const needleGroup = svgEl("g",{"id":"compass-needle-group"});
        // North half (red — points to map north)
        needleGroup.appendChild(svgEl("polygon",{
            points:`${cx},${cy-10} ${cx+2.5},${cy-1} ${cx-2.5},${cy-1}`,
            fill:"#ef4444",
        }));
        // South half (dim — points opposite)
        needleGroup.appendChild(svgEl("polygon",{
            points:`${cx},${cy+10} ${cx+2.5},${cy+1} ${cx-2.5},${cy+1}`,
            fill:CLR.dim,
        }));
        g.appendChild(needleGroup);

        this.svg.appendChild(g);
    }

    private drawLegend(): void {
        clearNode(this.legendBar);
        this.rules.filter(r=>r.enabled).forEach(r=>{
            const isActive = this.legendFilter === r.label;
            const chip=mk("div",{
                display:"flex",alignItems:"center",gap:"4px",
                padding:"2px 9px",borderRadius:"4px",cursor:"pointer",
                background: isActive ? hexToRgba(r.color,.28) : hexToRgba(r.color,.10),
                border:`1px solid ${isActive ? r.color : hexToRgba(r.color,.35)}`,
                boxShadow: isActive ? `0 0 0 1px ${r.color}55` : "none",
            });
            const dot=mk("div",{width:"7px",height:"7px",borderRadius:"2px",
                                 background:r.color,flexShrink:"0"});
            const lbl=mk("span",{fontSize:"8px",color:r.color,
                                  fontFamily:"'Segoe UI',sans-serif",
                                  fontWeight:isActive?"700":"400"});
            lbl.textContent=r.label;
            chip.appendChild(dot);
            chip.appendChild(lbl);
            if(isActive){
                const x=mk("span",{fontSize:"10px",color:r.color,
                                    marginLeft:"2px",fontWeight:"700"});
                x.textContent="×";
                chip.appendChild(x);
            }
            chip.addEventListener("click",(e)=>{
                e.stopPropagation();
                if(this.legendFilter===r.label){
                    this.legendFilter=null;
                    this.selectedIds.clear();
                    this.selMgr.clear();
                } else {
                    this.legendFilter=r.label;
                    this.selectedIds.clear();
                    const matching=this.objects.filter(obj=>{
                        const res=applyRules(this.rules,obj,this.fallback);
                        return res.label===r.label;
                    });
                    if(matching.length>0){
                        matching.forEach((obj,i)=>{
                            this.selMgr.select(obj.selectionId, i>0);
                        });
                        matching.forEach(obj=>this.selectedIds.add(obj.id));
                    }
                }
                this.draw();
                this.drawLegend();
            });
            this.legendBar.appendChild(chip);
        });

        if(this.legendFilter){
            const sep=mk("div",{width:"1px",height:"16px",
                                  background:CLR.border,margin:"0 4px"});
            this.legendBar.appendChild(sep);
            const clrBtn=mk("button",{
                fontFamily:"'Segoe UI',sans-serif",fontSize:"8px",
                padding:"2px 8px",background:"none",
                border:`1px solid ${CLR.border}`,color:CLR.dim,
                borderRadius:"4px",cursor:"pointer",
            });
            clrBtn.textContent="✕ clear";
            clrBtn.addEventListener("click",(e)=>{
                e.stopPropagation();
                this.legendFilter=null;
                this.selectedIds.clear();
                this.selMgr.clear();
                this.draw();
                this.drawLegend();
            });
            this.legendBar.appendChild(clrBtn);
        }
    }

    private applyTransform(): void {
        if(!this.transformGroup) return;
        const W = this.vpW, H = this.vpH;
        const cx = W / 2, cy = H / 2;
        // Shapes: rotate + scale + pan
        const tShapes = [
            `translate(${cx + this.panX},${cy + this.panY})`,
            `scale(${this.zoomLevel})`,
            `rotate(${this.rotation})`,
            `translate(${-cx},${-cy})`,
        ].join(" ");
        this.transformGroup.setAttribute("transform", tShapes);

        // Labels + Fill: scale + pan only (NO rotate) — always upright, gravity-aware
        const tUpright = [
            `translate(${cx + this.panX},${cy + this.panY})`,
            `scale(${this.zoomLevel})`,
            `translate(${-cx},${-cy})`,
        ].join(" ");
        if(this.labelsGroup) this.labelsGroup.setAttribute("transform", tUpright);
        if(this.fillLayer)   this.fillLayer.setAttribute("transform", tUpright);

        // Update rotation button styles (buttons indexed by internal rotation)
        [0,90,180,270].forEach(displayDeg=>{
            const internalDeg = (displayDeg + 180) % 360;
            const btn = this.target.querySelector(`#rot-btn-${internalDeg}`) as HTMLElement;
            if(btn){
                btn.style.color        = this.rotation===internalDeg ? "#07090a" : CLR.text;
                btn.style.borderColor  = this.rotation===internalDeg ? CLR.green : CLR.border;
                btn.style.background   = this.rotation===internalDeg ? CLR.green : CLR.card;
                btn.style.fontWeight   = this.rotation===internalDeg ? "700"     : "500";
            }
        });

        // Update zoom level display
        const zd = this.target.querySelector("#zoom-display") as HTMLElement;
        if(zd) zd.textContent = `${Math.round(this.zoomLevel*100)}%`;

        // Rebuild upright labels + fills — both use the same viewport-space projection
        if(this.labelsGroup && this.fillLayer && this.transformGroup){
            clearNode(this.labelsGroup);
            clearNode(this.fillLayer);

            // Rotation math — same as shape transform, but we project shape centers
            // into viewport space so fills/labels can be drawn axis-aligned (upright).
            const rad2 = (this.rotation * Math.PI) / 180;
            const cosR2 = Math.cos(rad2), sinR2 = Math.sin(rad2);
            const cx2 = this.vpW/2, cy2 = this.vpH/2;
            const rotPt2 = (px:number, py:number) => {
                const dx=px-cx2, dy=py-cy2;
                return { x: dx*cosR2 - dy*sinR2 + cx2,
                         y: dx*sinR2 + dy*cosR2 + cy2 };
            };

            this.transformGroup.querySelectorAll("g[data-lbl]").forEach((g2:Element) => {
                const gcx = parseFloat(g2.getAttribute("data-cx")||"0");
                const gcy = parseFloat(g2.getAttribute("data-cy")||"0");
                const gcwRaw = parseFloat(g2.getAttribute("data-cw")||"22");
                const gchRaw = parseFloat(g2.getAttribute("data-ch")||"46");
                const pct = parseFloat(g2.getAttribute("data-pct")||"0");
                const lbl = g2.getAttribute("data-lbl")||"";
                const val = g2.getAttribute("data-val")||"";
                const txt1 = g2.getAttribute("data-txt1")||"";
                const col = g2.getAttribute("data-col")||CLR.text;
                const hasVal  = this.showValue && val  !== "";
                const hasTxt1 = txt1 !== "";

                // When rotated 90°/270°, the visible bounding box of the cell swaps W/H.
                // The fill and labels are drawn axis-aligned in viewport space, so we
                // must match the rotated footprint to land inside the container shape.
                const normRot = ((this.rotation % 360) + 360) % 360;
                const swap = (normRot === 90 || normRot === 270);
                const gcw = swap ? gchRaw : gcwRaw;
                const gch = swap ? gcwRaw : gchRaw;

                // Project cell center into viewport space — this is where the shape
                // visually sits after rotation.
                const center = rotPt2(gcx, gcy);

                // ── Gravity-aware fill (always bottom-up in viewport space) ──────
                // Draw the fill axis-aligned at screen position so gravity is
                // always "down" for the viewer, regardless of map rotation.
                if(pct > 0){
                    const fillW = gcw - 2;
                    const fillHFull = gch - 2;
                    const fh = fillHFull * pct;
                    const fx = center.x - fillW/2;
                    const fy = center.y + fillHFull/2 - fh;
                    const fr = svgEl("rect",{
                        x:String(fx), y:String(fy),
                        width:String(fillW), height:String(fh),
                        rx:"1",
                        fill:hexToRgba(col,.35),
                    });
                    fr.setAttribute("pointer-events","none");
                    this.fillLayer!.appendChild(fr);

                    // Accent bar at the visual bottom of the shape
                    const ab = svgEl("rect",{
                        x:String(fx),
                        y:String(center.y + fillHFull/2 - 3),
                        width:String(fillW), height:"3", rx:"1",
                        fill:hexToRgba(col,.9),
                    });
                    ab.setAttribute("pointer-events","none");
                    this.fillLayer!.appendChild(ab);
                }

                // ── Shared rendering helpers ─────────────────────────────────
                const mkText = (x:number, y:number, text:string, size:number,
                                weight:string, fill:string,
                                halo:string, haloW:number, haloOp:number,
                                anchor:string = "middle") => {
                    const t = svgEl("text",{
                        x:String(x), y:String(y),
                        "text-anchor":anchor, "dominant-baseline":"middle",
                        "font-size":String(size),
                        "font-family":"Segoe UI,sans-serif","font-weight":weight,
                        fill:fill,
                        stroke:halo,
                        "stroke-width":String(haloW),
                        "stroke-linejoin":"round",
                        "stroke-opacity":String(haloOp),
                        "paint-order":"stroke fill",
                    });
                    t.setAttribute("pointer-events","none");
                    t.textContent = text;
                    this.labelsGroup!.appendChild(t);
                };

                // Pre-compute text colors + halos used across layouts
                const valTxt   = readableOn(col, CLR.bg, 0.35);
                const valHalo  = valTxt === "#0a0f14" ? "#f4f8fb" : "#0a0f14";

                // ── Layout decision ──────────────────────────────────────────
                // isHorizontal: cell is meaningfully wider than tall → inline layout
                // Otherwise: stacked layout (label on top, value below)
                const isHorizontal = gcw > gch * 1.2;

                if (isHorizontal) {
                    // ═════════════════════════════════════════════════════════
                    // INLINE LAYOUT with 4-level progressive collapse
                    //
                    // ═════════════════════════════════════════════════════════
                    // INLINE LAYOUT with 3-level progressive collapse
                    //
                    // Level 3 (≥110px):  Label │ Text1 │ MainVal
                    // Level 2 (75–109px): Label │ MainVal     (drop Text1)
                    // Level 1 (<75px):    Label only (identity wins; tooltip has rest)
                    // ═════════════════════════════════════════════════════════
                    const yMid = center.y;

                    // Effective width available for text (leave padding on both sides)
                    const effW = gcw - 10;

                    // Pick collapse level
                    let level = 1;
                    if      (effW >= 100 && hasTxt1) level = 3;
                    else if (effW >=  70)            level = 2;
                    else                             level = 1;

                    // Font sizes scale with cell height (so text fits vertically)
                    const fsLbl  = Math.max(5, Math.min(12, gch * 0.50));
                    const fsTxt  = Math.max(5, Math.min(10, gch * 0.38));
                    const fsVal  = Math.max(5, Math.min(11, gch * 0.46));

                    // Truncation per field (chars approx based on font vs field width)
                    const trunc = (s:string, maxChars:number) =>
                        s.length > maxChars ? s.slice(0, Math.max(1, maxChars-1)) + "…" : s;

                    const drawSep = (x:number) => {
                        const s = svgEl("line",{
                            x1:String(x), y1:String(yMid - gch*0.25),
                            x2:String(x), y2:String(yMid + gch*0.25),
                            stroke:CLR.border, "stroke-width":"0.8",
                            "stroke-opacity":"0.55",
                        });
                        s.setAttribute("pointer-events","none");
                        this.labelsGroup!.appendChild(s);
                    };

                    if (level === 1) {
                        // Tightest layout — show LABEL (identity wins).
                        // Value is complementary; if user wants it, they have width
                        // for level 2+. Tooltip always has the full data.
                        if (this.showLabel && lbl) {
                            mkText(center.x, yMid,
                                   trunc(lbl, Math.max(2, Math.floor(effW / fsLbl * 1.5))),
                                   fsLbl, "700", CLR.text, CLR.bg, 1.2, 0.5);
                        } else if (hasVal) {
                            mkText(center.x, yMid, val, fsVal, "800",
                                   valTxt, valHalo, 1.2, 0.35);
                        }
                    } else if (level === 2) {
                        // Label │ MainVal — classic 2-field
                        const leftX  = center.x - gcw * 0.30;
                        const rightX = center.x + gcw * 0.30;
                        const sepX   = center.x;

                        if (this.showLabel && lbl) {
                            const maxC = Math.max(2, Math.floor((gcw * 0.5) / fsLbl * 1.6));
                            mkText(leftX, yMid, trunc(lbl, maxC), fsLbl, "700",
                                   CLR.text, CLR.bg, 1.2, 0.5, "middle");
                        }
                        if (hasVal) {
                            drawSep(sepX);
                            mkText(rightX, yMid, val, fsVal, "800",
                                   valTxt, valHalo, 1.2, 0.35, "middle");
                        }
                    } else if (level === 3) {
                        // Label │ Text1 │ MainVal — 3 fields
                        const x1 = center.x - gcw * 0.35;  // Label
                        const x2 = center.x;                // Text1
                        const x3 = center.x + gcw * 0.35;  // MainVal
                        const sep1X = center.x - gcw * 0.17;
                        const sep2X = center.x + gcw * 0.17;

                        if (this.showLabel && lbl) {
                            const maxC = Math.max(2, Math.floor((gcw * 0.30) / fsLbl * 1.6));
                            mkText(x1, yMid, trunc(lbl, maxC), fsLbl, "700",
                                   CLR.text, CLR.bg, 1.2, 0.5, "middle");
                        }
                        drawSep(sep1X);
                        const maxCTxt = Math.max(2, Math.floor((gcw * 0.30) / fsTxt * 1.7));
                        mkText(x2, yMid, trunc(txt1, maxCTxt), fsTxt, "500",
                               CLR.dim, CLR.bg, 0.8, 0.35, "middle");
                        if (hasVal) {
                            drawSep(sep2X);
                            mkText(x3, yMid, val, fsVal, "800",
                                   valTxt, valHalo, 1.2, 0.35, "middle");
                        }
                    }
                } else {
                    // ═════════════════════════════════════════════════════════
                    // STACKED LAYOUT (cell is vertical, typically 0°/180°)
                    //
                    // Information hierarchy (most important first):
                    //   1. LABEL (object identity)   — always shown if it fits
                    //   2. MAIN VALUE (the metric)   — shown if there's room
                    //
                    // Rationale: in a synoptic map the user needs to identify WHICH
                    // object they are looking at before its metric. The fill color
                    // already communicates the rule status, the legend confirms it,
                    // and the tooltip carries every other field. Don't crowd the cell.
                    // ═════════════════════════════════════════════════════════
                    const fsLbl = Math.max(5, Math.min(10, gcw/3.5));
                    const fsVal = Math.max(5, Math.min(9,  gcw/4.2));
                    const maxC  = Math.max(2, Math.floor(gcw/fsLbl*1.6));
                    const ltxt  = lbl.length>maxC ? lbl.slice(0,maxC-1)+"…" : lbl;

                    const lineLbl = fsLbl * 1.4;
                    const lineVal = fsVal * 1.4;

                    const showLbl = this.showLabel && !!lbl;
                    const wantVal = hasVal;

                    // Pick the richest layout that fits. Identity wins over metric.
                    let layout: "lbl_val" | "lbl_only" | "val_only" | "none" = "none";
                    if (showLbl && wantVal && gch >= lineLbl + lineVal + 2) {
                        layout = "lbl_val";
                    } else if (showLbl) {
                        layout = "lbl_only";
                    } else if (wantVal) {
                        layout = "val_only";
                    }

                    if (layout === "lbl_val") {
                        mkText(center.x, center.y - gch * 0.22, ltxt, fsLbl, "700",
                               CLR.text, CLR.bg, 1.2, 0.5, "middle");
                        mkText(center.x, center.y + gch * 0.22, val, fsVal, "800",
                               valTxt, valHalo, 1.2, 0.35, "middle");
                    } else if (layout === "lbl_only") {
                        const fsTight = Math.max(5, Math.min(fsLbl, gch * 0.55));
                        mkText(center.x, center.y, ltxt, fsTight, "700",
                               CLR.text, CLR.bg, 1.2, 0.5, "middle");
                    } else if (layout === "val_only") {
                        mkText(center.x, center.y, val, fsVal, "800",
                               valTxt, valHalo, 1.2, 0.35, "middle");
                    }
                }
            });
        }
    }

    private drawCompassRotated(): void {
        // Rotate only the needle group, around the compass center, so it points
        // to where the map's north currently is after rotation.
        // The stator (ring + N/S/E/O letters) stays fixed — N is always up on screen.
        const compassG = this.svg.getElementById("compass-group");
        if(!compassG) return;
        const needleGroup = this.svg.getElementById("compass-needle-group");
        if(!needleGroup) return;
        const cx = this.vpW - 22, cy = this.vpH - 22;
        // If map is rotated by `rotation` (clockwise), the north that used to point
        // up now points in that direction — so the needle rotates the same amount.
        needleGroup.setAttribute("transform", `rotate(${this.rotation},${cx},${cy})`);
    }

    private positionTip(e: MouseEvent): void {
        // Quadrant-aware placement so the tooltip never occludes adjacent cells.
        // It appears in the OPPOSITE quadrant of where the cursor is:
        //  - cursor top-left    → tooltip bottom-right
        //  - cursor top-right   → tooltip bottom-left
        //  - cursor bottom-left → tooltip top-right
        //  - cursor bottom-right → tooltip top-left
        const cr = this.wrapper.getBoundingClientRect();
        const cx = e.clientX - cr.left;
        const cy = e.clientY - cr.top;
        const tw = this.tooltipDiv.offsetWidth  || 220;
        const th = this.tooltipDiv.offsetHeight || 140;
        const gap = 16;

        // Decide horizontal side based on cursor position within the visual
        const onRight  = cx > cr.width  * 0.5;
        const onBottom = cy > cr.height * 0.5;

        let tx = onRight  ? cx - tw - gap : cx + gap;
        let ty = onBottom ? cy - th - gap : cy + gap;

        // Clamp within visual bounds so the tooltip never overflows
        tx = Math.max(4, Math.min(cr.width  - tw - 4, tx));
        ty = Math.max(4, Math.min(cr.height - th - 4, ty));

        this.tooltipDiv.style.left = `${tx}px`;
        this.tooltipDiv.style.top  = `${ty}px`;
    }

    private drawEmpty(): void {
        const tg2 = this.svg.getElementById("transform-group");
        if(tg2) clearNode(tg2);
        const fl2 = this.svg.getElementById("fill-layer");
        if(fl2) clearNode(fl2);
        const tlg2 = this.svg.getElementById("text-layer");
        if(tlg2) clearNode(tlg2);
        const lg2 = this.svg.getElementById("labels-group");
        if(lg2) clearNode(lg2);
        let bgRect2 = this.svg.getElementById("bg-rect") as SVGElement;
        if(!bgRect2){
            bgRect2 = svgEl("rect",{"id":"bg-rect"});
            this.svg.appendChild(bgRect2);
        }
        bgRect2.setAttribute("width",String(this.vpW));
        bgRect2.setAttribute("height",String(this.vpH));
        bgRect2.setAttribute("fill",CLR.bg);
        const oldMsg = this.svg.getElementById("empty-msg");
        if(oldMsg && oldMsg.parentNode) oldMsg.parentNode.removeChild(oldMsg);
        const t=svgEl("text",{"id":"empty-msg",
            x:String(this.vpW/2),y:String(this.vpH/2),"text-anchor":"middle",
            "font-size":"12","font-family":"Segoe UI,sans-serif",fill:CLR.dim,
        });
        t.textContent="Drag the Object ID field to the visual";
        this.svg.appendChild(t);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.fmtSvc.buildFormattingModel(this.fmtSettings);
    }

    /**
     * Detect whether the Power BI report theme is dark.
     * Reads host.colorPalette.background (set by PBI from the active report theme).
     * Falls back to dark if the host doesn't expose it yet (e.g. during construction).
     */
    private isHostDark(): boolean {
        try {
            const palette = this.host && (this.host as unknown as {colorPalette?:{background?:{value?:string}}}).colorPalette;
            const bg = palette && palette.background && palette.background.value;
            if (bg && typeof bg === "string" && bg.length >= 4) {
                return isDarkFromBg(bg.length === 4
                    ? "#" + bg[1]+bg[1]+bg[2]+bg[2]+bg[3]+bg[3]
                    : bg);
            }
        } catch (_err) { /* fall through */ }
        return true; // default to dark
    }
}