"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions      = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual                  = powerbi.extensibility.visual.IVisual;
import ISelectionManager        = powerbi.extensibility.ISelectionManager;
import ISelectionId             = powerbi.visuals.ISelectionId;
import ITooltipService          = powerbi.extensibility.ITooltipService;
import ILocalizationManager     = powerbi.extensibility.ILocalizationManager;

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
    order: number;
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
    canvasW?:       number;
    canvasH?:       number;
    imageUrl?:      string;
    polygonPoints?: string;
    centroidX?:     number;
    centroidY?:     number;
    routeOrder?:    number;
    routeFrom?:     string;
    routeTo?:       string;
    routeWeight?:   number;
    tooltipFields:  TooltipField[];
    selectionId:    ISelectionId;
}

const PALETTE = [
    "#4a5560","#94a3b8","#ffffff",
    "#ef4444","#fb923c","#f59e0b","#00e5a0","#2dd4bf",
    "#38bdf8","#a78bfa","#ec4899",
    "#fbbf24","#84cc16","#e879f9",
];

function isDarkFromBg(bgHex: string): boolean {
    if (!bgHex || bgHex.length < 7) return true;
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
        dim:     dark ? "#8aa5b8" : "#4a5a6a",
        text:    dark ? "#e0eef7" : "#0f1820",
        lo:      dark ? "#0e1418" : "#e8eef2",
        muted:   dark ? "#a0b8c8" : "#3a4a5a",
        red:     "#ef4444",
        glo:     dark ? "#00301e" : "#d4f0e4",
    };
}
let CLR = getTheme(true);

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

function readableOn(hex: string, bgHex = "#07090a", alpha = 0.35,
                    darkTxt = "#0a0f14", lightTxt = "#f4f8fb"): string {
    if (!hex || hex.length < 7) return lightTxt;
    const fr = parseInt(hex.slice(1,3),16) / 255;
    const fg = parseInt(hex.slice(3,5),16) / 255;
    const fb = parseInt(hex.slice(5,7),16) / 255;
    const br = parseInt(bgHex.slice(1,3),16) / 255;
    const bg = parseInt(bgHex.slice(3,5),16) / 255;
    const bb = parseInt(bgHex.slice(5,7),16) / 255;
    const mr = fr * alpha + br * (1 - alpha);
    const mg = fg * alpha + bg * (1 - alpha);
    const mb = fb * alpha + bb * (1 - alpha);
    const lum = 0.2126*mr + 0.7152*mg + 0.0722*mb;
    return lum >= 0.55 ? darkTxt : lightTxt;
}

function cleanFieldName(name: string): string {
    if (!name) return "";
    let out = String(name);
    const prefixes = [
        /^Sum of\s+/i, /^Average of\s+/i, /^Avg of\s+/i, /^Max of\s+/i,
        /^Min of\s+/i, /^Count of\s+/i, /^Count\s+/i,
        /^Distinct count of\s+/i, /^Median of\s+/i, /^Variance of\s+/i,
        /^Std dev of\s+/i, /^First\s+/i, /^Last\s+/i,
    ];
    for (const re of prefixes) out = out.replace(re, "");
    out = out.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
    if (out.length > 0) out = out.charAt(0).toUpperCase() + out.slice(1);
    return out;
}

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

function wrapScrollable(container: HTMLElement): HTMLElement {
    container.style.overflowX = "auto";
    container.style.overflowY = "hidden";
    container.style.scrollBehavior = "smooth";
    (container.style as unknown as Record<string,string>)["scrollbarWidth"] = "none";
    (container.style as unknown as Record<string,string>)["msOverflowStyle"] = "none";
    if (!document.getElementById("syn-scrollable-style")) {
        const st = document.createElement("style");
        st.id = "syn-scrollable-style";
        st.textContent = `
            .syn-scrollable::-webkit-scrollbar { display: none; width: 0; height: 0; }
            .syn-arrow {
                position: absolute; top: 0; bottom: 0; width: 22px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; opacity: 0; transition: opacity .15s ease;
                pointer-events: none; z-index: 10;
                font-family: 'Segoe UI', sans-serif; font-weight: 700; font-size: 14px;
                color: rgba(255,255,255,.85);
                user-select: none;
            }
            .syn-arrow.syn-arrow-active {
                opacity: 1; pointer-events: auto;
            }
            .syn-arrow-left  { left: 0;
                background: linear-gradient(to right, rgba(0,0,0,.45), rgba(0,0,0,0)); }
            .syn-arrow-right { right: 0;
                background: linear-gradient(to left,  rgba(0,0,0,.45), rgba(0,0,0,0)); }
        `;
        document.head.appendChild(st);
    }
    container.classList.add("syn-scrollable");
    container.addEventListener("wheel", (e: WheelEvent) => {
        if (container.scrollWidth <= container.clientWidth) return;
        e.preventDefault();
        e.stopPropagation();
        const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        container.scrollLeft += dx;
    }, { passive: false, capture: true });
    const parent = container.parentElement;
    if (!parent) return container;
    if (getComputedStyle(parent).position === "static") {
        parent.style.position = "relative";
    }
    const left = mk("div"); left.className = "syn-arrow syn-arrow-left";
    left.textContent = "‹"; left.title = "Scroll left";
    const right = mk("div"); right.className = "syn-arrow syn-arrow-right";
    right.textContent = "›"; right.title = "Scroll right";
    parent.appendChild(left);
    parent.appendChild(right);
    const STEP = 80;
    left.addEventListener("click",  () => { container.scrollLeft -= STEP; });
    right.addEventListener("click", () => { container.scrollLeft += STEP; });
    const updateArrows = () => {
        const max = container.scrollWidth - container.clientWidth;
        const sl  = container.scrollLeft;
        if (max <= 1) {
            left.classList.remove("syn-arrow-active");
            right.classList.remove("syn-arrow-active");
            return;
        }
        left.classList.toggle("syn-arrow-active",  sl > 1);
        right.classList.toggle("syn-arrow-active", sl < max - 1);
    };
    container.addEventListener("scroll", updateArrows);
    if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(updateArrows);
        ro.observe(container);
    } else {
        window.addEventListener("resize", updateArrows);
    }
    if (typeof MutationObserver !== "undefined") {
        const mo = new MutationObserver(updateArrows);
        mo.observe(container, { childList: true, subtree: false });
    }
    setTimeout(updateArrows, 0);
    return container;
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
    const isCategoricalOp = rule.op === "eq" || rule.op === "neq";
    if (isCategoricalOp && String(raw).trim() === "") return false;
    const nv = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (!isCategoricalOp && (isNaN(nv) || !isFinite(nv))) return false;
    const rv = parseFloat(rule.value);
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
    return {color:fb,label:"Default"};
}

interface Cell {
    id: string;
    x:  number; y: number; w: number; h: number;
    polyPts?: { x: number; y: number }[];
    centroidX?: number;
    centroidY?: number;
    availW?: number;
    availH?: number;
}

function parsePolygonPoints(
    raw: string, cW: number, cH: number,
    scale: number, offX: number, offY: number,
): { x: number; y: number }[] {
    if (!raw) return [];
    const parts = raw.split(";").map(p => p.trim()).filter(p => p.length > 0);
    const out: { x: number; y: number }[] = [];
    for (const p of parts) {
        const xy = p.split(",");
        if (xy.length !== 2) continue;
        const rx = parseFloat(xy[0]);
        const ry = parseFloat(xy[1]);
        if (isNaN(rx) || isNaN(ry)) continue;
        out.push({
            x: (rx / 100) * cW * scale + offX,
            y: (ry / 100) * cH * scale + offY,
        });
    }
    return out;
}

function inscribedSpaceAt(
    pts: { x: number; y: number }[],
    ax: number, ay: number,
): { availW: number; availH: number } {
    const n = pts.length;
    if (n < 3) return { availW: 0, availH: 0 };
    let dL = Infinity, dR = Infinity, dU = Infinity, dD = Infinity;
    for (let i = 0; i < n; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % n];
        if ((p1.y <= ay && p2.y > ay) || (p2.y <= ay && p1.y > ay)) {
            const t = (ay - p1.y) / (p2.y - p1.y);
            const xHit = p1.x + t * (p2.x - p1.x);
            if (xHit < ax) {
                const d = ax - xHit;
                if (d < dL) dL = d;
            } else if (xHit > ax) {
                const d = xHit - ax;
                if (d < dR) dR = d;
            }
        }
        if ((p1.x <= ax && p2.x > ax) || (p2.x <= ax && p1.x > ax)) {
            const t = (ax - p1.x) / (p2.x - p1.x);
            const yHit = p1.y + t * (p2.y - p1.y);
            if (yHit < ay) {
                const d = ay - yHit;
                if (d < dU) dU = d;
            } else if (yHit > ay) {
                const d = yHit - ay;
                if (d < dD) dD = d;
            }
        }
    }
    if (!isFinite(dL) || !isFinite(dR) || !isFinite(dU) || !isFinite(dD)) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        return { availW: maxX - minX, availH: maxY - minY };
    }
    return {
        availW: 2 * Math.min(dL, dR),
        availH: 2 * Math.min(dU, dD),
    };
}

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
    if (obj.valorPrincipal !== undefined && obj.valorPrincipal !== null) {
        addRow(cleanFieldName(mainValName) || "Main Value",
               formatTooltipValue(obj.valorPrincipal),
               true);
    }
    if (obj.campoTexto1) {
        addRow("Status", formatTooltipValue(obj.campoTexto1), false);
    }
    for (const f of obj.tooltipFields) {
        addRow(cleanFieldName(f.name), f.value, f.isNumeric);
    }
    wrap.appendChild(tbl);
    return wrap;
}

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
        const body = mk("div",{padding:"12px 14px"});
        const info = mk("div",{
            background:CLR.card, border:`1px solid ${CLR.border}`,
            borderLeft:`3px solid ${CLR.green}`, borderRadius:"6px",
            padding:"7px 10px", marginBottom:"10px",
            fontSize:"8px", color:CLR.muted, lineHeight:"1.6",
        });
        info.textContent="Rules evaluate top to bottom — first match sets the color. Use ↑↓ to adjust priority. Checkbox enables/disables without deleting.";
        body.appendChild(info);
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
        const ll=mk("div",{fontSize:"7px",color:CLR.dim,textTransform:"uppercase",
                             letterSpacing:".08em",marginTop:"10px",marginBottom:"5px"});
        ll.textContent="LEGEND PREVIEW"; body.appendChild(ll);
        this.legEl=mk("div",{display:"flex",flexWrap:"wrap",gap:"4px"});
        body.appendChild(this.legEl);
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
                               border:`1px solid ${hexToRgba(r.color,.4)}`,
                               whiteSpace:"nowrap",flexShrink:"0"});
            const d=mk("div",{width:"7px",height:"7px",borderRadius:"1px",background:r.color,flexShrink:"0"});
            const l=mk("span",{fontSize:"8px",color:r.color,whiteSpace:"nowrap"});
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
        const ck=mk("div",{
            width:"12px",height:"12px",borderRadius:"2px",flexShrink:"0",
            background:rule.enabled?rule.color:"none",
            border:`1.5px solid ${rule.color}`,cursor:"pointer",
        });
        ck.addEventListener("click",()=>{ rule.enabled=!rule.enabled; this.renderList(); });
        row.appendChild(ck);
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
            document.querySelectorAll('[data-palette-popup="1"]').forEach(el => {
                if (el !== pop) (el as HTMLElement).style.display = "none";
            });
            pop.style.display = opening ? "flex" : "none";
        });
        row.appendChild(cd);
        const fSel=mk("select",{...INP,maxWidth:"108px",flexShrink:"0"}) as HTMLSelectElement;
        FIELDS.forEach(f=>{
            const o=document.createElement("option");
            o.value=f.k; o.textContent=f.l;
            if(f.k===rule.field) o.selected=true;
            fSel.appendChild(o);
        });
        fSel.addEventListener("change",()=>rule.field=fSel.value);
        row.appendChild(fSel);
        const os=mk("select",{...INP,maxWidth:"88px",flexShrink:"0"}) as HTMLSelectElement;
        OPS.forEach(o=>{
            const opt=document.createElement("option");
            opt.value=o.k; opt.textContent=o.l;
            if(o.k===rule.op) opt.selected=true;
            os.appendChild(opt);
        });
        os.addEventListener("change",()=>{ rule.op=os.value; this.renderList(); });
        row.appendChild(os);
        const vi = mk("input",{...INP,flex:"1",minWidth:"0"}) as HTMLInputElement;
        if (rule.op === "between") {
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
        const li=mk("input",{...INP,width:"78px",flexShrink:"0"}) as HTMLInputElement;
        li.value=rule.label; li.placeholder="label";
        li.addEventListener("input",()=>rule.label=li.value);
        row.appendChild(li);
        const ub=mk("button",btn(idx===0?CLR.lo:CLR.dim)); ub.textContent="↑";
        (ub as HTMLButtonElement).disabled=idx===0;
        ub.addEventListener("click",()=>{
            if(idx>0){ [this.rules[idx-1],this.rules[idx]]=[this.rules[idx],this.rules[idx-1]]; this.renderList(); }
        });
        row.appendChild(ub);
        const db=mk("button",btn(idx===this.rules.length-1?CLR.lo:CLR.dim)); db.textContent="↓";
        (db as HTMLButtonElement).disabled=idx===this.rules.length-1;
        db.addEventListener("click",()=>{
            if(idx<this.rules.length-1){ [this.rules[idx],this.rules[idx+1]]=[this.rules[idx+1],this.rules[idx]]; this.renderList(); }
        });
        row.appendChild(db);
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
    private allowInteractions: boolean = true;
    private events:      powerbi.extensibility.IVisualEventService;
    private tooltipSvc:  ITooltipService;
    private localization: ILocalizationManager;
    private selectedIds: Set<string>     = new Set();
    private rules:       ColorRule[]     = [];
    private objects:     SynopticObject[]= [];
    private legendFilter: Set<string>      = new Set();
    private panX     = 0;
    private panY     = 0;
    private zoomLevel= 1.0;
    private rotation = 0;
    private rotationLoaded = false;
    private isPanning= false;
    private panStartX= 0;
    private panStartY= 0;
    private panOriginX=0;
    private panOriginY=0;
    private transformGroup: SVGElement | null = null;
    private textLayer:      SVGElement | null = null;
    private labelsGroup:    SVGElement | null = null;
    private fillLayer:      SVGElement | null = null;
    private routesLayer:    SVGElement | null = null;
    private mainValueName: string = "";
    private fallback     = "#4a5560";
    private showLabel    = true;
    private showValue    = true;
    private bgOpacity    = 0.5;
    private showRoutes      = true;
    private routeColor      = "#00e5a0";
    private routeThickness  = 2;
    private routeOpacity    = 0.7;
    private showArrows      = true;
    private vpW          = 0;
    private vpH          = 0;
    private shouldShowHint     = false;
    private hintDismissed      = false;
    private lastReportedMissing = -1;
    private currentMissing      = 0;

    // ── RESIZE FIX state ────────────────────────────────────────────────
    // Last viewport size we actually applied. Used to short-circuit work
    // when nothing changed (PBI dispatches update() many times even when
    // the viewport hasn't changed — most can be ignored).
    private lastAppliedW = 0;
    private lastAppliedH = 0;
    // Pending RAF id for the ResizeObserver. We store the id (not just a
    // boolean flag) so we can CANCEL a pending frame when a newer event
    // arrives — this guarantees we always process the LATEST size, not
    // the first one in a burst.
    private resizeRafId: number | null = null;
    // The landing page's HTML container (visible only when no data is
    // bound). It's a plain HTML <div> centered with CSS — the browser
    // handles re-centering on resize natively, so we don't need any
    // observer or update logic for it.
    private landingDiv: HTMLElement | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host   = options.host;
        this.target = options.element;
        this.selMgr = this.host.createSelectionManager();
        this.fmtSvc = new FormattingSettingsService();
        this.events     = this.host.eventService;
        this.tooltipSvc = this.host.tooltipService;
        this.localization = this.host.createLocalizationManager();

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
        const ctrlWrap=mk("div",{
            display:"flex",alignItems:"center",gap:"3px",
            flex:"1",flexWrap:"nowrap",
        });
        bar.appendChild(ctrlWrap);
        this.target.appendChild(bar);
        wrapScrollable(ctrlWrap);

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
            alignItems:"center",flex:"1",minWidth:"0",
        });
        legendRow.appendChild(this.legendBar);
        this.target.appendChild(legendRow);
        wrapScrollable(this.legendBar);

        // Canvas wrapper
        this.wrapper=mk("div",{position:"absolute",top:"54px",left:"0",right:"0",bottom:"0"});
        this.target.appendChild(this.wrapper);

        // SVG
        // We set width/height as ABSOLUTE PIXEL values (not "100%") so the
        // browser does NOT auto-stretch the SVG during a window/visual
        // resize drag. With "100%" the SVG follows the wrapper's CSS
        // reflow, which arrives one frame BEFORE our ResizeObserver gets
        // a chance to reposition contents — producing a one-frame "stretch
        // then snap back" flicker on every drag delta. By committing the
        // SVG to a pixel-precise size, the SVG stays fixed until our
        // observer applies a new size deliberately, which eliminates the
        // visible stretch entirely.
        this.svg=document.createElementNS("http://www.w3.org/2000/svg","svg") as SVGSVGElement;
        this.svg.style.cssText="position:absolute;top:0;left:0;display:block";
        // Initial pixel size — observer + update will keep these in sync.
        this.svg.setAttribute("width",  "1");
        this.svg.setAttribute("height", "1");
        this.wrapper.appendChild(this.svg);

        const initBg = svgEl("rect",{"id":"bg-rect",width:"100%",height:"100%",fill:CLR.bg});
        this.svg.appendChild(initBg);
        const initTg = svgEl("g",{"id":"transform-group"});
        this.svg.appendChild(initTg);
        this.transformGroup = initTg;
        const initFl = svgEl("g",{"id":"fill-layer"});
        this.svg.appendChild(initFl);
        this.fillLayer = initFl;
        const initRl = svgEl("g",{"id":"routes-layer"});
        this.svg.appendChild(initRl);
        this.routesLayer = initRl;
        const initTlg = svgEl("g",{"id":"text-layer"});
        this.svg.appendChild(initTlg);
        this.textLayer = initTlg;
        const initLg = svgEl("g",{"id":"labels-group"});
        this.svg.appendChild(initLg);
        this.labelsGroup = initLg;

        this.tooltipDiv=document.createElement("div") as HTMLDivElement;
        this.tooltipDiv.style.cssText="position:absolute;display:none;z-index:9999;pointer-events:none";
        this.wrapper.appendChild(this.tooltipDiv);

        this.editor=new RulesEditor(this.target,(rules)=>{
            this.rules=rules;
            const json = JSON.stringify(rules);
            this.fmtSettings.reglaColorCard.reglasJson.value = json;
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

        ctrlWrap.appendChild(mk("div",{width:"1px",height:"20px",background:CLR.border,
                                   marginLeft:"4px",flexShrink:"0"}));

        const rotLabel = mk("span",{fontSize:"9px",color:CLR.text,
                                     fontFamily:"'Segoe UI',sans-serif",
                                     marginLeft:"4px",fontWeight:"600",flexShrink:"0"});
        rotLabel.textContent="Rotate:";
        ctrlWrap.appendChild(rotLabel);

        [0,90,180,270].forEach(deg=>{
            const rb=mk("button",{
                fontFamily:"'Segoe UI',sans-serif",fontSize:"9px",
                padding:"2px 8px",background:CLR.card,
                border:`1px solid ${CLR.border}`,color:CLR.text,
                borderRadius:"3px",cursor:"pointer",marginLeft:"2px",
                fontWeight:"500",
            });
            rb.textContent=`${deg}°`;
            rb.id=`rot-btn-${deg}`;
            rb.addEventListener("click",(e)=>{
                e.stopPropagation();
                this.rotation=deg;
                this.panX=0; this.panY=0; this.zoomLevel=1.0;
                this.draw();
                this.drawCompassRotated();
                this.persistRotation();
            });
            ctrlWrap.appendChild(rb);
        });

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
            this.draw();
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
            this.draw();
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

        const resetBtn=mk("button",{fontFamily:"'Segoe UI',sans-serif",fontSize:"12px",
            padding:"1px 9px",background:CLR.card,
            border:`1px solid ${CLR.border}`,color:CLR.text,
            borderRadius:"3px",cursor:"pointer",marginLeft:"4px",fontWeight:"700"});
        resetBtn.textContent="↺";
        resetBtn.title="Reset view (zoom, pan, rotation)";
        resetBtn.addEventListener("click",(e)=>{
            e.stopPropagation();
            this.panX=0; this.panY=0; this.zoomLevel=1.0; this.rotation=0;
            this.draw();
            this.drawCompassRotated();
            this.persistRotation();
        });
        ctrlWrap.appendChild(resetBtn);

        this.svg.addEventListener("click",()=>{
            this.selectedIds.clear(); this.selMgr.clear();
            this.legendFilter.clear();
            this.editor.hide();
            this.drawLegend();
        });
        this.svg.addEventListener("contextmenu", (e: MouseEvent) => {
            if (e.target !== this.svg) return;
            e.preventDefault();
            if (this.selMgr && (this.selMgr as ISelectionManager).showContextMenu) {
                (this.selMgr as ISelectionManager).showContextMenu(
                    {} as ISelectionId,
                    { x: e.clientX, y: e.clientY },
                );
            }
        });

        let wheelDebounceTimer: number | null = null;
        this.wrapper.addEventListener("wheel",(e:WheelEvent)=>{
            e.preventDefault();
            e.stopPropagation();
            const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
            this.zoomLevel = Math.max(0.15, Math.min(8, this.zoomLevel * factor));
            this.applyTransform();
            if (wheelDebounceTimer !== null) {
                clearTimeout(wheelDebounceTimer);
            }
            wheelDebounceTimer = window.setTimeout(() => {
                this.draw();
                wheelDebounceTimer = null;
            }, 150);
        }, {passive:false, capture:true});

        const RESIZE_EDGE_PX = 6;
        const releasePan = () => {
            if (this.isPanning) {
                this.isPanning = false;
                this.wrapper.style.cursor = "default";
            }
        };
        this.wrapper.addEventListener("mousedown",(e:MouseEvent)=>{
            const target = e.target as Element;
            const targetId = target && target.getAttribute ? target.getAttribute("id") : null;
            const isBackground = target === this.svg || targetId === "bg-rect";
            if (!isBackground) return;
            const r = this.wrapper.getBoundingClientRect();
            const nearEdge =
                e.clientX - r.left   < RESIZE_EDGE_PX ||
                r.right  - e.clientX < RESIZE_EDGE_PX ||
                e.clientY - r.top    < RESIZE_EDGE_PX ||
                r.bottom - e.clientY < RESIZE_EDGE_PX;
            if (nearEdge) return;

            this.isPanning  = true;
            this.panStartX  = e.clientX;
            this.panStartY  = e.clientY;
            this.panOriginX = this.panX;
            this.panOriginY = this.panY;
            this.wrapper.style.cursor = "grabbing";
        });
        window.addEventListener("mousemove",(e:MouseEvent)=>{
            if(!this.isPanning) return;
            if (e.buttons === 0) {
                releasePan();
                return;
            }
            this.panX=this.panOriginX+(e.clientX-this.panStartX);
            this.panY=this.panOriginY+(e.clientY-this.panStartY);
            this.applyTransform();
        });
        window.addEventListener("mouseup", releasePan);
        document.addEventListener("mouseup", releasePan);
        this.wrapper.addEventListener("mouseleave", releasePan);
        window.addEventListener("blur", releasePan);
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) releasePan();
        });

        // ── RESIZE FIX 3: Smart ResizeObserver ──────────────────────────────
        // Three changes from the previous version:
        //  1) CANCEL a pending RAF when a newer event arrives → we always
        //     process the LAST size in a burst, not the first.
        //  2) Compare against this.lastAppliedW/H → skip work entirely when
        //     nothing actually changed (PBI fires many redundant events).
        //  3) Read from TARGET (always sized by PBI) instead of WRAPPER
        //     (which depends on CSS reflow that may lag behind a frame).
        if (typeof ResizeObserver !== "undefined") {
            const ro = new ResizeObserver(() => {
                if (!this.target) return;
                // Cancel any pending frame — the new event is more recent.
                // Without this we'd process the FIRST event in a burst and
                // skip the rest, causing the visual to lag behind the cursor.
                if (this.resizeRafId !== null) {
                    cancelAnimationFrame(this.resizeRafId);
                }
                this.resizeRafId = requestAnimationFrame(() => {
                    this.resizeRafId = null;

                    const tH = this.target.clientHeight;
                    const tW = this.target.clientWidth;
                    if (tW <= 0 || tH <= 0) return;
                    const w = tW;
                    const h = Math.max(0, tH - 54);

                    // Skip if size didn't actually change.
                    if (w === this.lastAppliedW && h === this.lastAppliedH) return;
                    this.lastAppliedW = w;
                    this.lastAppliedH = h;

                    this.vpW = w;
                    this.vpH = h;
                    this.svg.setAttribute("width",  String(w));
                    this.svg.setAttribute("height", String(h));
                    const bg = this.svg.getElementById("bg-rect") as SVGElement | null;
                    if (bg) {
                        bg.setAttribute("width",  String(w));
                        bg.setAttribute("height", String(h));
                    }
                    this.repositionCompass();
                    // No need to reposition the landing — it's an HTML div
                    // with CSS top/left/transform-translate centering, so
                    // the browser keeps it centered automatically when the
                    // wrapper resizes.
                });
            });
            ro.observe(this.target);
        }
    }

    private repositionCompass(): void {
        const compassG = this.svg.getElementById("compass-group") as SVGElement | null;
        if (!compassG) return;
        const cx = this.vpW - 22;
        const cy = this.vpH - 22;
        const oldCx = parseFloat(compassG.getAttribute("data-cx") || String(cx));
        const oldCy = parseFloat(compassG.getAttribute("data-cy") || String(cy));
        const dx = cx - oldCx;
        const dy = cy - oldCy;
        compassG.setAttribute("transform", `translate(${dx},${dy})`);
    }

    public update(options: VisualUpdateOptions): void {
        if (this.events) {
            try { this.events.renderingStarted(options); }
            catch { /* host doesn't support events; continue silently */ }
        }

        try {
            this.updateInternal(options);
            if (this.events) {
                try { this.events.renderingFinished(options); }
                catch { /* host doesn't support events; continue silently */ }
            }
        } catch (err) {
            if (this.events) {
                try { this.events.renderingFailed(options, err instanceof Error ? err.message : String(err)); }
                catch { /* host doesn't support events; continue silently */ }
            }
            throw err;
        }
    }

    private updateInternal(options: VisualUpdateOptions): void {
        try {
            const hostCaps = (this.host as unknown as {
                hostCapabilities?: { allowInteractions?: boolean };
            }).hostCapabilities;
            this.allowInteractions = (hostCaps && typeof hostCaps.allowInteractions === "boolean")
                ? hostCaps.allowInteractions
                : true;
        } catch (_err) {
            this.allowInteractions = true;
        }

        CLR = getTheme(this.isHostDark());
        const hc = this.hcColors();
        if (hc) {
            CLR = {
                ...CLR,
                bg:      hc.bg,
                surface: hc.bg,
                panel:   hc.bg,
                card:    hc.bg,
                lo:      hc.bg,
                text:    hc.fg,
                dim:     hc.fg,
                muted:   hc.fg,
                border:  hc.fg,
                hi:      hc.sel,
                green:   hc.sel,
                glo:     hc.bg,
            };
        }
        this.target.style.background = CLR.bg;
        this.fmtSettings=this.fmtSvc.populateFormattingSettingsModel(
            VisualFormattingSettingsModel, options.dataViews[0]);

        // Read viewport from the target element. The target is what PBI
        // sizes directly — always pixel-accurate. We subtract 54px for
        // the toolbar (30px) + legend row (24px) which sit at the top.
        const targetW = this.target ? this.target.clientWidth  : 0;
        const targetH = this.target ? this.target.clientHeight : 0;
        if (targetW > 0 && targetH > 0) {
            this.vpW = targetW;
            this.vpH = Math.max(1, targetH - 54);
        } else {
            // Construction-time edge case: target not yet sized.
            this.vpW = options.viewport.width;
            this.vpH = Math.max(1, options.viewport.height - 54);
        }
        // Mirror to the cache so the observer's "skip if unchanged" check
        // matches what we just applied.
        this.lastAppliedW = this.vpW;
        this.lastAppliedH = this.vpH;
        this.svg.setAttribute("width",  String(this.vpW));
        this.svg.setAttribute("height", String(this.vpH));

        // Parse persisted rules
        const persistedRaw = this.fmtSettings.reglaColorCard.reglasJson.value;
        const neverConfigured = persistedRaw === undefined
                             || persistedRaw === null
                             || String(persistedRaw).trim() === "";
        if (neverConfigured) {
            this.rules = defaultRules();
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

        if (!this.rotationLoaded) {
            const persistedRot = this.fmtSettings.generalCard.rotation.value;
            if (typeof persistedRot === "number" && !isNaN(persistedRot)) {
                const norm = ((persistedRot % 360) + 360) % 360;
                if (norm === 0 || norm === 90 || norm === 180 || norm === 270) {
                    this.rotation = norm;
                }
            }
            this.rotationLoaded = true;
        }

        this.fallback  =this.fmtSettings.generalCard.colorFallback.value.value||"#4a5560";
        this.showLabel =this.fmtSettings.generalCard.mostrarEtiqueta.value;
        this.showValue =this.fmtSettings.generalCard.mostrarValor.value;
        const rawBgOp = this.fmtSettings.generalCard.backgroundOpacity.value;
        this.bgOpacity = (typeof rawBgOp === "number" && !isNaN(rawBgOp))
            ? Math.max(0, Math.min(1, rawBgOp / 100))
            : 0.5;
        const routesCard = this.fmtSettings.routesCard;
        this.showRoutes     = routesCard.showRoutes.value;
        this.routeColor     = routesCard.routeColor.value.value || "#00e5a0";
        const rawThk        = routesCard.routeThickness.value;
        this.routeThickness = (typeof rawThk === "number" && !isNaN(rawThk))
            ? Math.max(1, Math.min(10, rawThk))
            : 2;
        const rawOp         = routesCard.routeOpacity.value;
        this.routeOpacity   = (typeof rawOp === "number" && !isNaN(rawOp))
            ? Math.max(0, Math.min(1, rawOp / 100))
            : 0.7;
        this.showArrows     = routesCard.showArrows.value;
        const dv = options.dataViews?.[0];
        if (!dv?.table?.rows?.length || !dv.table.columns?.length) {
            this.drawEmpty();
            return;
        }

        const cols = dv.table.columns;
        const rows = dv.table.rows;

        const colByRole: Record<string, number> = {};
        const tooltipColIdxs: number[] = [];
        cols.forEach((c, i) => {
            const roles = c.roles as Record<string, unknown> | undefined;
            if (!roles) return;
            for (const r of Object.keys(roles)) {
                if (r === "tooltipFields") {
                    tooltipColIdxs.push(i);
                } else if (colByRole[r] === undefined) {
                    colByRole[r] = i;
                }
            }
        });

        this.mainValueName = colByRole["valorPrincipal"] !== undefined
            ? cols[colByRole["valorPrincipal"]].displayName
            : "";

        const orderOf = (src: powerbi.DataViewMetadataColumn, fallback: number): number => {
            try {
                const r = src.roles as Record<string, unknown> | undefined;
                if (r && r["tooltipFields"]) {
                    const meta = r["tooltipFields"];
                    if (typeof meta === "object" && meta !== null
                        && "displayOrder" in meta
                        && typeof (meta as {displayOrder?: number}).displayOrder === "number") {
                        return (meta as {displayOrder: number}).displayOrder;
                    }
                }
            } catch (_e) { /* fall through */ }
            return fallback;
        };

        const cellAt = (role: string, rowIdx: number): powerbi.PrimitiveValue | undefined => {
            const ci = colByRole[role];
            if (ci === undefined) return undefined;
            return rows[rowIdx][ci];
        };
        const strAt = (role: string, rowIdx: number): string | undefined => {
            const v = cellAt(role, rowIdx);
            return v === undefined || v === null ? undefined : String(v);
        };
        const numAt = (role: string, rowIdx: number): number | undefined => {
            const v = cellAt(role, rowIdx);
            if (v === undefined || v === null) return undefined;
            const n = Number(v);
            return isNaN(n) || !isFinite(n) ? undefined : n;
        };
        const layoutAt = (role: string, rowIdx: number): number | undefined => {
            const v = cellAt(role, rowIdx);
            if (v === undefined || v === null) return undefined;
            const n = parseFloat(String(v));
            return isNaN(n) ? undefined : n;
        };

        this.objects = [];

        for (let i = 0; i < rows.length; i++) {
            const id = strAt("invernadero", i) || String(i);

            const merged: TooltipField[] = [];
            tooltipColIdxs.forEach(idx => {
                const src = cols[idx];
                const raw = rows[i][idx];
                const formatted = formatTooltipValue(raw);
                if (formatted === "") return;
                const isNum = !!(src.type && src.type.numeric);
                merged.push({
                    name:      src.displayName,
                    value:     formatted,
                    isNumeric: isNum,
                    order:     orderOf(src, 1000 + idx),
                });
            });
            merged.sort((a, b) => a.order - b.order);

            let selectionId: ISelectionId;
            try {
                const builder = this.host.createSelectionIdBuilder() as
                    powerbi.visuals.ISelectionIdBuilder & {
                        withTable?: (table: powerbi.DataViewTable, rowIndex: number) => powerbi.visuals.ISelectionIdBuilder;
                    };
                if (builder.withTable && dv.table) {
                    selectionId = builder.withTable(dv.table, i).createSelectionId();
                } else {
                    selectionId = this.host.createSelectionIdBuilder().createSelectionId();
                }
            } catch (_e) {
                selectionId = this.host.createSelectionIdBuilder().createSelectionId();
            }

            this.objects.push({
                id,
                label:          strAt("etiqueta", i) || id,
                valorPrincipal: numAt("valorPrincipal", i),
                campoTexto1:    strAt("campoTexto1", i),
                layoutX:        layoutAt("layoutX", i),
                layoutY:        layoutAt("layoutY", i),
                layoutW:        layoutAt("layoutW", i),
                layoutH:        layoutAt("layoutH", i),
                canvasW:        layoutAt("canvasW", i),
                canvasH:        layoutAt("canvasH", i),
                imageUrl:       strAt("imageUrl", i),
                polygonPoints:  strAt("polygonPoints", i),
                centroidX:      layoutAt("centroidX", i),
                centroidY:      layoutAt("centroidY", i),
                routeOrder:     numAt("routeOrder", i),
                routeFrom:      strAt("routeFrom", i),
                routeTo:        strAt("routeTo", i),
                routeWeight:    numAt("routeWeight", i),
                tooltipFields:  merged,
                selectionId,
            });
        }
        this.draw(); this.drawLegend();
    }

    private draw(): void {
        const W=this.vpW, H=this.vpH;

        // We have data — hide the landing div if it was up.
        this.hideLanding();
        const oldMsg = this.svg.getElementById("empty-msg");
        if(oldMsg && oldMsg.parentNode) oldMsg.parentNode.removeChild(oldMsg);

        let bgRect = this.svg.getElementById("bg-rect") as SVGElement;
        if(!bgRect){
            bgRect = svgEl("rect",{"id":"bg-rect"});
            this.svg.insertBefore(bgRect, this.svg.firstChild);
        }
        bgRect.setAttribute("width",String(W));
        bgRect.setAttribute("height",String(H));
        bgRect.setAttribute("fill",CLR.bg);

        if(!this.objects.length) return;

        let tg = this.svg.getElementById("transform-group") as SVGElement;
        if(!tg){
            tg = svgEl("g",{"id":"transform-group"});
            this.svg.appendChild(tg);
        }
        clearNode(tg);
        this.transformGroup = tg;

        let fl = this.svg.getElementById("fill-layer") as SVGElement;
        if(!fl){
            fl = svgEl("g",{"id":"fill-layer"});
            this.svg.appendChild(fl);
        }
        clearNode(fl);
        this.fillLayer = fl;

        let rl = this.svg.getElementById("routes-layer") as SVGElement;
        if(!rl){
            rl = svgEl("g",{"id":"routes-layer"});
            this.svg.appendChild(rl);
        }
        clearNode(rl);
        this.routesLayer = rl;

        let tlg = this.svg.getElementById("text-layer") as SVGElement;
        if(!tlg){
            tlg = svgEl("g",{"id":"text-layer"});
            this.svg.appendChild(tlg);
        }
        clearNode(tlg);
        this.textLayer = tlg;

        let lg = this.svg.getElementById("labels-group") as SVGElement;
        if(!lg){
            lg = svgEl("g",{"id":"labels-group"});
            this.svg.appendChild(lg);
        }
        clearNode(lg);
        this.labelsGroup = lg;

        const oldCompass = this.svg.getElementById("compass-group");
        if(oldCompass && oldCompass.parentNode) oldCompass.parentNode.removeChild(oldCompass);

        const objectsWithLayout = this.objects.filter(o =>
            o.layoutX !== undefined && o.layoutY !== undefined);
        const objectsMissingLayout = this.objects.length - objectsWithLayout.length;
        const hasFixed = objectsWithLayout.length > 0;

         let layout: Cell[];
        let bgRectX = 0, bgRectY = 0, bgRectW = 0, bgRectH = 0;
        if (hasFixed) {
            const editorCW = objectsWithLayout[0].canvasW;
            const editorCH = objectsWithLayout[0].canvasH;
            const useEditorCanvas = typeof editorCW === "number" && editorCW > 0
                                 && typeof editorCH === "number" && editorCH > 0;

            const cW = useEditorCanvas ? (editorCW as number) : 1;
            const cH = useEditorCanvas ? (editorCH as number) : 1;

            const srcW = useEditorCanvas
                ? cW
                : Math.max(...objectsWithLayout.map(o =>
                    (o.layoutX as number) + ((o.layoutW as number | undefined) ?? 22)));
            const srcH = useEditorCanvas
                ? cH
                : Math.max(...objectsWithLayout.map(o =>
                    (o.layoutY as number) + ((o.layoutH as number | undefined) ?? 46)));

            const norm = ((this.rotation % 360) + 360) % 360;
            const swapped = (norm === 90 || norm === 270);
            const fitW = swapped ? srcH : srcW;
            const fitH = swapped ? srcW : srcH;
            const scaleX = W / Math.max(fitW, 1);
            const scaleY = H / Math.max(fitH, 1);
            const scale  = Math.min(scaleX, scaleY) * 0.96;

            const offX = (W - srcW * scale) / 2;
            const offY = (H - srcH * scale) / 2;

            bgRectX = offX;
            bgRectY = offY;
            bgRectW = srcW * scale;
            bgRectH = srcH * scale;

            layout = objectsWithLayout.map(o => {
                const rawX = o.layoutX as number;
                const rawY = o.layoutY as number;
                const rawW = (o.layoutW as number | undefined) ?? 22;
                const rawH = (o.layoutH as number | undefined) ?? 46;
                const px = useEditorCanvas ? (rawX / 100) * cW : rawX;
                const py = useEditorCanvas ? (rawY / 100) * cH : rawY;
                const pw = useEditorCanvas ? (rawW / 100) * cW : rawW;
                const ph = useEditorCanvas ? (rawH / 100) * cH : rawH;
                const cell: Cell = {
                    id: o.id,
                    x:  Math.round(px * scale + offX),
                    y:  Math.round(py * scale + offY),
                    w:  Math.round(pw * scale),
                    h:  Math.round(ph * scale),
                };
                if (o.polygonPoints && useEditorCanvas) {
                    const parsed = parsePolygonPoints(o.polygonPoints, cW, cH, scale, offX, offY);
                    if (parsed.length >= 3) {
                        cell.polyPts = parsed;
                    }
                }
                if (useEditorCanvas
                    && typeof o.centroidX === "number" && !isNaN(o.centroidX)
                    && typeof o.centroidY === "number" && !isNaN(o.centroidY)
                ) {
                    const ccx = (o.centroidX / 100) * cW;
                    const ccy = (o.centroidY / 100) * cH;
                    cell.centroidX = Math.round(ccx * scale + offX);
                    cell.centroidY = Math.round(ccy * scale + offY);
                }
                if (cell.polyPts && cell.polyPts.length >= 3) {
                    const ax = (typeof cell.centroidX === "number") ? cell.centroidX : cell.x + cell.w / 2;
                    const ay = (typeof cell.centroidY === "number") ? cell.centroidY : cell.y + cell.h / 2;
                    const { availW, availH } = inscribedSpaceAt(cell.polyPts, ax, ay);
                    cell.availW = Math.max(4, Math.min(cell.w, availW));
                    cell.availH = Math.max(4, Math.min(cell.h, availH));
                }
                return cell;
            });
        } else {
            layout = autoLayout(this.objects.map(o=>o.id),W,H);
        }
        const cm: Record<string,Cell>={};
        layout.forEach(c=>cm[c.id]=c);

        const imgUrl = this.objects.find(o => o.imageUrl)?.imageUrl;
        if (imgUrl && bgRectW > 0 && bgRectH > 0) {
            const img = svgEl("image", {
                href: imgUrl,
                "xlink:href": imgUrl,
                x:      String(bgRectX),
                y:      String(bgRectY),
                width:  String(bgRectW),
                height: String(bgRectH),
                preserveAspectRatio: "xMidYMid meet",
                opacity: String(this.bgOpacity),
            });
            img.setAttribute("pointer-events", "none");
            tg.appendChild(img);
        }

        const aggregatedMVPattern = /^(Sum|Average|Avg|Count|Distinct count|Min|Max|Median|Variance|Std dev|First|Last) of\s+/i;
        const mvIsAggregated = !!this.mainValueName
            && aggregatedMVPattern.test(this.mainValueName);

        const shouldRiskHint = mvIsAggregated;
        this.currentMissing = objectsMissingLayout;

        if (shouldRiskHint) {
            this.shouldShowHint = !this.hintDismissed;
        } else {
            this.shouldShowHint = false;
            this.hintDismissed = false;
        }

        this.objects.forEach(obj=>{
            const cell=cm[obj.id]; if(!cell) return;
            const {color,label:rl}=applyRules(this.rules,obj,this.fallback);
            const isSel=this.selectedIds.has(obj.id);
            const dimmed=this.selectedIds.size>0&&!isSel;
            const g=svgEl("g",{});
            g.setAttribute("style","cursor:pointer");

            const baseStrokeW = isSel ? (1.5 / this.zoomLevel) : (0.6 / this.zoomLevel);
            const baseStroke  = isSel ? CLR.green : dimmed ? CLR.border : color + "66";

            if (cell.polyPts && cell.polyPts.length >= 3) {
                const ptsStr = cell.polyPts.map(p => p.x + "," + p.y).join(" ");
                g.appendChild(svgEl("polygon", {
                    points: ptsStr,
                    fill: hexToRgba(color, dimmed ? .04 : .12),
                    stroke: baseStroke,
                    "stroke-width": String(baseStrokeW),
                    "stroke-linejoin": "round",
                }));
            } else {
                g.appendChild(svgEl("rect", {
                    x: String(cell.x), y: String(cell.y),
                    width: String(cell.w), height: String(cell.h),
                    fill: hexToRgba(color, dimmed ? .04 : .12),
                    stroke: baseStroke,
                    "stroke-width": String(baseStrokeW),
                }));
            }
            if (cell.polyPts && cell.polyPts.length >= 3) {
                this.ensurePolygonClipPath(cell);
            }

            if (!dimmed && cell.polyPts && cell.polyPts.length >= 3) {
                const cellIdForClip = cell["id"];
                g.setAttribute("data-clip", "syn-clip-" + this.sanitizeIdFragment(cellIdForClip));
                // Stamp the polygon vertex list (pre-rotation viewport
                // coordinates) so the fill renderer in applyTransform can
                // build a polygon-shaped fill that matches the shape's
                // diagonal edges exactly — no axis-aligned rect clipped
                // to a polygon (which produced sub-pixel gaps from
                // antialiasing on the diagonals). Format: "x,y;x,y;..."
                const polyStr = cell.polyPts.map(p => p.x + "," + p.y).join(";");
                g.setAttribute("data-poly", polyStr);
            }
            if(!dimmed){
                const v = obj.valorPrincipal;
                const hasMainVal = v !== undefined && v !== null && !isNaN(v as number);
                g.setAttribute("data-lbl", obj.label);
                g.setAttribute("data-val", hasMainVal
                    ? String(Math.round(v as number)) : "");
                g.setAttribute("data-pct", hasMainVal
                    ? String(Math.min(Math.max(v as number, 0), 100) / 100)
                    : "1");
                g.setAttribute("data-txt1", obj.campoTexto1 ? String(obj.campoTexto1) : "");
                // anchorX/Y is the LABEL anchor (centroid for polygons,
                // bbox center for rectangles). Used for label placement.
                const anchorX = (typeof cell.centroidX === "number") ? cell.centroidX : cell.x + cell.w / 2;
                const anchorY = (typeof cell.centroidY === "number") ? cell.centroidY : cell.y + cell.h / 2;
                g.setAttribute("data-cx",  String(anchorX));
                g.setAttribute("data-cy",  String(anchorY));
                // bboxCenter is ALWAYS the geometric bbox center (cell.x/y + w/h/2).
                // The fill rectangle must align to the bbox, NOT the anchor —
                // otherwise polygons whose centroid is offset from the bbox
                // center end up with the fill rectangle missing the polygon
                // edges (visible white gaps after clipping). For rectangles
                // anchor == bboxCenter, so this is a no-op there.
                g.setAttribute("data-bx",  String(cell.x + cell.w / 2));
                g.setAttribute("data-by",  String(cell.y + cell.h / 2));
                g.setAttribute("data-cw",  String(cell.w));
                g.setAttribute("data-ch",  String(cell.h));
                const aW = (typeof cell.availW === "number") ? cell.availW : cell.w;
                const aH = (typeof cell.availH === "number") ? cell.availH : cell.h;
                g.setAttribute("data-aw",  String(aW));
                g.setAttribute("data-ah",  String(aH));
                g.setAttribute("data-col", color);
            }

            const hoverStroke  = 0.9 / this.zoomLevel;
            const hoverInflate = 1.5 / this.zoomLevel;
            let hr: SVGElement;
            if (cell.polyPts && cell.polyPts.length >= 3) {
                let cxh = 0, cyh = 0;
                for (const p of cell.polyPts) { cxh += p.x; cyh += p.y; }
                cxh /= cell.polyPts.length;
                cyh /= cell.polyPts.length;
                const inflated = cell.polyPts.map(p => {
                    const dx = p.x - cxh;
                    const dy = p.y - cyh;
                    const len = Math.sqrt(dx*dx + dy*dy) || 1;
                    return {
                        x: p.x + (dx / len) * hoverInflate,
                        y: p.y + (dy / len) * hoverInflate,
                    };
                });
                hr = svgEl("polygon", {
                    points: inflated.map(p => `${p.x},${p.y}`).join(" "),
                    fill: "none", stroke: CLR.green,
                    "stroke-width": String(hoverStroke),
                    opacity: "0", "stroke-linejoin": "round",
                });
            } else {
                hr = svgEl("rect", {
                    x: String(cell.x - hoverInflate),
                    y: String(cell.y - hoverInflate),
                    width:  String(cell.w + hoverInflate * 2),
                    height: String(cell.h + hoverInflate * 2),
                    fill: "none", stroke: CLR.green,
                    "stroke-width": String(hoverStroke),
                    opacity: "0",
                });
            }
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
                    if (this.allowInteractions) {
                        this.selMgr.select(obj.selectionId,true);
                    }
                } else {
                    if(this.selectedIds.size===1&&this.selectedIds.has(obj.id)){
                        this.selectedIds.clear();
                        if (this.allowInteractions) this.selMgr.clear();
                    } else {
                        this.selectedIds.clear(); this.selectedIds.add(obj.id);
                        if (this.allowInteractions) {
                            this.selMgr.select(obj.selectionId,false);
                        }
                    }
                }
                this.draw();
            });
            g.addEventListener("contextmenu", (e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                this.tooltipDiv.style.display = "none";
                if (this.selMgr && (this.selMgr as ISelectionManager).showContextMenu) {
                    (this.selMgr as ISelectionManager).showContextMenu(
                        obj.selectionId,
                        { x: e.clientX, y: e.clientY },
                    );
                }
            });
            tg.appendChild(g);
        });

        if(this.transformGroup) this.applyTransform();
        this.drawRoutes(cm);
        this.drawCompass(this.vpW, this.vpH);
        this.drawCompassRotated();
        this.drawHint();
    }

    private drawRoutes(cm: Record<string, Cell>): void {
        if (!this.routesLayer) return;
        if (!this.showRoutes || !this.objects.length) return;

        const hasOrder = this.objects.some(o => typeof o.routeOrder === "number" && !isNaN(o.routeOrder as number));
        const hasGraph = this.objects.some(o => o.routeFrom && o.routeTo);
        if (!hasOrder && !hasGraph) return;

        const rad = (this.rotation * Math.PI) / 180;
        const cosR = Math.cos(rad), sinR = Math.sin(rad);
        const vcx = this.vpW / 2, vcy = this.vpH / 2;
        const projectCenter = (cell: Cell): { x: number; y: number } => {
            const px = (typeof cell.centroidX === "number") ? cell.centroidX : cell.x + cell.w / 2;
            const py = (typeof cell.centroidY === "number") ? cell.centroidY : cell.y + cell.h / 2;
            const dx = px - vcx;
            const dy = py - vcy;
            return {
                x: dx * cosR - dy * sinR + vcx,
                y: dx * sinR + dy * cosR + vcy,
            };
        };

        type Edge = { from: Cell; to: Cell; weight?: number };
        const edges: Edge[] = [];

        if (hasGraph) {
            for (const o of this.objects) {
                if (!o.routeFrom || !o.routeTo) continue;
                const from = cm[o.routeFrom];
                const to   = cm[o.routeTo];
                if (!from || !to) continue;
                edges.push({
                    from, to,
                    weight: typeof o.routeWeight === "number" ? o.routeWeight : undefined,
                });
            }
        } else {
            const ordered = this.objects
                .filter(o => typeof o.routeOrder === "number" && !isNaN(o.routeOrder as number))
                .sort((a, b) => (a.routeOrder as number) - (b.routeOrder as number));
            for (let i = 0; i < ordered.length - 1; i++) {
                const from = cm[ordered[i].id];
                const to   = cm[ordered[i + 1].id];
                if (!from || !to) continue;
                edges.push({ from, to });
            }
        }

        if (edges.length === 0) return;

        let maxW = 0;
        for (const e of edges) {
            if (typeof e.weight === "number" && e.weight > maxW) maxW = e.weight;
        }

        const baseW = this.routeThickness / this.zoomLevel;

        const showArrows = this.showArrows;
        if (showArrows) {
            this.ensureArrowMarker();
        }

        for (const e of edges) {
            const p0 = projectCenter(e.from);
            const p1 = projectCenter(e.to);

            if (Math.abs(p0.x - p1.x) < 0.01 && Math.abs(p0.y - p1.y) < 0.01) continue;

            let thickness = baseW;
            if (typeof e.weight === "number" && maxW > 0) {
                const norm = e.weight / maxW;
                thickness = baseW * (0.5 + norm * 1.5);
            }

            const line = svgEl("line", {
                x1: String(p0.x), y1: String(p0.y),
                x2: String(p1.x), y2: String(p1.y),
                stroke: this.routeColor,
                "stroke-width": String(thickness),
                "stroke-linecap": "round",
                opacity: String(this.routeOpacity),
            });
            line.setAttribute("pointer-events", "none");
            if (showArrows) {
                line.setAttribute("marker-end", "url(#syn-arrow)");
            }
            this.routesLayer!.appendChild(line);
        }
    }

    private ensureArrowMarker(): void {
        let defs = this.svg.querySelector("defs");
        if (!defs) {
            defs = document.createElementNS("http://www.w3.org/2000/svg", "defs") as SVGDefsElement;
            this.svg.insertBefore(defs, this.svg.firstChild);
        }
        let marker = this.svg.querySelector("#syn-arrow") as SVGMarkerElement | null;
        if (!marker) {
            marker = document.createElementNS("http://www.w3.org/2000/svg", "marker") as SVGMarkerElement;
            marker.setAttribute("id", "syn-arrow");
            marker.setAttribute("viewBox", "0 0 10 10");
            marker.setAttribute("refX", "9");
            marker.setAttribute("refY", "5");
            marker.setAttribute("markerWidth",  "5");
            marker.setAttribute("markerHeight", "5");
            marker.setAttribute("orient", "auto-start-reverse");
            marker.setAttribute("markerUnits", "strokeWidth");
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
            marker.appendChild(path);
            defs.appendChild(marker);
        }
        const path = marker.querySelector("path");
        if (path) path.setAttribute("fill", this.routeColor);
    }

    private drawCompass(W: number, H: number): void {
        const cx = W - 22, cy = H - 22, r = 16;
        const g = svgEl("g",{"id":"compass-group"});
        g.setAttribute("data-cx", String(cx));
        g.setAttribute("data-cy", String(cy));

        g.appendChild(svgEl("circle",{
            cx:String(cx),cy:String(cy),r:String(r),
            fill:CLR.panel,stroke:CLR.border,"stroke-width":"0.7",
        }));
        g.appendChild(svgEl("circle",{
            cx:String(cx),cy:String(cy),r:"1.8",
            fill:CLR.dim,
        }));
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

        const needleGroup = svgEl("g",{"id":"compass-needle-group"});
        needleGroup.appendChild(svgEl("polygon",{
            points:`${cx},${cy-10} ${cx+2.5},${cy-1} ${cx-2.5},${cy-1}`,
            fill:"#ef4444",
        }));
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
            const isActive = this.legendFilter.has(r.label);
            const chip=mk("div",{
                display:"flex",alignItems:"center",gap:"4px",
                padding:"2px 9px",borderRadius:"4px",cursor:"pointer",
                background: isActive ? hexToRgba(r.color,.28) : hexToRgba(r.color,.10),
                border:`1px solid ${isActive ? r.color : hexToRgba(r.color,.35)}`,
                boxShadow: isActive ? `0 0 0 1px ${r.color}55` : "none",
                whiteSpace:"nowrap",
                flexShrink:"0",
            });
            const dot=mk("div",{width:"7px",height:"7px",borderRadius:"2px",
                                 background:r.color,flexShrink:"0"});
            const lbl=mk("span",{fontSize:"8px",color:r.color,
                                  fontFamily:"'Segoe UI',sans-serif",
                                  fontWeight:isActive?"700":"400",
                                  whiteSpace:"nowrap"});
            lbl.textContent=r.label;
            chip.appendChild(dot);
            chip.appendChild(lbl);
            if(isActive){
                const x=mk("span",{fontSize:"10px",color:r.color,
                                    marginLeft:"2px",fontWeight:"700"});
                x.textContent="×";
                chip.appendChild(x);
            }
            chip.title = isActive
                ? "Click to remove · Ctrl+click to toggle in selection"
                : "Click to filter · Ctrl+click to add to selection";
            chip.addEventListener("click",(e)=>{
                e.stopPropagation();
                const isMulti = e.ctrlKey || e.metaKey;
                if (isMulti) {
                    if (this.legendFilter.has(r.label)) {
                        this.legendFilter.delete(r.label);
                    } else {
                        this.legendFilter.add(r.label);
                    }
                } else {
                    if (this.legendFilter.size === 1 && this.legendFilter.has(r.label)) {
                        this.legendFilter.clear();
                    } else {
                        this.legendFilter.clear();
                        this.legendFilter.add(r.label);
                    }
                }

                this.selectedIds.clear();
                if (this.allowInteractions) this.selMgr.clear();
                if (this.legendFilter.size > 0) {
                    const matching = this.objects.filter(obj => {
                        const res = applyRules(this.rules, obj, this.fallback);
                        return this.legendFilter.has(res.label);
                    });
                    matching.forEach((obj, i) => {
                        if (this.allowInteractions) {
                            this.selMgr.select(obj.selectionId, i > 0);
                        }
                        this.selectedIds.add(obj.id);
                    });
                }

                this.draw();
                this.drawLegend();
            });
            this.legendBar.appendChild(chip);
        });
    }

    private applyTransform(): void {
        if(!this.transformGroup) return;
        const W = this.vpW, H = this.vpH;
        const cx = W / 2, cy = H / 2;
        const tShapes = [
            `translate(${cx + this.panX},${cy + this.panY})`,
            `scale(${this.zoomLevel})`,
            `rotate(${this.rotation})`,
            `translate(${-cx},${-cy})`,
        ].join(" ");
        this.transformGroup.setAttribute("transform", tShapes);

        const tUpright = [
            `translate(${cx + this.panX},${cy + this.panY})`,
            `scale(${this.zoomLevel})`,
            `translate(${-cx},${-cy})`,
        ].join(" ");
        if(this.labelsGroup) this.labelsGroup.setAttribute("transform", tUpright);
        if(this.fillLayer)   this.fillLayer.setAttribute("transform", tUpright);
        if(this.routesLayer) this.routesLayer.setAttribute("transform", tUpright);

        [0,90,180,270].forEach(deg=>{
            const btn = this.target.querySelector(`#rot-btn-${deg}`) as HTMLElement;
            if(btn){
                btn.style.color        = this.rotation===deg ? "#07090a" : CLR.text;
                btn.style.borderColor  = this.rotation===deg ? CLR.green : CLR.border;
                btn.style.background   = this.rotation===deg ? CLR.green : CLR.card;
                btn.style.fontWeight   = this.rotation===deg ? "700"     : "500";
            }
        });

        const zd = this.target.querySelector("#zoom-display") as HTMLElement;
        if(zd) zd.textContent = `${Math.round(this.zoomLevel*100)}%`;

        if(this.labelsGroup && this.fillLayer && this.transformGroup){
            clearNode(this.labelsGroup);
            clearNode(this.fillLayer);

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
                // bbox center (pre-rotation) — used for fill rect alignment.
                // Differs from gcx/gcy for polygons whose centroid is offset
                // from the bbox center.
                const gbx = parseFloat(g2.getAttribute("data-bx") || String(gcx));
                const gby = parseFloat(g2.getAttribute("data-by") || String(gcy));
                const gcwRaw = parseFloat(g2.getAttribute("data-cw")||"22");
                const gchRaw = parseFloat(g2.getAttribute("data-ch")||"46");
                const gawRaw = parseFloat(g2.getAttribute("data-aw") || String(gcwRaw));
                const gahRaw = parseFloat(g2.getAttribute("data-ah") || String(gchRaw));
                const pct = parseFloat(g2.getAttribute("data-pct")||"0");
                const lbl = g2.getAttribute("data-lbl")||"";
                const val = g2.getAttribute("data-val")||"";
                const txt1 = g2.getAttribute("data-txt1")||"";
                const col = g2.getAttribute("data-col")||CLR.text;
                const hasVal  = this.showValue && val  !== "";
                const hasTxt1 = txt1 !== "";

                const normRot = ((this.rotation % 360) + 360) % 360;
                const swap = (normRot === 90 || normRot === 270);
                const gcw = swap ? gchRaw : gcwRaw;
                const gch = swap ? gcwRaw : gchRaw;
                const gaw = swap ? gahRaw : gawRaw;
                const gah = swap ? gawRaw : gahRaw;

                // Anchor (label placement) and bbox center (fill placement).
                // For rectangles they coincide; for polygons with a custom
                // centroid the anchor is the centroid and bbox is geometric.
                const center = rotPt2(gcx, gcy);
                const bboxCenter = rotPt2(gbx, gby);

                if(pct > 0){
                    const polyStr = g2.getAttribute("data-poly");
                    const fillHFull = gch;
                    const fh = fillHFull * pct;
                    const bottomY = bboxCenter.y + fillHFull/2;
                    const topY = bottomY - fh;

                    if (polyStr) {
                        // ── Polygon-as-fill rendering ────────────────────
                        // Render the fill USING the same vertices as the
                        // shape itself, so its diagonal edges match the
                        // polygon's stroke pixel-perfectly. Then clip the
                        // polygon by HEIGHT (a rectangular clip from topY
                        // downward) to enforce the gravity-aware fill
                        // percentage. This replaces the previous approach
                        // of "rect clipped by polygon silhouette", which
                        // left sub-pixel gaps on diagonal edges due to
                        // antialiasing of two non-aligned shapes.
                        //
                        // Parse the points (already in pre-rotation
                        // viewport coordinates) and project them through
                        // the same rotation pipeline applied to bboxCenter.
                        const pts = polyStr.split(";").map(s => {
                            const xy = s.split(",");
                            return rotPt2(parseFloat(xy[0]), parseFloat(xy[1]));
                        });
                        const ptsAttr = pts.map(p => p.x + "," + p.y).join(" ");

                        // Height-only clip: a rectangular clipPath that
                        // covers from topY to bottomY across the full
                        // viewport width. Combined with the polygon-shape
                        // fill, the visible result is the bottom portion
                        // of the polygon up to topY.
                        //
                        // We register it as a unique clipPath per-cell so
                        // multiple cells with different fill heights don't
                        // share a clip and overwrite each other. The id
                        // includes the cell's clip id (already unique).
                        const polyClipId = g2.getAttribute("data-clip") || "";
                        const heightClipId = polyClipId + "-h";
                        let defs = this.svg.querySelector("defs");
                        if (!defs) {
                            defs = document.createElementNS("http://www.w3.org/2000/svg", "defs") as SVGDefsElement;
                            this.svg.insertBefore(defs, this.svg.firstChild);
                        }
                        let hClip = this.svg.querySelector("#" + heightClipId) as SVGClipPathElement | null;
                        if (!hClip) {
                            hClip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath") as SVGClipPathElement;
                            hClip.setAttribute("id", heightClipId);
                            hClip.setAttribute("clipPathUnits", "userSpaceOnUse");
                            defs.appendChild(hClip);
                        }
                        // Rebuild the height-clip rect every render (fh
                        // changes with the data percentage; topY changes
                        // with rotation+resize).
                        while (hClip.firstChild) hClip.removeChild(hClip.firstChild);
                        const clipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                        clipRect.setAttribute("x",      String(0));
                        clipRect.setAttribute("y",      String(topY));
                        clipRect.setAttribute("width",  String(this.vpW));
                        clipRect.setAttribute("height", String(fh + 2)); // +2 for rounding tolerance
                        hClip.appendChild(clipRect);

                        const wrapG = svgEl("g", {
                            "clip-path": "url(#" + heightClipId + ")",
                        });
                        const fillPoly = svgEl("polygon", {
                            points: ptsAttr,
                            fill:   hexToRgba(col, .35),
                        });
                        fillPoly.setAttribute("pointer-events", "none");
                        wrapG.appendChild(fillPoly);
                        this.fillLayer!.appendChild(wrapG);
                    } else {
                        // ── Rectangle fill rendering ─────────────────────
                        // For non-polygon shapes the fill rect aligns
                        // perfectly with the shape's bbox, no clipping
                        // needed.
                        const fx = bboxCenter.x - gcw / 2;
                        const fy = topY;

                        const fr = svgEl("rect",{
                            x:String(fx), y:String(fy),
                            width:String(gcw), height:String(fh),
                            fill:hexToRgba(col,.35),
                        });
                        fr.setAttribute("pointer-events","none");
                        this.fillLayer!.appendChild(fr);
                    }
                }

                const haloScale = 1 / this.zoomLevel;
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
                        "stroke-width":String(haloW * haloScale),
                        "stroke-linejoin":"round",
                        "stroke-opacity":String(haloOp),
                        "paint-order":"stroke fill",
                    });
                    t.setAttribute("pointer-events","none");
                    t.textContent = text;
                    this.labelsGroup!.appendChild(t);
                };

                const fitFont = (text: string, maxFs: number, availW: number, bold = false): number => {
                    if (!text) return maxFs;
                    const charW = bold ? 0.60 : 0.55;
                    const widthAt = (fs: number) => fs * charW * text.length;
                    if (widthAt(maxFs) <= availW) return maxFs;
                    const fitted = availW / (charW * text.length);
                    return Math.max(4, Math.floor(fitted * 10) / 10);
                };

                const valTxt   = readableOn(col, CLR.bg, 0.35);
                const valHalo  = valTxt === "#0a0f14" ? "#f4f8fb" : "#0a0f14";

                const isHorizontal = gaw > gah * 1.2;

                if (isHorizontal) {
                    const yMid = center.y;
                    const effW = gaw - 10;

                    let level = 1;
                    if      (effW >= 100 && hasTxt1) level = 3;
                    else if (effW >=  70)            level = 2;
                    else                             level = 1;

                    const fsLbl  = Math.max(5, Math.min(12, gah * 0.50));
                    const fsTxt  = Math.max(5, Math.min(10, gah * 0.38));
                    const fsVal  = Math.max(5, Math.min(11, gah * 0.46));

                    const drawSep = (x:number) => {
                        const s = svgEl("line",{
                            x1:String(x), y1:String(yMid - gah*0.25),
                            x2:String(x), y2:String(yMid + gah*0.25),
                            stroke:CLR.border,
                            "stroke-width":String(0.8 / this.zoomLevel),
                            "stroke-opacity":"0.55",
                        });
                        s.setAttribute("pointer-events","none");
                        this.labelsGroup!.appendChild(s);
                    };

                    if (level === 1) {
                        if (this.showLabel && lbl) {
                            const fittedFs = fitFont(lbl, fsLbl, effW, true);
                            mkText(center.x, yMid, lbl,
                                   fittedFs, "700", CLR.text, CLR.bg, 1.2, 0.5);
                        } else if (hasVal) {
                            const fittedFs = fitFont(val, fsVal, effW, true);
                            mkText(center.x, yMid, val, fittedFs, "800",
                                   valTxt, valHalo, 1.2, 0.35);
                        }
                    } else if (level === 2) {
                        const leftX  = center.x - gaw * 0.30;
                        const rightX = center.x + gaw * 0.30;
                        const sepX   = center.x;

                        if (this.showLabel && lbl) {
                            const slotW = gaw * 0.5;
                            const fittedFs = fitFont(lbl, fsLbl, slotW, true);
                            mkText(leftX, yMid, lbl, fittedFs, "700",
                                   CLR.text, CLR.bg, 1.2, 0.5, "middle");
                        }
                        if (hasVal) {
                            drawSep(sepX);
                            const slotW = gaw * 0.5;
                            const fittedFs = fitFont(val, fsVal, slotW, true);
                            mkText(rightX, yMid, val, fittedFs, "800",
                                   valTxt, valHalo, 1.2, 0.35, "middle");
                        }
                    } else if (level === 3) {
                        const x1 = center.x - gaw * 0.35;
                        const x2 = center.x;
                        const x3 = center.x + gaw * 0.35;
                        const sep1X = center.x - gaw * 0.17;
                        const sep2X = center.x + gaw * 0.17;
                        const slotW = gaw * 0.30;

                        if (this.showLabel && lbl) {
                            const fittedFs = fitFont(lbl, fsLbl, slotW, true);
                            mkText(x1, yMid, lbl, fittedFs, "700",
                                   CLR.text, CLR.bg, 1.2, 0.5, "middle");
                        }
                        drawSep(sep1X);
                        const fittedFsTxt = fitFont(txt1, fsTxt, slotW, false);
                        mkText(x2, yMid, txt1, fittedFsTxt, "500",
                               CLR.dim, CLR.bg, 0.8, 0.35, "middle");
                        if (hasVal) {
                            drawSep(sep2X);
                            const fittedFsVal = fitFont(val, fsVal, slotW, true);
                            mkText(x3, yMid, val, fittedFsVal, "800",
                                   valTxt, valHalo, 1.2, 0.35, "middle");
                        }
                    }
                } else {
                    const fsLbl = Math.max(5, Math.min(10, gaw/3.5));
                    const fsVal = Math.max(5, Math.min(9,  gaw/4.2));
                    const lblFitted = fitFont(lbl, fsLbl, gaw * 0.90, true);
                    const valFitted = fitFont(val, fsVal, gaw * 0.90, true);

                    const lineLbl = lblFitted * 1.4;
                    const lineVal = valFitted * 1.4;

                    const showLbl = this.showLabel && !!lbl;
                    const wantVal = hasVal;

                    let layout: "lbl_val" | "lbl_only" | "val_only" | "none" = "none";
                    if (showLbl && wantVal && gah >= lineLbl + lineVal + 2) {
                        layout = "lbl_val";
                    } else if (showLbl) {
                        layout = "lbl_only";
                    } else if (wantVal) {
                        layout = "val_only";
                    }

                    if (layout === "lbl_val") {
                        mkText(center.x, center.y - gah * 0.22, lbl, lblFitted, "700",
                               CLR.text, CLR.bg, 1.2, 0.5, "middle");
                        mkText(center.x, center.y + gah * 0.22, val, valFitted, "800",
                               valTxt, valHalo, 1.2, 0.35, "middle");
                    } else if (layout === "lbl_only") {
                        const fsLblBig = Math.min(fsLbl * 1.5, gah * 0.65);
                        const lblFittedBig = fitFont(lbl, fsLblBig, gaw * 0.90, true);
                        mkText(center.x, center.y, lbl, lblFittedBig, "700",
                               CLR.text, CLR.bg, 1.2, 0.5, "middle");
                    } else if (layout === "val_only") {
                        mkText(center.x, center.y, val, valFitted, "800",
                               valTxt, valHalo, 1.2, 0.35, "middle");
                    }
                }
            });
        }
    }

    private drawCompassRotated(): void {
        const compassG = this.svg.getElementById("compass-group");
        if(!compassG) return;
        const needleGroup = this.svg.getElementById("compass-needle-group");
        if(!needleGroup) return;
        const cx = this.vpW - 22, cy = this.vpH - 22;
        needleGroup.setAttribute("transform", `rotate(${this.rotation},${cx},${cy})`);
    }

    private positionTip(e: MouseEvent): void {
        const cr = this.wrapper.getBoundingClientRect();
        const cx = e.clientX - cr.left;
        const cy = e.clientY - cr.top;
        const tw = this.tooltipDiv.offsetWidth  || 220;
        const th = this.tooltipDiv.offsetHeight || 140;
        const gap = 16;

        const onRight  = cx > cr.width  * 0.5;
        const onBottom = cy > cr.height * 0.5;

        let tx = onRight  ? cx - tw - gap : cx + gap;
        let ty = onBottom ? cy - th - gap : cy + gap;

        tx = Math.max(4, Math.min(cr.width  - tw - 4, tx));
        ty = Math.max(4, Math.min(cr.height - th - 4, ty));

        this.tooltipDiv.style.left = `${tx}px`;
        this.tooltipDiv.style.top  = `${ty}px`;
    }

    private sanitizeIdFragment(raw: string): string {
        if (!raw) return "x";
        return "c" + String(raw).replace(/[^A-Za-z0-9_-]/g, "_");
    }

    private ensurePolygonClipPath(cell: Cell): void {
        if (!cell.polyPts || cell.polyPts.length < 3) return;

        let defs = this.svg.querySelector("defs");
        if (!defs) {
            defs = document.createElementNS("http://www.w3.org/2000/svg", "defs") as SVGDefsElement;
            this.svg.insertBefore(defs, this.svg.firstChild);
        }

        const cellIdRaw = cell["id"];
        const clipId = "syn-clip-" + this.sanitizeIdFragment(cellIdRaw);

        let cp = this.svg.querySelector("#" + clipId) as SVGClipPathElement | null;
        if (!cp) {
            cp = document.createElementNS("http://www.w3.org/2000/svg", "clipPath") as SVGClipPathElement;
            cp.setAttribute("id", clipId);
            cp.setAttribute("clipPathUnits", "userSpaceOnUse");
            defs.appendChild(cp);
        }
        while (cp.firstChild) cp.removeChild(cp.firstChild);

        const rad = (this.rotation * Math.PI) / 180;
        const cosR = Math.cos(rad), sinR = Math.sin(rad);
        const cx = this.vpW / 2, cy = this.vpH / 2;
        const projected = cell.polyPts.map(p => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            return {
                x: dx * cosR - dy * sinR + cx,
                y: dx * sinR + dy * cosR + cy,
            };
        });
        const ptsStr = projected.map(p => p.x + "," + p.y).join(" ");
        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        poly.setAttribute("points", ptsStr);
        cp.appendChild(poly);
    }

    private persistRotation(): void {
        try {
            this.fmtSettings.generalCard.rotation.value = this.rotation;
            this.host.persistProperties({
                merge: [{
                    objectName: "general",
                    selector: null as unknown as powerbi.data.Selector,
                    properties: { rotation: this.rotation },
                }],
            });
        } catch (_e) { /* persistence is best-effort */ }
    }

    private drawHint(): void {
        const old = this.target.querySelector("#syn-hint");
        if (old && old.parentNode) old.parentNode.removeChild(old);

        if (this.hintDismissed || !this.shouldShowHint) return;

        const hint = mk("div",{
            position:"absolute",
            bottom:"10px",
            left:"10px",
            maxWidth:"290px",
            padding:"8px 12px",
            background:CLR.panel,
            border:`1px solid ${hexToRgba("#38bdf8", .55)}`,
            borderLeft:`3px solid #38bdf8`,
            borderRadius:"6px",
            boxShadow:"0 4px 14px rgba(0,0,0,.35)",
            fontSize:"10px",
            color:CLR.text,
            fontFamily:"'Segoe UI',sans-serif",
            lineHeight:"1.4",
            zIndex:"50",
            display:"flex",
            alignItems:"flex-start",
            gap:"8px",
        });
        hint.id = "syn-hint";

        const body = mk("div",{flex:"1",minWidth:"0"});
        const ttl = mk("div",{
            fontWeight:"700",
            color:"#38bdf8",
            fontSize:"9px",
            textTransform:"uppercase",
            letterSpacing:".06em",
            marginBottom:"3px",
        });
        ttl.textContent = this.currentMissing > 0
            ? `${this.currentMissing} object${this.currentMissing === 1 ? "" : "s"} hidden`
            : "Missing some objects?";
        const msg = mk("div",{color:CLR.muted,fontSize:"10px"});
        const appendBold = (parent: HTMLElement, text: string) => {
            const b = document.createElement("b");
            b.textContent = text;
            parent.appendChild(b);
        };
        msg.appendChild(document.createTextNode("Right-click on "));
        appendBold(msg, "Object ID");
        msg.appendChild(document.createTextNode(" and each "));
        appendBold(msg, "Layout");
        msg.appendChild(document.createTextNode(" field, then enable "));
        appendBold(msg, "Show items with no data");
        msg.appendChild(document.createTextNode("."));
        body.appendChild(ttl);
        body.appendChild(msg);

        const close = mk("button",{
            background:"none",
            border:"none",
            color:CLR.dim,
            cursor:"pointer",
            fontSize:"14px",
            lineHeight:"1",
            padding:"0 0 0 4px",
            flexShrink:"0",
        });
        close.textContent = "✕";
        close.title = "Dismiss";
        close.addEventListener("click",(e)=>{
            e.stopPropagation();
            this.hintDismissed = true;
            this.lastReportedMissing = this.currentMissing;
            if (hint.parentNode) hint.parentNode.removeChild(hint);
        });

        hint.appendChild(body);
        hint.appendChild(close);
        this.target.appendChild(hint);
    }

    /**
     * Show the landing page (no-data state) using a plain HTML <div>
     * centered with CSS transform. The browser keeps it centered when
     * the wrapper resizes — no JS reposition logic, no observer hooks,
     * no flicker. Idempotent: if the div already exists we just make
     * sure it's visible; rebuilding only happens on theme change.
     */
    private drawEmpty(): void {
        // Clear any data-state SVG content so nothing leaks behind the
        // landing div (e.g. shapes from the previous data binding).
        const tg = this.svg.getElementById("transform-group");
        if (tg) clearNode(tg);
        const fl = this.svg.getElementById("fill-layer");
        if (fl) clearNode(fl);
        const rl = this.svg.getElementById("routes-layer");
        if (rl) clearNode(rl);
        const tlg = this.svg.getElementById("text-layer");
        if (tlg) clearNode(tlg);
        const lg = this.svg.getElementById("labels-group");
        if (lg) clearNode(lg);
        // Compass disappears with no data.
        const compass = this.svg.getElementById("compass-group");
        if (compass && compass.parentNode) compass.parentNode.removeChild(compass);
        // Hint banner disappears too.
        const oldHint = this.target.querySelector("#syn-hint");
        if (oldHint && oldHint.parentNode) oldHint.parentNode.removeChild(oldHint);

        // Background rect tracks the SVG (already sized in updateInternal).
        let bgRect = this.svg.getElementById("bg-rect") as SVGElement;
        if (!bgRect) {
            bgRect = svgEl("rect", { id: "bg-rect" });
            this.svg.appendChild(bgRect);
        }
        bgRect.setAttribute("width",  String(this.vpW));
        bgRect.setAttribute("height", String(this.vpH));
        bgRect.setAttribute("fill",   CLR.bg);

        const loc = (key: string, fallback: string): string => {
            if (!this.localization) return fallback;
            try {
                const result = this.localization.getDisplayName(key);
                return (result && result !== key) ? result : fallback;
            } catch (_e) {
                return fallback;
            }
        };

        // Build the landing div ONCE on first call. Subsequent calls just
        // reuse the existing element (the browser handles centering on
        // resize, so there's nothing to update).
        if (!this.landingDiv) {
            const div = document.createElement("div");
            div.id = "syn-landing";
            // CSS-based centering: top/left at 50%, then translate -50%
            // back to center the element on the wrapper's midpoint.
            // The wrapper is the parent (top:54px, bottom:0, left:0,
            // right:0) so 50% of wrapper corresponds to 50% of the
            // SVG/canvas area. Crucially, this is computed by the
            // browser at every paint — no JS, no flicker.
            Object.assign(div.style, {
                position:      "absolute",
                top:           "50%",
                left:          "50%",
                transform:     "translate(-50%, -50%)",
                textAlign:     "center",
                fontFamily:    "'Segoe UI', sans-serif",
                pointerEvents: "none",
                userSelect:    "none",
            });

            // Decorative 3x3 grid icon (suggests a synoptic layout).
            const icon = document.createElement("div");
            Object.assign(icon.style, {
                display:             "grid",
                gridTemplateColumns: "repeat(3, 12px)",
                gridGap:             "4px",
                justifyContent:      "center",
                marginBottom:        "16px",
            });
            for (let i = 0; i < 9; i++) {
                const dot = document.createElement("div");
                const row = Math.floor(i / 3);
                const col = i % 3;
                Object.assign(dot.style, {
                    width:        "12px",
                    height:       "12px",
                    borderRadius: "1px",
                    background:   CLR.green,
                    opacity:      String(0.15 + 0.10 * (row + col)),
                });
                icon.appendChild(dot);
            }
            div.appendChild(icon);

            const title = document.createElement("div");
            Object.assign(title.style, {
                fontSize:    "16px",
                fontWeight:  "700",
                color:       CLR.text,
                marginBottom: "6px",
            });
            title.textContent = loc("LandingPage_Title", "Synoptic Studio");
            div.appendChild(title);

            const subtitle = document.createElement("div");
            Object.assign(subtitle.style, {
                fontSize: "12px",
                color:    CLR.dim,
                marginBottom: "12px",
            });
            subtitle.textContent = loc("LandingPage_Subtitle", "Drop your data fields to start.");
            div.appendChild(subtitle);

            const hint = document.createElement("div");
            Object.assign(hint.style, {
                fontSize: "10px",
                color:    CLR.muted,
                maxWidth: "420px",
                lineHeight: "1.4",
            });
            hint.textContent = loc(
                "LandingPage_RequiredFields",
                "Required: Object ID. Recommended: Layout X/Y/W/H, Canvas W/H.",
            );
            div.appendChild(hint);

            this.wrapper.appendChild(div);
            this.landingDiv = div;
        } else {
            // Theme might have changed since last build (light↔dark, or
            // high contrast on/off). Refresh the colors that came from
            // CLR. Cheap — just style attribute writes.
            const elems = this.landingDiv.children;
            // 0 = icon container, 1 = title, 2 = subtitle, 3 = hint
            if (elems.length >= 4) {
                const icon = elems[0] as HTMLElement;
                for (let i = 0; i < icon.children.length; i++) {
                    const dot = icon.children[i] as HTMLElement;
                    dot.style.background = CLR.green;
                }
                (elems[1] as HTMLElement).style.color = CLR.text;
                (elems[2] as HTMLElement).style.color = CLR.dim;
                (elems[3] as HTMLElement).style.color = CLR.muted;
            }
            // Make sure it's visible (in case data was bound earlier and
            // we hid it).
            this.landingDiv.style.display = "";
        }
    }

    /**
     * Hide the landing div when data is bound. Called from draw() before
     * rendering the data-state. Cheap: just toggles display.
     */
    private hideLanding(): void {
        if (this.landingDiv) {
            this.landingDiv.style.display = "none";
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.fmtSvc.buildFormattingModel(this.fmtSettings);
    }

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
        return true;
    }

    private isHighContrast(): boolean {
        try {
            const palette = this.host && (this.host as unknown as {
                colorPalette?: { isHighContrast?: boolean };
            }).colorPalette;
            return !!(palette && palette.isHighContrast);
        } catch (_err) { return false; }
    }

    private hcColors(): { fg: string; bg: string; sel: string; link: string } | null {
        if (!this.isHighContrast()) return null;
        try {
            type HCPalette = {
                foreground?:         { value?: string };
                background?:         { value?: string };
                foregroundSelected?: { value?: string };
                hyperlink?:          { value?: string };
            };
            const palette = (this.host as unknown as {
                colorPalette: HCPalette;
            }).colorPalette;
            return {
                fg:   (palette.foreground         && palette.foreground.value)         || "#FFFFFF",
                bg:   (palette.background         && palette.background.value)         || "#000000",
                sel:  (palette.foregroundSelected && palette.foregroundSelected.value) || "#1AEBFF",
                link: (palette.hyperlink          && palette.hyperlink.value)          || "#FFFF00",
            };
        } catch (_err) {
            return { fg: "#FFFFFF", bg: "#000000", sel: "#1AEBFF", link: "#FFFF00" };
        }
    }
}
