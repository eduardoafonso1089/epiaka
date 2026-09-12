"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Asset, Label } from "../../lib/types";
import { getCopy } from "../../lib/i18n";
import type { EditorAnnotation } from "../models/annotation-model";
import type { BoxCorner } from "../layers/box-layer";
import { createEditorDemo, openEditorProject, saveEditorProject } from "../session/editor-session-io";
import { loadLocalImageAssets } from "../session/image-assets";
import { CocoImportControl } from "../import/coco-import-control";
import { RasterImportControl, type RasterImportResult } from "../import/raster-import-control";
import { ExportControls } from "../export/export-controls";
import { useEditorState } from "../state/use-editor-state";
import { useCanvasInteractions } from "../interactions/use-canvas-interactions";
import { EditorCanvas } from "../canvas/editor-canvas";
import { DrawingDraftLayer } from "../drawing/drawing-draft-layer";
import { useDrawingInteractions, type DrawingTool } from "../drawing/use-drawing-interactions";
import { useEditorViewport } from "../viewport/use-editor-viewport";
import { useTouchNavigation } from "../viewport/use-touch-navigation";
import { screenPixelsToImageUnits } from "../viewport/svg-image-space";
import { CogTiledLayer } from "../raster/cog-tiled-layer";

const EMPTY_LABELS: Label[] = [{ id: "unlabeled", name: "Sem label", color: "#929a95", key: "" }];
const TOOLS: Array<{ id: DrawingTool; label: string }> = [
  { id: "select", label: "Selecionar" },
  { id: "pan", label: "Mão" },
  { id: "box", label: "Caixa" },
  { id: "polygon", label: "Polígono" },
  { id: "line", label: "Linha" },
  { id: "point", label: "Ponto" },
  { id: "freehand", label: "Livre" },
];

export function CanonicalEditorWorkbench() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [labels, setLabels] = useState<Label[]>(EMPTY_LABELS);
  const [activeLabel, setActiveLabel] = useState(EMPTY_LABELS[0].id);
  const [tool, setTool] = useState<DrawingTool>("select");
  const [current, setCurrent] = useState("");
  const [projectName, setProjectName] = useState("Poligome V4");
  const [loading, setLoading] = useState(false);
  const [sessionDirty, setSessionDirty] = useState(false);
  const [message, setMessage] = useState("Carregue o demo, abra um .plgm V4, adicione imagens ou importe GeoTIFF/COG.");
  const objectUrls = useRef<string[]>([]);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);
  const editor = useEditorState();
  const asset = assets.find((item) => item.id === current) ?? assets[0] ?? null;
  const imageSize = { width: asset?.width ?? 1, height: asset?.height ?? 1 };
  const viewport = useEditorViewport({ image: imageSize, initialZoom: 92 });

  const makeId = useCallback((prefix: string) => {
    idCounter.current += 1;
    const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    return `${prefix}-${random}-${idCounter.current}`;
  }, []);

  const interactions = useCanvasInteractions({ svgRef: viewport.canvasRef, imageSize, state: editor.state, dispatch: editor.dispatch, makeId, activeAssetId: current || null });
  const drawing = useDrawingInteractions({ svgRef: viewport.canvasRef, imageSize, tool, assetId: current || null, labelId: activeLabel, makeId, addAnnotation: editor.addAnnotation });
  const touch = useTouchNavigation({
    tool,
    zoom: viewport.state.zoom,
    panBy: viewport.panBy,
    pinchPan: viewport.pinchPan,
    cancelEditing: interactions.cancel,
    cancelDrawing: drawing.cancelDraft,
  });

  const replaceObjectUrls = useCallback((next: string[]) => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = next;
  }, []);
  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const visibleAnnotations = useMemo(() => asset ? editor.annotations.filter((annotation) => annotation.asset === asset.id) : [], [asset, editor.annotations]);
  const selectedIds = editor.selection.multiSelected.length ? editor.selection.multiSelected : editor.selection.selected ? [editor.selection.selected] : [];
  const activeColor = labels.find((label) => label.id === activeLabel)?.color ?? "#929a95";
  const projectDirty = sessionDirty || !editor.saved;

  function resetInteractionState() {
    setTool("select");
    drawing.cancelDraft();
    editor.dispatch({ type: "clear-selection" });
    viewport.zoomTo(92);
  }

  async function loadDemo() {
    setLoading(true);
    try {
      const demo = await createEditorDemo("pt");
      replaceObjectUrls(demo.objectUrls);
      setAssets(demo.assets);
      setLabels(demo.labels);
      setActiveLabel(demo.labels[0]?.id ?? EMPTY_LABELS[0].id);
      setCurrent(demo.assets[0]?.id ?? "");
      setProjectName(demo.name);
      editor.replaceAnnotations(demo.annotations, true);
      setSessionDirty(false);
      resetInteractionState();
      setMessage("Demo carregado em coordenadas de pixel da imagem.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar demo.");
    } finally {
      setLoading(false);
    }
  }

  async function openProject(file: File) {
    setLoading(true);
    try {
      const loaded = await openEditorProject(file, getCopy("pt"));
      replaceObjectUrls(loaded.objectUrls);
      setAssets(loaded.assets);
      setLabels(loaded.labels);
      setActiveLabel((loaded.labels[0] ?? EMPTY_LABELS[0]).id);
      setCurrent(loaded.assets.find((item) => !item.missing)?.id ?? loaded.assets[0]?.id ?? "");
      setProjectName(loaded.projectName);
      editor.replaceAnnotations(loaded.annotations, true);
      setSessionDirty(false);
      resetInteractionState();
      setMessage(loaded.missingImages ? `Projeto V4 aberto. ${loaded.missingImages} imagem(ns) ausente(s).` : `Projeto V4 aberto: ${file.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao abrir projeto V4.");
    } finally {
      setLoading(false);
    }
  }

  async function addImages(files: File[]) {
    if (!files.length) return;
    setLoading(true);
    try {
      const loaded = await loadLocalImageAssets(files, makeId);
      objectUrls.current.push(...loaded.objectUrls);
      if (loaded.assets.length) {
        setAssets((items) => [...items, ...loaded.assets]);
        if (!current) setCurrent(loaded.assets[0].id);
        setSessionDirty(true);
      }
      setMessage(`${loaded.assets.length} imagem(ns) adicionada(s)${loaded.rejected.length ? `; ${loaded.rejected.length} rejeitada(s)` : ""}.`);
    } finally {
      setLoading(false);
    }
  }

  function applyRasterImport(result: RasterImportResult) {
    if (result.objectUrl) objectUrls.current.push(result.objectUrl);
    setAssets((items) => [...items, result.asset]);
    setCurrent(result.asset.id);
    setSessionDirty(true);
    setMessage(result.message);
    resetInteractionState();
  }

  function applyCocoImport(result: { labels: Label[]; annotations: EditorAnnotation[]; message: string }) {
    setLabels(result.labels);
    if (!result.labels.some((label) => label.id === activeLabel)) setActiveLabel(result.labels[0]?.id ?? EMPTY_LABELS[0].id);
    editor.replaceAnnotations(result.annotations, false);
    setSessionDirty(true);
    setMessage(result.message);
    drawing.cancelDraft();
    setTool("select");
  }

  function chooseTool(next: DrawingTool) {
    if (next !== tool) drawing.cancelDraft();
    setTool(next);
    if (next !== "select") editor.dispatch({ type: "clear-selection" });
  }

  function stepImage(delta: number) {
    if (!asset || !assets.length) return;
    const index = assets.findIndex((item) => item.id === asset.id);
    const next = Math.max(0, Math.min(assets.length - 1, index + delta));
    drawing.cancelDraft();
    setCurrent(assets[next].id);
    editor.dispatch({ type: "clear-selection" });
  }

  async function saveProject() {
    if (!assets.length) return;
    setLoading(true);
    try {
      const name = await saveEditorProject(projectName, assets, labels, editor.annotations, "complete", getCopy("pt"));
      editor.markSaved();
      setSessionDirty(false);
      setMessage(`Projeto V4 salvo: ${name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar projeto.");
    } finally {
      setLoading(false);
    }
  }

  const noopElement = useCallback((_event: ReactPointerEvent<SVGElement>) => undefined, []);
  const noopAnnotation = useCallback((_event: ReactPointerEvent<SVGElement>, _annotation: EditorAnnotation) => undefined, []);
  const noopVertex = useCallback((_event: ReactPointerEvent<SVGElement>, _annotation: EditorAnnotation, _id: string) => undefined, []);
  const noopInsert = useCallback((_event: ReactPointerEvent<SVGElement>, _annotation: EditorAnnotation, _id: string, _x: number, _y: number) => undefined, []);
  const noopResize = useCallback((_event: ReactPointerEvent<SVGElement>, _annotation: EditorAnnotation, _corner: BoxCorner) => undefined, []);

  const imageIndex = asset ? assets.findIndex((item) => item.id === asset.id) : -1;
  const selecting = tool === "select";
  const panning = tool === "pan";
  const markerRadius = screenPixelsToImageUnits(4.6, imageSize, viewport.layout.width);
  const lineThickness = screenPixelsToImageUnits(3, imageSize, viewport.layout.width);
  const touchRadius = screenPixelsToImageUnits(22, imageSize, viewport.layout.width);
  const boxTouchRadius = screenPixelsToImageUnits(28, imageSize, viewport.layout.width);
  const boxRotationTouchRadius = screenPixelsToImageUnits(20, imageSize, viewport.layout.width);
  const canvasCursor = panning ? (touch.navigating ? "grabbing" : "grab") : selecting ? "default" : "crosshair";

  return <main style={{ minHeight: "100vh", background: "#111315", color: "#f4f5f5", padding: 16, fontFamily: "system-ui, sans-serif" }}>
    <input ref={projectInputRef} type="file" accept=".plgm,application/vnd.poligome.project+zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void openProject(file); event.currentTarget.value = ""; }} />
    <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/gif" multiple hidden onChange={(event) => { void addImages(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />

    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <strong style={{ marginRight: 8 }}>Poligome · editor canônico</strong>
        <button onClick={() => void loadDemo()} disabled={loading}>Demo</button>
        <button onClick={() => projectInputRef.current?.click()} disabled={loading}>Abrir V4</button>
        <button onClick={() => imageInputRef.current?.click()} disabled={loading}>Adicionar imagens</button>
        <RasterImportControl makeId={makeId} disabled={loading} onImported={applyRasterImport} onMessage={setMessage} />
        <CocoImportControl assets={assets} labels={labels} annotations={editor.annotations} makeId={makeId} disabled={loading} onImported={applyCocoImport} />
        <ExportControls assets={assets} labels={labels} annotations={editor.annotations} disabled={loading} onMessage={setMessage} />
        <button onClick={() => editor.undo()} disabled={!editor.history.length}>Desfazer</button>
        <button onClick={() => editor.redo()} disabled={!editor.redoHistory.length}>Refazer</button>
        <button onClick={saveProject} disabled={loading || !assets.length}>Salvar .plgm V4</button>
        <button onClick={() => stepImage(-1)} disabled={imageIndex <= 0}>← Imagem</button>
        <button onClick={() => stepImage(1)} disabled={imageIndex < 0 || imageIndex >= assets.length - 1}>Imagem →</button>
        <span style={{ opacity: .7, marginLeft: "auto" }}>{asset ? `${imageIndex + 1}/${assets.length} · ${visibleAnnotations.length} anotações` : "sem imagem"}</span>
      </header>

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        {TOOLS.map((entry) => <button key={entry.id} onClick={() => chooseTool(entry.id)} aria-pressed={tool === entry.id} style={{ fontWeight: tool === entry.id ? 700 : 400 }}>{entry.label}</button>)}
        <select value={activeLabel} onChange={(event) => setActiveLabel(event.target.value)} disabled={!labels.length}>{labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select>
        {(tool === "polygon" || tool === "line") && drawing.draft && <><button onClick={() => drawing.finishDraft()} disabled={!drawing.canFinish}>Concluir forma</button><button onClick={drawing.cancelDraft}>Cancelar</button></>}
        <span style={{ marginLeft: 8 }} />
        <button onClick={() => viewport.zoomBy(-10)} disabled={!asset}>−</button>
        <button onClick={() => viewport.zoomTo(92)} disabled={!asset}>{viewport.state.zoom}%</button>
        <button onClick={() => viewport.zoomBy(10)} disabled={!asset}>+</button>
      </div>

      <div style={{ fontSize: 13, opacity: .75, marginBottom: 8 }}>
        {message} <span style={{ opacity: .7 }}>{touch.touchMode ? "Dois dedos: zoom e pan. Mão: pan com um dedo." : "Ctrl/⌘ + roda ajusta o zoom no cursor."}</span>
      </div>

      <section ref={viewport.scrollRef} onScroll={viewport.onScroll} onWheel={viewport.onWheel} style={{ position: "relative", width: "100%", height: "72vh", minHeight: 360, margin: "0 auto", background: "#080909", overflow: "auto", border: "1px solid #34383b", borderRadius: 8, overscrollBehavior: "contain" }}>
        <div style={{ position: "relative", width: viewport.layout.surfaceWidth, height: viewport.layout.surfaceHeight }}>
          <div style={{ position: "absolute", left: viewport.layout.left, top: viewport.layout.top, width: viewport.layout.width, height: viewport.layout.height }}>
            {asset?.raster?.mode === "tiled" ? <CogTiledLayer asset={asset} viewport={viewport.state} layout={viewport.layout} onError={setMessage} />
              : asset?.src ? <img src={asset.src} alt={asset.name} draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", userSelect: "none", pointerEvents: "none" }} />
              : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: .55 }}>{asset?.missing ? "Imagem ausente" : "Nenhuma imagem carregada"}</div>}
            {asset && !asset.missing && <EditorCanvas
              imageSize={imageSize}
              svgRef={viewport.canvasRef}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", cursor: canvasCursor }}
              annotations={visibleAnnotations}
              labels={labels}
              tool={tool}
              selectedId={editor.selection.selected}
              selectedIds={selectedIds}
              selectedVertex={editor.selectedVertex}
              selectionMarquee={interactions.selectionMarquee}
              overlay={<DrawingDraftLayer draft={drawing.draft} color={activeColor} lineThickness={lineThickness} />}
              lineThickness={lineThickness}
              touchMode={touch.touchMode}
              touchRadius={touchRadius}
              markerRadius={markerRadius}
              markerAspect={1}
              boxTouchRadius={boxTouchRadius}
              boxRotationTouchRadius={boxRotationTouchRadius}
              onPointerDownCapture={touch.onPointerDownCapture}
              onPointerMoveCapture={touch.onPointerMoveCapture}
              onPointerUpCapture={touch.onPointerUpCapture}
              onPointerCancelCapture={touch.onPointerCancelCapture}
              onPointerDown={selecting ? interactions.selectAtCanvas : drawing.onPointerDown}
              onPointerMove={selecting ? interactions.moveCanvasSelection : drawing.onPointerMove}
              onPointerUp={selecting ? interactions.finishCanvasSelection : drawing.onPointerUp}
              onPointerCancel={selecting ? interactions.cancel : drawing.cancelDraft}
              onBeginAnnotationDrag={selecting ? interactions.beginAnnotationDrag : noopAnnotation}
              onMoveAnnotation={selecting ? interactions.moveAnnotation : noopElement}
              onFinishAnnotation={selecting ? interactions.finishAnnotation : noopElement}
              onBeginVertexDrag={selecting ? interactions.beginVertexDrag : noopVertex}
              onMoveVertex={selecting ? interactions.moveVertex : noopElement}
              onFinishVertex={selecting ? interactions.finishVertex : noopElement}
              onInsertVertex={selecting ? interactions.insertVertex : noopInsert}
              onResizeStart={selecting ? interactions.resizeStart : noopResize}
              onResizeMove={selecting ? interactions.resizeMove : noopElement}
              onResizeEnd={selecting ? interactions.resizeEnd : noopElement}
              onRotateStart={selecting ? interactions.rotateStart : noopAnnotation}
              onTransformMove={selecting ? interactions.transformMove : noopElement}
              onTransformEnd={selecting ? interactions.transformEnd : noopElement}
            />}
          </div>
        </div>
      </section>

      <footer style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, opacity: .65, flexWrap: "wrap" }}>
        <span>Ferramenta: {tool}</span>
        <span>Zoom: {viewport.state.zoom}%</span>
        <span>Coordenadas: pixels da imagem</span>
        <span>Formato interno: EditorAnnotation[]</span>
        <span>Projeto: .plgm V4</span>
        <span>Vértices: IDs estáveis</span>
        {asset?.raster?.mode === "tiled" && <span>Raster: COG tiled</span>}
        <span>{projectDirty ? "alterado" : "salvo"}</span>
      </footer>
    </div>
  </main>;
}
