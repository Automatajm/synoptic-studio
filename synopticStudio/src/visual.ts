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

interface SynopticObject {
    id:             string;
    label:          string;
    valorPrincipal?: number;
    campoTexto1?:   string;
    campoTexto2?:   string;
    valor2?:        number;
    valor3?:        number;
    tooltipExtra?:  number;
    layoutX?:       number;
    layoutY?:       number;
    layoutW?:       number;
    layoutH?:       number;
    selectionId:    ISelectionId;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const PALETTE = [
    "#52626a","#00e5a0","#f59e0b","#fb923c","#ef4444",
    "#38bdf8","#a78bfa","#ec4899","#2dd4bf","#84cc16",
    "#e879f9","#fbbf24","#ffffff","#94a3b8",
];

// ── Theme ─────────────────────────────────────────────────────────────────────
const CLR = {
    bg:"#07090a", surface:"#0c1014", panel:"#090d10",
    card:"#0f1518", border:"#182028", hi:"#1e2e3a",
    green:"#00e5a0", dim:"#3a5868", text:"#c0d8e4",
    lo:"#0e1418", muted:"#6a8898", red:"#ef4444", glo:"#00301e",
};

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
function evalRule(rule: ColorRule, obj: SynopticObject): boolean {
    const map: Record<string,string|number|undefined> = {
        campoTexto1:obj.campoTexto1, campoTexto2:obj.campoTexto2,
        valorPrincipal:obj.valorPrincipal, valor2:obj.valor2, valor3:obj.valor3,
    };
    const raw = map[rule.field];
    if (raw === undefined || raw === null) return false;
    const rv = parseFloat(rule.value), rv2 = parseFloat(rule.value2||"0");
    const nv = typeof raw==="number" ? raw : parseFloat(String(raw));
    switch(rule.op){
        case "eq":      return String(raw)===String(rule.value);
        case "neq":     return String(raw)!==String(rule.value);
        case "gt":      return nv>rv;
        case "gte":     return nv>=rv;
        case "lt":      return nv<rv;
        case "lte":     return nv<=rv;
        case "between": return nv>=rv&&nv<=rv2;
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
                      fn: Record<string,string>): HTMLElement {
    const wrap = mk("div",{
        background:CLR.panel, border:`1px solid ${color}55`, borderRadius:"9px",
        padding:"12px 14px", minWidth:"180px", fontFamily:"'Segoe UI',sans-serif",
        boxShadow:"0 8px 28px rgba(0,0,0,.6)", pointerEvents:"none",
    });
    const hdr = mk("div",{display:"flex",justifyContent:"space-between",
                           alignItems:"flex-start",marginBottom:"8px"});
    const ttl = mk("div",{color,fontWeight:"700",fontSize:"13px",letterSpacing:".04em"});
    ttl.textContent = obj.label||obj.id;
    const bdg = mk("span",{
        background:hexToRgba(color,.15), border:`1px solid ${hexToRgba(color,.4)}`,
        borderRadius:"4px", padding:"1px 7px", fontSize:"8px",
        color, fontWeight:"700", marginLeft:"8px", whiteSpace:"nowrap",
    });
    bdg.textContent = ruleLabel;
    hdr.appendChild(ttl); hdr.appendChild(bdg); wrap.appendChild(hdr);

    const tbl = mk("table",{borderCollapse:"collapse",width:"100%"});
    const row = (lbl: string, val: string|number|undefined) => {
        if (val===undefined||val===null) return;
        const tr=mk("tr"), td1=mk("td",{color:CLR.dim,fontSize:"9px",
            textTransform:"uppercase",letterSpacing:".06em",
            padding:"2px 8px 2px 0",whiteSpace:"nowrap"}),
        td2=mk("td",{color:CLR.text,fontSize:"10px",fontWeight:"600",padding:"2px 0"});
        td1.textContent=lbl; td2.textContent=String(val);
        tr.appendChild(td1); tr.appendChild(td2); tbl.appendChild(tr);
    };
    if (obj.valorPrincipal!==undefined)
        row(fn["valorPrincipal"]||"Valor Principal",
            typeof obj.valorPrincipal==="number"
                ? obj.valorPrincipal.toLocaleString("es-DO") : obj.valorPrincipal);
    if (obj.campoTexto1)  row(fn["campoTexto1"]||"Campo 1",  obj.campoTexto1);
    if (obj.campoTexto2)  row(fn["campoTexto2"]||"Campo 2",  obj.campoTexto2);
    if (obj.valor2!==undefined) row(fn["valor2"]||"Valor 2", obj.valor2.toLocaleString("es-DO"));
    if (obj.valor3!==undefined) row(fn["valor3"]||"Valor 3", obj.valor3.toLocaleString("es-DO"));
    if (obj.tooltipExtra!==undefined) row(fn["tooltipExtra"]||"Extra", obj.tooltipExtra.toLocaleString("es-DO"));
    wrap.appendChild(tbl);
    return wrap;
}

// ── Rules Editor ──────────────────────────────────────────────────────────────
const OPS = [
    {k:"eq",l:"= igual"},{k:"neq",l:"≠ distinto"},
    {k:"gt",l:"> mayor"},{k:"gte",l:"≥ mayor/igual"},
    {k:"lt",l:"< menor"},{k:"lte",l:"≤ menor/igual"},
    {k:"between",l:"entre"},
];
const FIELDS = [
    {k:"campoTexto1",l:"Campo Texto 1"},{k:"campoTexto2",l:"Campo Texto 2"},
    {k:"valorPrincipal",l:"Valor Principal"},{k:"valor2",l:"Valor 2"},{k:"valor3",l:"Valor 3"},
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
        hm.textContent="Motor de Reglas";
        ht.appendChild(hs); ht.appendChild(hm);
        const cb = mk("button",btn(CLR.dim)); cb.textContent="✕ cerrar";
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
        info.textContent="Evalúa de arriba a abajo — la primera regla que coincide define el color. ↑↓ ajusta prioridad. El checkbox activa/desactiva sin borrar.";
        body.appendChild(info);

        // Palette
        const pb = mk("div",{background:CLR.card,border:`1px solid ${CLR.border}`,
                               borderRadius:"6px",padding:"7px 10px",marginBottom:"10px"});
        const pt = mk("div",{fontSize:"7px",color:CLR.dim,textTransform:"uppercase",
                               letterSpacing:".08em",marginBottom:"5px"});
        pt.textContent="PALETA"; pb.appendChild(pt);
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
        rl.textContent="REGLAS — evalúa en orden";
        const ab=mk("button",{...btn(CLR.green,CLR.glo),padding:"3px 10px"});
        ab.textContent="+ Agregar";
        ab.addEventListener("click",()=>{
            this.rules.push({id:uid(),field:"campoTexto1",op:"eq",
                              value:"",value2:"",color:"#00e5a0",
                              label:"Nueva regla",enabled:true});
            this.renderList();
        });
        rh.appendChild(rl); rh.appendChild(ab); body.appendChild(rh);

        this.listEl=mk("div"); body.appendChild(this.listEl);

        // Legend label
        const ll=mk("div",{fontSize:"7px",color:CLR.dim,textTransform:"uppercase",
                             letterSpacing:".08em",marginTop:"10px",marginBottom:"5px"});
        ll.textContent="LEYENDA"; body.appendChild(ll);
        this.legEl=mk("div",{display:"flex",flexWrap:"wrap",gap:"4px"});
        body.appendChild(this.legEl);

        // Save
        const sw=mk("div",{marginTop:"12px",paddingTop:"10px",
                             borderTop:`1px solid ${CLR.border}`,
                             display:"flex",justifyContent:"flex-end"});
        const sb=mk("button",{...btn(CLR.green,CLR.glo),
                                padding:"6px 18px",fontSize:"10px",fontWeight:"700"});
        sb.textContent="✓ Guardar reglas";
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
            pop.style.display=pop.style.display==="none"?"flex":"none";
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

        // Value
        const vi=mk("input",{...INP,flex:"1",minWidth:"0"}) as HTMLInputElement;
        vi.value=rule.value; vi.placeholder="valor";
        vi.addEventListener("input",()=>rule.value=vi.value);
        row.appendChild(vi);

        // Value2
        if(rule.op==="between"){
            const sep=mk("span",{color:CLR.dim,fontSize:"8px",flexShrink:"0"});
            sep.textContent="–"; row.appendChild(sep);
            const v2=mk("input",{...INP,flex:"1",minWidth:"0"}) as HTMLInputElement;
            v2.value=rule.value2||""; v2.placeholder="máx";
            v2.addEventListener("input",()=>rule.value2=v2.value);
            row.appendChild(v2);
        }

        // Label
        const li=mk("input",{...INP,width:"78px",flexShrink:"0"}) as HTMLInputElement;
        li.value=rule.label; li.placeholder="etiqueta";
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
    private rotation = 0;   // 0 | 90 | 180 | 270
    private isPanning= false;
    private panStartX= 0;
    private panStartY= 0;
    private panOriginX=0;
    private panOriginY=0;
    private transformGroup: SVGElement | null = null;
    private fieldNames:  Record<string,string> = {};
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

        this.target.style.cssText=
            "position:relative;width:100%;height:100%;overflow:hidden;"+
            "background:#07090a;font-family:'Segoe UI',sans-serif;";

        // Top bar
        const bar=mk("div",{
            position:"absolute",top:"0",left:"0",right:"0",height:"28px",
            background:CLR.surface,borderBottom:`1px solid ${CLR.border}`,
            display:"flex",alignItems:"center",padding:"0 8px",gap:"8px",zIndex:"100",
        });
        const gb=mk("button",{...btn(CLR.green,CLR.glo),padding:"3px 10px",fontSize:"9px"});
        gb.textContent="⚙ Reglas de color";
        bar.appendChild(gb);
        bar.appendChild(mk("div",{width:"1px",height:"16px",background:CLR.border}));
        this.legendBar=mk("div",{display:"flex",gap:"4px",flexWrap:"wrap",alignItems:"center",flex:"1"});
        bar.appendChild(this.legendBar);
        this.target.appendChild(bar);

        // Canvas wrapper
        this.wrapper=mk("div",{position:"absolute",top:"28px",left:"0",right:"0",bottom:"0"});
        this.target.appendChild(this.wrapper);

        // SVG
        this.svg=document.createElementNS("http://www.w3.org/2000/svg","svg") as SVGSVGElement;
        this.svg.style.cssText="position:absolute;top:0;left:0;width:100%;height:100%";
        this.wrapper.appendChild(this.svg);

        // Tooltip
        this.tooltipDiv=document.createElement("div") as HTMLDivElement;
        this.tooltipDiv.style.cssText="position:absolute;display:none;z-index:9999;pointer-events:none";
        this.wrapper.appendChild(this.tooltipDiv);

        // Editor
        this.editor=new RulesEditor(this.target,(rules)=>{
            this.rules=rules;
            this.fmtSettings.reglaColorCard.reglasJson.value=JSON.stringify(rules);
            this.draw(); this.drawLegend();
        });

        gb.addEventListener("click",(e)=>{ e.stopPropagation(); this.editor.toggle(); });

        // Separator
        bar.appendChild(mk("div",{width:"1px",height:"20px",background:CLR.border,marginLeft:"4px"}));

        // Rotation buttons
        const rotLabel = mk("span",{fontSize:"8px",color:CLR.dim,
                                     fontFamily:"'Segoe UI',sans-serif",marginLeft:"4px"});
        rotLabel.textContent="↻";
        bar.appendChild(rotLabel);

        [0,90,180,270].forEach(deg=>{
            const rb=mk("button",{
                fontFamily:"'Segoe UI',sans-serif",fontSize:"8px",
                padding:"2px 6px",background:"none",
                border:`1px solid ${CLR.border}`,color:CLR.dim,
                borderRadius:"3px",cursor:"pointer",marginLeft:"2px",
            });
            rb.textContent=`${deg}°`;
            rb.id=`rot-btn-${deg}`;
            rb.addEventListener("click",(e)=>{
                e.stopPropagation();
                this.rotation=deg;
                this.panX=0; this.panY=0; this.zoomLevel=1.0;
                this.applyTransform();
                this.drawCompassRotated();
            });
            bar.appendChild(rb);
        });

        // Zoom controls
        bar.appendChild(mk("div",{width:"1px",height:"20px",background:CLR.border,marginLeft:"6px"}));
        const zoomIn=mk("button",{fontFamily:"'Segoe UI',sans-serif",fontSize:"11px",
            padding:"1px 7px",background:"none",
            border:`1px solid ${CLR.border}`,color:CLR.dim,
            borderRadius:"3px",cursor:"pointer",marginLeft:"4px"});
        zoomIn.textContent="+";
        zoomIn.addEventListener("click",(e)=>{
            e.stopPropagation();
            this.zoomLevel=Math.min(this.zoomLevel*1.25,5);
            this.applyTransform();
        });
        bar.appendChild(zoomIn);

        const zoomOut=mk("button",{fontFamily:"'Segoe UI',sans-serif",fontSize:"11px",
            padding:"1px 7px",background:"none",
            border:`1px solid ${CLR.border}`,color:CLR.dim,
            borderRadius:"3px",cursor:"pointer",marginLeft:"2px"});
        zoomOut.textContent="−";
        zoomOut.addEventListener("click",(e)=>{
            e.stopPropagation();
            this.zoomLevel=Math.max(this.zoomLevel/1.25,0.2);
            this.applyTransform();
        });
        bar.appendChild(zoomOut);

        const zoomDisplay = mk("span",{
            fontFamily:"'Segoe UI',sans-serif",fontSize:"8px",
            color:CLR.dim,marginLeft:"4px",minWidth:"28px",
            textAlign:"center",
        });
        zoomDisplay.id="zoom-display";
        zoomDisplay.textContent="100%";
        bar.appendChild(zoomDisplay);

        // Reset button
        const resetBtn=mk("button",{fontFamily:"'Segoe UI',sans-serif",fontSize:"8px",
            padding:"2px 8px",background:"none",
            border:`1px solid ${CLR.border}`,color:CLR.dim,
            borderRadius:"3px",cursor:"pointer",marginLeft:"4px"});
        resetBtn.textContent="⊙ reset";
        resetBtn.addEventListener("click",(e)=>{
            e.stopPropagation();
            this.panX=0; this.panY=0; this.zoomLevel=1.0; this.rotation=0;
            this.applyTransform();
            this.drawCompassRotated();
        });
        bar.appendChild(resetBtn);
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
        this.fmtSettings=this.fmtSvc.populateFormattingSettingsModel(
            VisualFormattingSettingsModel, options.dataViews[0]);

        this.vpW=options.viewport.width;
        this.vpH=options.viewport.height-28;
        this.svg.setAttribute("viewBox",`0 0 ${this.vpW} ${this.vpH}`);

        try { this.rules=JSON.parse(this.fmtSettings.reglaColorCard.reglasJson.value||"[]"); }
        catch { this.rules=[]; }
        this.rules=this.rules.map(r=>({...r,id:r.id||uid()}));
        this.editor.load(this.rules);

        this.fallback  =this.fmtSettings.generalCard.colorFallback.value.value||"#52626a";
        this.showLabel =this.fmtSettings.generalCard.mostrarEtiqueta.value;
        this.showValue =this.fmtSettings.generalCard.mostrarValor.value;

        const dv=options.dataViews?.[0];
        if(!dv?.categorical?.categories?.length){ this.drawEmpty(); return; }

        const cats=dv.categorical.categories;
        const vals=dv.categorical.values||[];
        const ri: Record<string,number>={};
        cats.forEach((c,i)=>{ if(c.source.roles) Object.keys(c.source.roles).forEach(r=>ri[r]=i); });
        const vi: Record<string,number>={};
        vals.forEach((v,i)=>{ if(v.source.roles) Object.keys(v.source.roles).forEach(r=>vi[r]=i); });
        this.fieldNames={};
        cats.forEach(c=>{ if(c.source.roles) Object.keys(c.source.roles).forEach(r=>this.fieldNames[r]=c.source.displayName); });
        vals.forEach(v=>{ if(v.source.roles) Object.keys(v.source.roles).forEach(r=>this.fieldNames[r]=v.source.displayName); });

        const n=cats[0]?.values?.length||0;
        this.objects=[];
        for(let i=0;i<n;i++){
            const gid =(role:string)=>ri[role]!==undefined?String(cats[ri[role]].values[i]??""):undefined;
            const gval=(role:string)=>vi[role]!==undefined?Number(vals[vi[role]].values[i]??undefined):undefined;
            const id=gid("invernadero")||String(i);
            this.objects.push({
                id, label:gid("etiqueta")||id,
                valorPrincipal:gval("valorPrincipal"),
                campoTexto1:gid("campoTexto1"), campoTexto2:gid("campoTexto2"),
                valor2:gval("valor2"), valor3:gval("valor3"), tooltipExtra:gval("tooltipExtra"),
                layoutX: ri["layoutX"] !== undefined ? parseFloat(String(cats[ri["layoutX"]].values[i] ?? "0")) : undefined,
                layoutY: ri["layoutY"] !== undefined ? parseFloat(String(cats[ri["layoutY"]].values[i] ?? "0")) : undefined,
                layoutW: ri["layoutW"] !== undefined ? parseFloat(String(cats[ri["layoutW"]].values[i] ?? "22")) : undefined,
                layoutH: ri["layoutH"] !== undefined ? parseFloat(String(cats[ri["layoutH"]].values[i] ?? "46")) : undefined,
                selectionId:this.host.createSelectionIdBuilder()
                    .withCategory(cats[ri["invernadero"]??0],i).createSelectionId(),
            });
        }
        this.draw(); this.drawLegend();
    }

    private draw(): void {
        const W=this.vpW, H=this.vpH;
        clearNode(this.svg);
        this.svg.appendChild(svgEl("rect",{width:String(W),height:String(H),fill:CLR.bg}));
        if(!this.objects.length){ this.drawEmpty(); return; }

        // Block zone backgrounds disabled

        // Transform group for pan/zoom/rotate — reuse across redraws
        let tg = this.svg.getElementById("transform-group") as SVGElement;
        if(!tg){
            tg = svgEl("g",{"id":"transform-group"});
        }
        this.svg.appendChild(tg);
        this.transformGroup = tg;

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

            g.appendChild(svgEl("rect",{
                x:String(cell.x),y:String(cell.y),
                width:String(cell.w),height:String(cell.h),rx:"3",
                fill:hexToRgba(color,dimmed?.04:.12),
                stroke:isSel?CLR.green:dimmed?CLR.border:color+"66",
                "stroke-width":isSel?"2":".8",
            }));

            if(!dimmed&&obj.valorPrincipal!==undefined&&obj.valorPrincipal>0){
                const pct=Math.min(obj.valorPrincipal,100)/100;
                const fh=Math.round((cell.h-2)*pct);
                const fr=svgEl("rect",{
                    x:String(cell.x+1),y:String(cell.y+cell.h-1-fh),
                    width:String(cell.w-2),height:String(fh),rx:"1",
                    fill:hexToRgba(color,.28),
                });
                fr.setAttribute("pointer-events","none");
                g.appendChild(fr);
            }

            if(!dimmed){
                const ab=svgEl("rect",{
                    x:String(cell.x+1),y:String(cell.y+1),
                    width:String(cell.w-2),height:"3",rx:"1",
                    fill:hexToRgba(color,.9),
                });
                ab.setAttribute("pointer-events","none");
                g.appendChild(ab);
            }

            if(this.showLabel){
                const fs=Math.max(7,Math.min(11,cell.w/4));
                const cx=cell.x+cell.w/2, cy=cell.y+cell.h/2+(this.showValue?-3:3);
                const t=svgEl("text",{
                    x:String(cx), y:String(cy),
                    "text-anchor":"middle","font-size":String(fs),
                    "font-family":"Segoe UI,sans-serif","font-weight":"700",
                    fill:dimmed?"#1e2e3a":CLR.text,
                    // Counter-rotate text around its own center to keep it upright
                    "transform":`rotate(${-this.rotation},${cx},${cy})`,
                });
                t.setAttribute("pointer-events","none");
                t.textContent=obj.label.length>7?obj.label.slice(0,6)+"…":obj.label;
                g.appendChild(t);
            }

            if(this.showValue&&obj.valorPrincipal!==undefined&&!dimmed){
                const vcx=cell.x+cell.w/2, vcy=cell.y+cell.h/2+10;
                const vt=svgEl("text",{
                    x:String(vcx),y:String(vcy),
                    "text-anchor":"middle","font-size":"8",
                    "font-family":"Segoe UI,sans-serif",fill:hexToRgba(color,.8),
                    "transform":`rotate(${-this.rotation},${vcx},${vcy})`,
                });
                vt.setAttribute("pointer-events","none");
                vt.textContent=String(Math.round(obj.valorPrincipal));
                g.appendChild(vt);
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
                this.tooltipDiv.appendChild(buildTooltip(obj,color,rl,this.fieldNames));
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

        // Compass fixed on SVG top (outside transform group)
        this.drawCompass(this.vpW, this.vpH);
        // Re-apply transform so zoom/pan/rotate survive redraws
        if(this.transformGroup) this.applyTransform();
        this.drawCompassRotated();
    }

    private drawBlockZones(W: number, H: number): void {
        // Approximate block zones based on La Romana layout
        const srcW = 940, srcH = 480;
        const scale  = Math.min(W/srcW, H/srcH) * 0.96;
        const offX   = (W - srcW*scale)/2;
        const offY   = (H - srcH*scale)/2;
        const sc = (x:number,y:number,w:number,h:number) => ({
            x: x*scale+offX, y: y*scale+offY, w: w*scale, h: h*scale
        });
        const ZONES: {z:{x:number,y:number,w:number,h:number},color:string,label:string}[] = [
            {z:sc(20,12,  11*24+6, 68+20), color:"#00e5a0", label:"BLQ A"},
            {z:sc(78,90,  30*24+6, 68+20), color:"#38bdf8", label:"BLQ B"},
            {z:sc(92,168, 30*24+6, 68+20), color:"#a78bfa", label:"BLQ C"},
            {z:sc(20,262,  4*24+6, 68+20), color:"#f59e0b", label:"BLQ D"},
            {z:sc(174,262,22*24+6, 68+20), color:"#f59e0b", label:"BLQ D"},
            {z:sc(174,342,21*24+6, 68+20), color:"#fb923c", label:"BLQ E"},
        ];
        ZONES.forEach(({z,color,label}) => {
            const bg = this.svgRect(z.x,z.y,z.w,z.h,5,
                `${color}08`,`${color}18`,"0.8");
            this.svg.appendChild(bg);
            const t = this.svgText(z.x+3, z.y+9, label, 7, color, "IBM Plex Mono,monospace","600");
            t.setAttribute("opacity","0.5");
            this.svg.appendChild(t);
        });
        // MUROS area
        const m = sc(126,265,46,68+20);
        this.svg.appendChild(this.svgRect(m.x,m.y,m.w,m.h,3,"#0d0d0d","#1e1e1e","0.7"));
        const mt = this.svgText(m.x+m.w/2, m.y+m.h/2+3,"MUROS",6,"#2a2a2a","Segoe UI,sans-serif","600");
        mt.setAttribute("text-anchor","middle"); this.svg.appendChild(mt);
    }

    private svgRect(x:number,y:number,w:number,h:number,rx:number,
                    fill:string,stroke:string,sw:string): SVGElement {
        return svgEl("rect",{
            x:String(x),y:String(y),width:String(w),height:String(h),rx:String(rx),
            fill,stroke,"stroke-width":sw,
        });
    }

    private svgText(x:number,y:number,text:string,size:number,
                    fill:string,family:string,weight:string): SVGElement {
        const t = svgEl("text",{
            x:String(x),y:String(y),"font-size":String(size),
            "font-family":family,"font-weight":weight,fill,
        });
        t.textContent = text;
        return t;
    }

    private drawCompass(W: number, H: number): void {
        const cx = W - 22, cy = H - 22, r = 16;
        const g = svgEl("g",{"id":"compass-group"});
        g.appendChild(svgEl("circle",{
            cx:String(cx),cy:String(cy),r:String(r),
            fill:CLR.panel,stroke:CLR.border,"stroke-width":"0.7",
        }));
        // North arrow
        g.appendChild(svgEl("polygon",{
            points:`${cx},${cy-10} ${cx+2},${cy-3.5} ${cx},${cy-1} ${cx-2},${cy-3.5}`,
            fill:"#ef4444",
        }));
        // South arrow
        g.appendChild(svgEl("polygon",{
            points:`${cx},${cy+10} ${cx+2},${cy+3.5} ${cx},${cy+1} ${cx-2},${cy+3.5}`,
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
                    // Toggle off — clear filter
                    this.legendFilter=null;
                    this.selectedIds.clear();
                    this.selMgr.clear();
                } else {
                    // Apply legend filter
                    this.legendFilter=r.label;
                    this.selectedIds.clear();
                    // Find all objects matching this rule
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

        // Clear button when legend filter is active
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
            clrBtn.textContent="✕ limpiar";
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
        // Build transform: center origin, rotate, scale, pan
        const t = [
            `translate(${cx + this.panX},${cy + this.panY})`,
            `scale(${this.zoomLevel})`,
            `rotate(${this.rotation})`,
            `translate(${-cx},${-cy})`,
        ].join(" ");
        this.transformGroup.setAttribute("transform", t);

        // Update rotation button styles
        [0,90,180,270].forEach(deg=>{
            const btn = this.target.querySelector(`#rot-btn-${deg}`) as HTMLElement;
            if(btn){
                btn.style.color        = this.rotation===deg ? CLR.green : CLR.dim;
                btn.style.borderColor  = this.rotation===deg ? CLR.green : CLR.border;
                btn.style.background   = this.rotation===deg ? CLR.glo   : "none";
            }
        });

        // Update zoom level display
        const zd = this.target.querySelector("#zoom-display") as HTMLElement;
        if(zd) zd.textContent = `${Math.round(this.zoomLevel*100)}%`;
    }

    private drawCompassRotated(): void {
        // Update compass to show correct orientation after rotation
        const compassG = this.svg.getElementById("compass-group");
        if(compassG){
            // Rotate compass needle opposite to map rotation so N always points true North
            const needle = compassG.querySelector("polygon");
            if(needle) needle.setAttribute("transform",`rotate(${-this.rotation},0,0)`);
        }
    }

    private positionTip(e: MouseEvent): void {
        const cr=this.wrapper.getBoundingClientRect();
        let tx=e.clientX-cr.left+14, ty=e.clientY-cr.top-10;
        const tw=this.tooltipDiv.offsetWidth||200, th=this.tooltipDiv.offsetHeight||120;
        if(tx+tw>cr.width)  tx=e.clientX-cr.left-tw-14;
        if(ty+th>cr.height) ty=e.clientY-cr.top-th-10;
        this.tooltipDiv.style.left=`${Math.max(0,tx)}px`;
        this.tooltipDiv.style.top=`${Math.max(0,ty)}px`;
    }

    private drawEmpty(): void {
        clearNode(this.svg);
        this.svg.appendChild(svgEl("rect",{width:String(this.vpW),height:String(this.vpH),fill:CLR.bg}));
        const t=svgEl("text",{
            x:String(this.vpW/2),y:String(this.vpH/2),"text-anchor":"middle",
            "font-size":"12","font-family":"Segoe UI,sans-serif",fill:CLR.dim,
        });
        t.textContent="Arrastra el campo Invernadero (ID) al visual";
        this.svg.appendChild(t);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.fmtSvc.buildFormattingModel(this.fmtSettings);
    }
}