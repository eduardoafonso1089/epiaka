"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, CircleMinus, CodeXml, Combine, Copy,
  Crosshair, Focus, FolderUp, Hand, HardDriveDownload, House, ImagePlus, Images, Keyboard,
  Link2, LoaderCircle, ListRestart, Magnet, Maximize2, Menu, MoreHorizontal, MousePointer2,
  PenLine, PenTool, Pencil, Pentagon, Plus, Save, Scissors, Settings2, ShieldCheck, Sparkles,
  Spline, Square, Trash2, Undo2, Redo2, WandSparkles, X, ZoomIn, ZoomOut,
} from "lucide-react";
import type { DrawingTool } from "../drawing/use-drawing-interactions";
import type { VectorTool } from "../commands/editor-shortcuts";
import type { Language } from "../../lib/i18n";
import { getCopy } from "../../lib/i18n";

const demoGuide = {
  pt: ["Selecione a ferramenta Caixa", "Clique na ferramenta destacada para começar."],
  en: ["Select the Box tool", "Click the highlighted tool to begin."],
  fr: ["Sélectionnez l’outil Boîte", "Cliquez sur l’outil mis en évidence pour commencer."],
  es: ["Selecciona la herramienta Caja", "Haz clic en la herramienta resaltada para empezar."],
} as const;

function BrandLockup({ height = 30 }: { height?: number }) {
  return <span className="brand-lockup" role="img" aria-label="Poligome">
    <svg viewBox="0 0 40 40" height={height} aria-hidden="true">
      <path d="M20 2 35 11v18L20 38 5 29V11z" fill="currentColor" />
      <path d="m14 13 12 7-12 7z" fill="var(--surface)" />
    </svg>
    <strong>Poligome</strong>
  </span>;
}

function ToolButton({ title, keyHint, active, disabled, onClick, children, className = "" }: {
  title: string;
  keyHint?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return <button type="button" className={`tool-btn ${active ? "active" : ""} ${className}`} title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick}>
    {children}{keyHint ? <small>{keyHint}</small> : null}
  </button>;
}

export type PreRefactorChromeProps = {
  projectName: string;
  assetsCount: number;
  annotationsCount: number;
  language: Language;
  loading: boolean;
  dirty: boolean;
  hasAsset: boolean;
  hasAssets: boolean;
  imageIndex: number;
  zoom: number;
  tool: DrawingTool;
  vectorTool: VectorTool;
  snapEnabled: boolean;
  canSimplify: boolean;
  canDuplicate: boolean;
  canMerge: boolean;
  canEditPolygon: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  strokePx: number;
  statusMessage: string;
  fileMenuExtras?: ReactNode;
  onHome: () => void;
  onNewProject: () => void;
  onRenameProject: (name: string) => void;
  onDemo: () => void;
  onOpenProject: () => void;
  onImportImages: () => void;
  onSaveProject: () => void;
  onLanguageChange: (language: Language) => void;
  onSamSettings?: () => void;
  onPreferences?: () => void;
  onTool: (tool: DrawingTool) => void;
  onVectorTool: (tool: VectorTool) => void;
  onSimplify: () => void;
  onDuplicate: () => void;
  onMerge: () => void;
  onToggleSnap: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onStrokeChange: (value: number) => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
  onPreviousImage: () => void;
  onNextImage: () => void;
  onOpenImagesPanel?: () => void;
  onOpenRightPanel?: () => void;
};

export function PreRefactorTopbar(props: PreRefactorChromeProps) {
  const copy = getCopy(props.language);
  const [fileOpen, setFileOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.projectName);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(props.projectName), [props.projectName]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setFileOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const saveRename = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== props.projectName) props.onRenameProject(next);
    else setDraft(props.projectName);
  };

  return <header className="topbar">
    <div className="topbar-main">
      <div className="brand-side">
        <button className="mobile" onClick={props.onOpenImagesPanel} aria-label={copy.openImages}><Menu size={19} /></button>
        <span className="brand-static"><BrandLockup height={28} /></span><i />
        <button className="home-return" title={copy.homeHint} aria-label={copy.home} onClick={props.onHome}><House size={15} /><span>{copy.home}</span></button>
        {editing
          ? <input className="project-name-input" value={draft} aria-label={copy.renameProject} maxLength={80} autoFocus onChange={(event) => setDraft(event.target.value)} onBlur={saveRename} onKeyDown={(event) => { if (event.key === "Enter") saveRename(); if (event.key === "Escape") { setDraft(props.projectName); setEditing(false); } }} />
          : <button className="project-name" title={copy.renameProject} onClick={() => { setDraft(props.projectName); setEditing(true); }}><em /><span>{props.projectName}</span><Pencil size={13} /></button>}
      </div>
      <div className="head-actions">
        <button className="new-project-main" disabled={props.loading} title={copy.newProjectHint} onClick={props.onNewProject}><Plus size={15} /><span>{copy.newProject}</span></button>
        <span className={`save ${props.dirty ? "" : "done"}`}>{props.loading ? <LoaderCircle className="spin" size={14} /> : <HardDriveDownload size={14} />}{props.dirty ? copy.saving : copy.saved}</span>
        <button className="sam-connection" onClick={props.onSamSettings}><Link2 size={14} />{copy.activateSam}</button>
        <span className="local-mode" title={copy.localOnlyHint}><ShieldCheck size={14} />{copy.localOnly}</span>
        <a className="source-link" href="https://github.com/eduardoafonso1089/poligome" target="_blank" rel="noreferrer" title={copy.sourceCode}><CodeXml size={14} /><span>{copy.sourceCode}</span></a>
        <button className="mobile" onClick={props.onOpenRightPanel} aria-label={copy.classes}><MoreHorizontal size={19} /></button>
      </div>
    </div>
    <nav className="menubar" aria-label={copy.fileMenu}>
      <div className="menu" ref={menuRef}>
        <button className={`menu-trigger ${fileOpen ? "open" : ""}`} aria-haspopup="menu" aria-expanded={fileOpen} onClick={() => setFileOpen((value) => !value)}>{copy.fileMenu}<ChevronDown size={13} /></button>
        {fileOpen && <div className="project-pop menu-pop" role="menu" aria-label={copy.fileMenu}>
          <div className="project-summary"><span><em />{props.projectName}</span><small>{props.assetsCount} {copy.projectImages} · {props.annotationsCount} {copy.projectAnnotations}</small></div>
          <button role="menuitem" disabled={props.loading} onClick={() => { setFileOpen(false); props.onNewProject(); }}><Plus size={14} /><span><b>{copy.newProject}</b><small>{copy.newProjectHint}</small></span></button>
          <button role="menuitem" disabled={props.loading} onClick={() => { setFileOpen(false); props.onOpenProject(); }}><FolderUp size={14} /><span><b>{copy.openProject}</b><small>{copy.openProjectHint}</small></span></button>
          <button role="menuitem" disabled={props.loading || !props.hasAssets} onClick={() => { setFileOpen(false); props.onSaveProject(); }}><Save size={14} /><span><b>{copy.saveProject}</b><small>{copy.saveProjectHint}</small></span></button>
          <button role="menuitem" onClick={() => { setFileOpen(false); setEditing(true); }}><Pencil size={14} /><span><b>{copy.renameProject}</b><small>{props.projectName}</small></span></button>
          <i className="menu-separator" />
          <p>{copy.exportFormat}</p>
          {props.fileMenuExtras}
          <i className="menu-separator" />
          <button role="menuitem" onClick={() => { setFileOpen(false); props.onPreferences?.(); }}><Settings2 size={14} /><span><b>{copy.preferences}</b><small>{copy.appearance} · {copy.language}</small></span></button>
        </div>}
      </div>
    </nav>
  </header>;
}

export function PreRefactorToolbar(props: PreRefactorChromeProps) {
  const copy = getCopy(props.language);
  const canEdit = props.hasAsset;
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [demoGuideOpen, setDemoGuideOpen] = useState(true);
  const isDemo = props.hasAssets && /^Demo\b/.test(props.projectName);
  useEffect(() => setDemoGuideOpen(true), [props.projectName]);

  return <>
    <div className="tools">
      <div>
        <ToolButton title={copy.select} keyHint="V" disabled={!canEdit} active={props.tool === "select" && !props.vectorTool} onClick={() => props.onTool("select")}><MousePointer2 size={18} /></ToolButton>
        <ToolButton title={copy.pan} keyHint="H" disabled={!canEdit} active={props.tool === "pan" && !props.vectorTool} onClick={() => props.onTool("pan")}><Hand size={18} /></ToolButton>
        <ToolButton title="Guias de coordenadas X/Y" disabled={!canEdit} onClick={() => undefined}><Crosshair size={18} /></ToolButton>
      </div><i />
      <div>
        <ToolButton title={copy.box} keyHint="B" disabled={!canEdit} className={isDemo && demoGuideOpen ? "demo-tutorial-tool-target" : ""} active={props.tool === "box" && !props.vectorTool} onClick={() => props.onTool("box")}><Square size={18} /></ToolButton>
        <ToolButton title={copy.polygon} keyHint="P" disabled={!canEdit} active={props.tool === "polygon" && !props.vectorTool} onClick={() => props.onTool("polygon")}><Pentagon size={18} /></ToolButton>
        <ToolButton title={copy.freehand} keyHint="F" disabled={!canEdit} active={props.tool === "freehand" && !props.vectorTool} onClick={() => props.onTool("freehand")}><PenLine size={18} /></ToolButton>
        <ToolButton title={copy.line} keyHint="L" disabled={!canEdit} active={props.tool === "line" && !props.vectorTool} onClick={() => props.onTool("line")}><Spline size={18} /></ToolButton>
        <ToolButton title={copy.point} keyHint="K" disabled={!canEdit} active={props.tool === "point" && !props.vectorTool} onClick={() => props.onTool("point")}><span className="point-icon" /></ToolButton>
        <ToolButton title={copy.sam} keyHint="S" disabled={!canEdit} onClick={props.onSamSettings}><WandSparkles size={18} /></ToolButton>
      </div><i />
      <div className="edit-tools">
        <ToolButton title={copy.simplify} disabled={!props.canSimplify} onClick={props.onSimplify}><ListRestart size={18} /></ToolButton>
        <ToolButton title={copy.duplicate} disabled={!props.canDuplicate} onClick={props.onDuplicate}><Copy size={17} /></ToolButton>
        <ToolButton title={copy.merge} disabled={!props.canMerge} onClick={props.onMerge}><Combine size={18} /></ToolButton>
        <ToolButton title="Adicionar buraco ao polígono (O)" keyHint="O" disabled={!props.canEditPolygon} active={props.vectorTool === "hole"} onClick={() => props.onVectorTool("hole")}><CircleMinus size={17} /></ToolButton>
        <ToolButton title={copy.split} disabled={!props.canEditPolygon} active={props.vectorTool === "split"} onClick={() => props.onVectorTool("split")}><Scissors size={17} /></ToolButton>
        <ToolButton title={copy.transform} keyHint="T" disabled={!props.canEditPolygon} active={props.vectorTool === "transform"} onClick={() => props.onVectorTool("transform")}><Maximize2 size={17} /></ToolButton>
        <ToolButton title={copy.reshape} keyHint="R" disabled={!props.canEditPolygon} active={props.vectorTool === "reshape"} onClick={() => props.onVectorTool("reshape")}><PenTool size={17} /></ToolButton>
        <ToolButton title={props.snapEnabled ? copy.snapOn : copy.snapOff} disabled={!canEdit} active={props.snapEnabled} onClick={props.onToggleSnap}><Magnet size={17} /></ToolButton>
      </div><i />
      <div>
        <ToolButton title={copy.undo} disabled={!props.canUndo} onClick={props.onUndo}><Undo2 size={18} /></ToolButton>
        <ToolButton title={copy.redo} disabled={!props.canRedo} onClick={props.onRedo}><Redo2 size={18} /></ToolButton>
        <ToolButton title={copy.deleteShape} disabled={!props.hasSelection} onClick={props.onDelete}><Trash2 size={18} /></ToolButton>
      </div>
      <span className="spacer" />
      <label className={`stroke-control ${!canEdit ? "disabled" : ""}`} title={copy.lineThickness}><PenLine size={14} /><input aria-label={copy.lineThickness} disabled={!canEdit} type="range" min="1" max="10" step="1" value={props.strokePx} onChange={(event) => props.onStrokeChange(Number(event.target.value))} /><output>{props.strokePx}px</output></label>
      <div className="zoom"><button aria-label={copy.zoomOut} disabled={!canEdit} onClick={props.onZoomOut}><ZoomOut size={15} /></button><span>{Math.round(props.zoom)}%</span><button aria-label={copy.zoomIn} disabled={!canEdit} onClick={props.onZoomIn}><ZoomIn size={15} /></button></div>
      <ToolButton title={copy.fitImage} disabled={!canEdit} onClick={props.onFit}><Focus size={16} /></ToolButton>
      <ToolButton title={copy.removeLoadedAnnotations} disabled={!props.annotationsCount} onClick={() => undefined}><Trash2 size={16} /></ToolButton>
      <ToolButton title={copy.shortcuts} onClick={() => setTutorialOpen(true)}><Keyboard size={16} /></ToolButton>
    </div>

    {canEdit && <div className="drawing-actions"><button onClick={() => undefined}><Combine size={14} />Selecionar várias</button><button disabled={!props.hasSelection} onClick={props.onDelete}><Trash2 size={14} />Excluir</button></div>}

    {!props.hasAssets && <div className="pre-refactor-empty-overlay">
      <div className="pre-refactor-empty-card">
        <span><Images size={30} /></span>
        <h2>{copy.emptyProjectTitle}</h2>
        <p>{copy.emptyProjectHint}</p>
        <div><button disabled={props.loading} onClick={props.onImportImages}><ImagePlus size={16} />{copy.importImages}</button><button disabled={props.loading} onClick={props.onOpenProject}><FolderUp size={16} />{copy.openProject}</button></div>
        <small>{copy.privacy}</small>
      </div>
    </div>}

    {isDemo && demoGuideOpen && <section className="demo-tutorial-card pre-refactor-demo-card" role="dialog" aria-live="polite">
      <span>1 / 3</span><button className="pre-refactor-demo-close" aria-label={copy.close} onClick={() => setDemoGuideOpen(false)}><X size={15} /></button>
      <h2>{demoGuide[props.language][0]}</h2><p>{demoGuide[props.language][1]}</p>
    </section>}

    {tutorialOpen && <div className="modal-backdrop"><section className="sam-modal tutorial-modal" role="dialog" aria-modal="true" aria-label={copy.shortcuts}>
      <header><div><span><Keyboard size={18} /></span><div><h2>{copy.shortcuts}</h2><p>{copy.quickTip}</p></div></div><button onClick={() => setTutorialOpen(false)} aria-label={copy.close}><X size={19} /></button></header>
      <div className="tutorial-grid"><section><ImagePlus size={16} /><div><b>{copy.importImages}</b><p>{copy.rasterImportHint}</p></div></section><section><Hand size={16} /><div><b>{copy.pan}</b><p>{copy.middlePan}</p></div></section><section><MousePointer2 size={16} /><div><b>{copy.select}</b><p>{copy.polygonTipDetail}</p></div></section><section><Pentagon size={16} /><div><b>{copy.polygon}</b><p>{copy.polygonFinish}</p></div></section></div>
      <footer><button className="connect" onClick={() => setTutorialOpen(false)}><CheckIcon />{copy.close}</button></footer>
    </section></div>}
  </>;
}

function CheckIcon() { return <span aria-hidden="true">✓</span>; }

export function PreRefactorStatus(props: PreRefactorChromeProps) {
  return <div className="status">
    <div><button onClick={props.onPreviousImage} disabled={props.imageIndex <= 0}><ChevronLeft size={16} /></button><span><b>{props.hasAsset ? props.imageIndex + 1 : 0}</b> / {props.assetsCount}</span><button onClick={props.onNextImage} disabled={props.imageIndex < 0 || props.imageIndex >= props.assetsCount - 1}><ChevronRight size={16} /></button></div>
    <p><Sparkles size={14} /><span>{props.statusMessage}</span></p>
  </div>;
}
