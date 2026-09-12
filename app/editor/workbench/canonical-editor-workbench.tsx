"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Asset, Label } from "../../lib/types";
import { getCopy, storedLanguage, storedTheme, type Language } from "../../lib/i18n";
import type { EditorAnnotation } from "../models/annotation-model";
import type { BoxCorner } from "../layers/box-layer";
import { createEditorDemo, openEditorProject, saveEditorProject } from "../session/editor-session-io";
import { loadLocalImageAssets, relinkMissingAssets } from "../session/image-assets";
import { CocoImportControl } from "../import/coco-import-control";
import { RasterImportControl, type RasterImportResult } from "../import/raster-import-control";
import { ExportControls } from "../export/export-controls";
import { useEditorState } from "../state/use-editor-state";
import { useCanvasInteractions } from "../interactions/use-canvas-interactions";
import { useAdvancedVectorInteractions, type AdvancedVectorResult } from "../interactions/use-advanced-vector-interactions";
import { EditorCanvas } from "../canvas/editor-canvas";
import { DrawingDraftLayer } from "../drawing/drawing-draft-layer";
import { useDrawingInteractions, type DrawingTool } from "../drawing/use-drawing-interactions";
import { AdvancedVectorDraftLayer } from "../layers/advanced-vector-draft-layer";
import { useEditorViewport } from "../viewport/use-editor-viewport";
import { useTouchNavigation } from "../viewport/use-touch-navigation";
import { screenPixelsToImageUnits } from "../viewport/svg-image-space";
import { CogTiledLayer } from "../raster/cog-tiled-layer";
import { demoRouteTarget } from "../session/demo-route";
import { QualityReviewPanel } from "../review/quality-review-panel";
import { setAssetReviewScore, setLabelReviewScore } from "../review/quality-review-model";
import { EditorManagementPanels } from "../panels/editor-management-panels";
import { createLabel as createPanelLabel, moveItemById, recolorLabel, renameLabel, UNLABELED_ID } from "../panels/panel-model";
import { selectRange } from "../selection/selection-model";
import { commandFromKeyboard, isEditableShortcutTarget, type VectorTool } from "../commands/editor-shortcuts";
import { simplifyPolygonAnnotation, unionPolygonAnnotations } from "../geometry/vector-operations";
import { VectorToolbar } from "../vector/vector-toolbar";

const EMPTY_LABELS: Label[] = [{ id: UNLABELED_ID, name: "Sem label", color: "#929a95", key: "" }];

export function CanonicalEditorWorkbench() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [labels, setLabels] = useState<Label[]>(EMPTY_LABELS);
  const [activeLabel, setActiveLabel] = useState(EMPTY_LABELS[0].id);
  const [tool, setTool] = useState<DrawingTool>("select");
  const [vectorTool, setVectorTool] = useState<VectorTool>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [current, setCurrent] = useState("");
  const [projectName, setProjectName] = useState("Poligome V4");
  const [language, setLanguage] = useState<Language>("pt");
  const [saveMode, setSaveMode] = useState<"annotations" | "complete">("complete");
  const [reviewMode, setReviewMode] = useState<"quality" | "review">("quality");
  const [hiddenAnnotationIds, setHiddenAnnotationIds] = useState<Set<string>>(() => new Set());
  const [hiddenLabelIds, setHiddenLabelIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [sessionDirty, setSessionDirty] = useState(false);
  const [message, setMessage] = useState("");
  const objectUrls = useRef<string[]>([]);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const relinkInputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);
  const demoQueryHandled = useRef(false);
  const editor = useEditorState();
  const copy = getCopy(language);
  const tools: Array<{ id: DrawingTool; label: string }> = [
    { id: "select", label: copy.select },
    { id: "pan", label: copy.pan },
    { id: "box", label: copy.box },
    { id: "polygon", label: copy.polygon },
    { id: "line", label: copy.line },
    { id: "point", label: copy.point },
    { id: "freehand", label: copy.freehand },
  ];
  const asset = assets.find((item) => item.id === current) ?? assets[0] ?? null;
  const imageSize = { width: asset?.width ?? 1, height: asset?.height ?? 1 };
  const viewport = useEditorViewport({ image: imageSize, initialZoom: 92 });

  const makeId = useCallback((prefix: string) => {
    idCounter.current += 1;
    const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    return `${prefix}-${random}-${idCounter.current}`;
  }, []);

  const activeAssetAnnotations = useMemo(
    () => asset ? editor.annotations.filter((annotation) => annotation.asset === asset.id) : [],
    [asset, editor.annotations],
  );
  const visibleAnnotations = useMemo(
    () => activeAssetAnnotations.filter((annotation) => !hiddenAnnotationIds.has(annotation.id) && !hiddenLabelIds.has(annotation.label)),
    [activeAssetAnnotations, hiddenAnnotationIds, hiddenLabelIds],
  );
  const selectedIds = editor.selection.multiSelected.length ? editor.selection.multiSelected : editor.selection.selected ? [editor.selection.selected] : [];
  const selectedPolygons = useMemo(
    () => editor.annotations.filter((annotation): annotation is Extract<EditorAnnotation, { type: "polygon" }> => selectedIds.includes(annotation.id) && annotation.type === "polygon" && annotation.asset === asset?.id),
    [asset?.id, editor.annotations, selectedIds],
  );
  const activePolygon = editor.selectedAnnotation?.type === "polygon" && editor.selectedAnnotation.asset === asset?.id ? editor.selectedAnnotation : null;
  const activeColor = labels.find((label) => label.id === activeLabel)?.color ?? "#929a95";
  const projectDirty = sessionDirty || !editor.saved;
  const missingImageCount = assets.filter((item) => item.missing).length;
  const snapTolerance = screenPixelsToImageUnits(13, imageSize, viewport.layout.width);

  const interactions = useCanvasInteractions({
    svgRef: viewport.canvasRef,
    imageSize,
    state: editor.state,
    dispatch: editor.dispatch,
    makeId,
    activeAssetId: current || null,
    snap: { enabled: snapEnabled, tolerance: snapTolerance, annotations: visibleAnnotations },
  });
  const drawing = useDrawingInteractions({ svgRef: viewport.canvasRef, imageSize, tool, assetId: current || null, labelId: activeLabel, makeId, addAnnotation: editor.addAnnotation });

  const vectorResultMessage = useCallback((result: AdvancedVectorResult) => {
    const messages: Record<AdvancedVectorResult, string> = {
      "hole-added": copy.toastReshapeAdded,
      "hole-invalid": copy.toastReshapeCross,
      "split-done": copy.toastSplitDone,
      "split-invalid": copy.toastSplitNeedsCross,
      "reshape-added": copy.toastReshapeAdded,
      "reshape-removed": copy.toastReshapeRemoved,
      "reshape-mixed": copy.toastReshapeMixed,
      "reshape-crossings": copy.toastReshapeCross,
      "reshape-direction": copy.toastReshapeAddDirection,
    };
    setMessage(messages[result]);
  }, [copy]);

  const advanced = useAdvancedVectorInteractions({
    svgRef: viewport.canvasRef,
    imageSize,
    tool: vectorTool,
    activePolygon,
    makeId,
    dispatch: editor.dispatch,
    onResult: vectorResultMessage,
  });

  const touch = useTouchNavigation({
    tool,
    zoom: viewport.state.zoom,
    panBy: viewport.panBy,
    pinchPan: viewport.pinchPan,
    cancelEditing: () => { interactions.cancel(); advanced.cancel(); },
    cancelDrawing: drawing.cancelDraft,
  });

  const replaceObjectUrls = useCallback((next: string[]) => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = next;
  }, []);
  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    const stored = storedLanguage();
    setLanguage(stored);
    setMessage(getCopy(stored).ready);
    document.documentElement.dataset.theme = storedTheme();
  }, []);

  function changeLanguage(next: Language) {
    setLanguage(next);
    localStorage.setItem("poligome-language", next);
    setMessage(getCopy(next).ready);
  }

  function resetInteractionState() {
    setTool("select");
    setVectorTool(null);
    drawing.cancelDraft();
    advanced.cancel();
    editor.dispatch({ type: "clear-selection" });
    viewport.zoomTo(92);
  }

  function resetTransientVisibility() {
    setHiddenAnnotationIds(new Set());
    setHiddenLabelIds(new Set());
  }

  async function loadDemo(requestedLanguage: Language = language) {
    setLoading(true);
    try {
      const demo = await createEditorDemo(requestedLanguage);
      replaceObjectUrls(demo.objectUrls);
      setAssets(demo.assets);
      setLabels(demo.labels);
      setActiveLabel(demo.labels[0]?.id ?? EMPTY_LABELS[0].id);
      setCurrent(demo.assets[0]?.id ?? "");
      setProjectName(demo.name);
      editor.replaceAnnotations(demo.annotations, true);
      resetTransientVisibility();
      setSessionDirty(false);
      resetInteractionState();
      setMessage(copy.demoReady);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.demoError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (demoQueryHandled.current || typeof window === "undefined") return;
    demoQueryHandled.current = true;
    const target = demoRouteTarget(window.location.href);
    if (target === null) return;
    window.history.replaceState(window.history.state, "", target);
    void loadDemo(storedLanguage());
  }, []);

  async function openProject(file: File) {
    setLoading(true);
    try {
      const loaded = await openEditorProject(file, copy);
      replaceObjectUrls(loaded.objectUrls);
      setAssets(loaded.assets);
      setLabels(loaded.labels);
      setActiveLabel((loaded.labels[0] ?? EMPTY_LABELS[0]).id);
      setCurrent(loaded.assets.find((item) => !item.missing)?.id ?? loaded.assets[0]?.id ?? "");
      setProjectName(loaded.projectName);
      editor.replaceAnnotations(loaded.annotations, true);
      resetTransientVisibility();
      setSessionDirty(false);
      resetInteractionState();
      setMessage(`${copy.projectOpened}: ${file.name}${loaded.missingImages ? ` · ${loaded.missingImages} ${copy.projectImagesNeedReload}` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.projectOpenError);
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
      setMessage(`${copy.importImages}: ${loaded.assets.length}${loaded.rejected.length ? ` · ${loaded.rejected.length}` : ""}.`);
    } finally {
      setLoading(false);
    }
  }

  async function relinkProjectImages(files: File[]) {
    if (!files.length || !missingImageCount) return;
    setLoading(true);
    try {
      const result = await relinkMissingAssets(assets, files);
      objectUrls.current.push(...result.objectUrls);
      if (result.restoredIds.length) {
        setAssets(result.assets);
        setSessionDirty(true);
        if (!current || assets.find((item) => item.id === current)?.missing) setCurrent(result.restoredIds[0]);
        setMessage(`${result.restoredIds.length} ${copy.projectImagesRestored}${result.rejected.length ? ` · ${result.rejected.length} ${copy.projectImagesNeedReload}` : ""}`);
      } else {
        setMessage(`${copy.imageMissingHint}${result.rejected.length ? ` · ${result.rejected.length}` : ""}`);
      }
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
    resetTransientVisibility();
    setSessionDirty(true);
    setMessage(result.message);
    drawing.cancelDraft();
    advanced.cancel();
    setVectorTool(null);
    setTool("select");
  }

  function chooseTool(next: DrawingTool) {
    if (next !== tool) drawing.cancelDraft();
    advanced.cancel();
    setVectorTool(null);
    setTool(next);
    if (next !== "select") editor.dispatch({ type: "clear-selection" });
  }

  function chooseVectorTool(next: VectorTool) {
    drawing.cancelDraft();
    interactions.cancel();
    advanced.cancel();
    setTool("select");
    setVectorTool(next);
  }

  function selectAsset(id: string) {
    if (!assets.some((item) => item.id === id)) return;
    drawing.cancelDraft();
    advanced.cancel();
    setVectorTool(null);
    setCurrent(id);
    editor.dispatch({ type: "clear-selection" });
    viewport.zoomTo(92);
  }

  function stepImage(delta: number) {
    if (!asset || !assets.length) return;
    const index = assets.findIndex((item) => item.id === asset.id);
    const next = Math.max(0, Math.min(assets.length - 1, index + delta));
    selectAsset(assets[next].id);
  }

  function moveAsset(id: string, delta: -1 | 1) {
    setAssets((items) => {
      const next = moveItemById(items, id, delta);
      if (next !== items) setSessionDirty(true);
      return next;
    });
  }

  function deleteAsset(id: string) {
    const index = assets.findIndex((item) => item.id === id);
    if (index < 0) return;
    const item = assets[index];
    const annotationIds = editor.annotations.filter((annotation) => annotation.asset === id).map((annotation) => annotation.id);
    if (annotationIds.length) editor.deleteAnnotations(annotationIds);
    const remaining = assets.filter((candidate) => candidate.id !== id);
    setAssets(remaining);
    setHiddenAnnotationIds((currentHidden) => new Set([...currentHidden].filter((annotationId) => !annotationIds.includes(annotationId))));
    if (current === id) {
      setCurrent(remaining[Math.min(index, Math.max(0, remaining.length - 1))]?.id ?? "");
      editor.dispatch({ type: "clear-selection" });
      viewport.zoomTo(92);
    }
    if (item.src.startsWith("blob:")) {
      objectUrls.current = objectUrls.current.filter((url) => url !== item.src);
      URL.revokeObjectURL(item.src);
    }
    setSessionDirty(true);
  }

  function selectAnnotationFromPanel(id: string, modifiers: { shift: boolean; additive: boolean }) {
    if (modifiers.shift) {
      editor.setSelection(selectRange(activeAssetAnnotations, editor.selection, id, modifiers.additive));
      return;
    }
    editor.dispatch({ type: modifiers.additive ? "toggle-selection" : "select-single", id });
  }

  function selectAllActiveAnnotations() {
    const ids = activeAssetAnnotations.map((annotation) => annotation.id);
    editor.setSelection({ selected: ids.at(-1) ?? null, multiSelected: ids, anchorId: ids[0] ?? null });
  }

  function toggleAnnotationVisibility(id: string) {
    setHiddenAnnotationIds((currentHidden) => {
      const next = new Set(currentHidden);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleLabelVisibility(id: string) {
    setHiddenLabelIds((currentHidden) => {
      const next = new Set(currentHidden);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function deleteAnnotations(ids: string[]) {
    if (!ids.length) return;
    editor.deleteAnnotations(ids);
    setHiddenAnnotationIds((currentHidden) => new Set([...currentHidden].filter((id) => !ids.includes(id))));
  }

  function batchReclassify(ids: string[], labelId: string) {
    if (!ids.length || !labels.some((label) => label.id === labelId)) return;
    editor.dispatch({ type: "reclassify-annotations", ids, labelId });
  }

  function createLabel(name: string, color: string) {
    const id = makeId("label");
    const next = createPanelLabel(labels, id, name, color);
    if (next === labels) return;
    setLabels(next);
    setActiveLabel(id);
    setSessionDirty(true);
  }

  function changeLabelName(id: string, name: string) {
    setLabels((items) => {
      const next = renameLabel(items, id, name);
      if (next !== items) setSessionDirty(true);
      return next;
    });
  }

  function changeLabelColor(id: string, color: string) {
    setLabels((items) => {
      const next = recolorLabel(items, id, color);
      if (next !== items) setSessionDirty(true);
      return next;
    });
  }

  function deleteLabel(id: string) {
    if (id === UNLABELED_ID || !labels.some((label) => label.id === id)) return;
    const affected = editor.annotations.filter((annotation) => annotation.label === id).map((annotation) => annotation.id);
    if (affected.length) editor.dispatch({ type: "reclassify-annotations", ids: affected, labelId: UNLABELED_ID });
    setLabels((items) => items.filter((label) => label.id !== id));
    setHiddenLabelIds((currentHidden) => {
      const next = new Set(currentHidden);
      next.delete(id);
      return next;
    });
    if (activeLabel === id) setActiveLabel(UNLABELED_ID);
    setSessionDirty(true);
  }

  function simplifySelected() {
    if (!activePolygon) return;
    const tolerance = screenPixelsToImageUnits(4, imageSize, viewport.layout.width);
    const simplified = simplifyPolygonAnnotation(activePolygon, tolerance);
    if (simplified === activePolygon) return;
    editor.dispatch({ type: "replace-annotation", annotation: simplified });
    setMessage(copy.toastSimplified);
  }

  function mergeSelected() {
    if (selectedPolygons.length < 2) return;
    const sameLabel = selectedPolygons.every((polygon) => polygon.label === selectedPolygons[0].label);
    if (!sameLabel) { setMessage(copy.toastMergeSameClass); return; }
    const merged = unionPolygonAnnotations(selectedPolygons, makeId);
    if (merged.length !== 1) { setMessage(copy.toastMergeFailed); return; }
    editor.dispatch({ type: "replace-annotations-batch", removeIds: selectedPolygons.map((polygon) => polygon.id), annotations: merged, selectIds: merged.map((polygon) => polygon.id) });
    setMessage(copy.toastMerged);
  }

  function reviewAsset(score: number) {
    if (!asset) return;
    setAssets((items) => setAssetReviewScore(items, asset.id, score));
    setSessionDirty(true);
  }

  function reviewLabel(score: number) {
    if (!labels.some((label) => label.id === activeLabel)) return;
    setLabels((items) => setLabelReviewScore(items, activeLabel, score));
    setSessionDirty(true);
  }

  function reviewAnnotation(score: number) {
    if (!editor.selectedAnnotation) return;
    editor.dispatch({ type: "replace-annotation", annotation: { ...editor.selectedAnnotation, reviewScore: score } });
  }

  async function saveProject() {
    if (!assets.length) return;
    setLoading(true);
    try {
      const name = await saveEditorProject(projectName, assets, labels, editor.annotations, saveMode, copy);
      editor.markSaved();
      setSessionDirty(false);
      setMessage(`${copy.projectSaved}: ${name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.projectSaveError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) return;
      const command = commandFromKeyboard(event);
      if (!command) return;
      if (["undo", "redo", "delete", "finish-draft", "escape"].includes(command.type)) event.preventDefault();
      if (command.type === "undo") { editor.undo(); return; }
      if (command.type === "redo") { editor.redo(); return; }
      if (command.type === "delete") {
        if (editor.selectedVertex) editor.dispatch({ type: "delete-vertex", annotationId: editor.selectedVertex.annotationId, vertexId: editor.selectedVertex.vertexId });
        else deleteAnnotations(selectedIds);
        return;
      }
      if (command.type === "finish-draft") {
        if (vectorTool === "hole") advanced.finishHole();
        else drawing.finishDraft();
        return;
      }
      if (command.type === "escape") {
        drawing.cancelDraft(); advanced.cancel(); interactions.cancel(); setVectorTool(null);
        if (tool !== "select") setTool("select"); else editor.dispatch({ type: "clear-selection" });
        return;
      }
      if (command.type === "tool") { if (asset && !asset.missing) chooseTool(command.tool); return; }
      if (command.type === "vector-tool") { if (activePolygon) chooseVectorTool(command.tool); return; }
      if (command.type === "label-key") {
        const label = labels.find((item) => item.key === command.key);
        if (label) setActiveLabel(label.id);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [activePolygon, advanced, asset, drawing, editor, interactions, labels, selectedIds, tool, vectorTool]);

  const noopElement = useCallback((_event: ReactPointerEvent<SVGElement>) => undefined, []);
  const noopAnnotation = useCallback((_event: ReactPointerEvent<SVGElement>, _annotation: EditorAnnotation) => undefined, []);
  const noopVertex = useCallback((_event: ReactPointerEvent<SVGElement>, _annotation: EditorAnnotation, _id: string) => undefined, []);
  const noopInsert = useCallback((_event: ReactPointerEvent<SVGElement>, _annotation: EditorAnnotation, _id: string, _x: number, _y: number) => undefined, []);
  const noopResize = useCallback((_event: ReactPointerEvent<SVGElement>, _annotation: EditorAnnotation, _corner: BoxCorner) => undefined, []);

  const imageIndex = asset ? assets.findIndex((item) => item.id === asset.id) : -1;
  const selecting = tool === "select" && !vectorTool;
  const vectorEditing = Boolean(vectorTool);
  const panning = tool === "pan";
  const markerRadius = screenPixelsToImageUnits(4.6, imageSize, viewport.layout.width);
  const lineThickness = screenPixelsToImageUnits(3, imageSize, viewport.layout.width);
  const touchRadius = screenPixelsToImageUnits(22, imageSize, viewport.layout.width);
  const boxTouchRadius = screenPixelsToImageUnits(28, imageSize, viewport.layout.width);
  const boxRotationTouchRadius = screenPixelsToImageUnits(20, imageSize, viewport.layout.width);
  const canvasCursor = panning ? (touch.navigating ? "grabbing" : "grab") : vectorEditing || !selecting ? "crosshair" : "default";
  const overlay = <>
    <DrawingDraftLayer draft={drawing.draft} color={activeColor} lineThickness={lineThickness} />
    <AdvancedVectorDraftLayer draft={advanced.draft} color={activeColor} lineThickness={lineThickness} />
  </>;

  return <main style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)", padding: 16, fontFamily: "var(--sans), system-ui, sans-serif" }}>
    <input ref={projectInputRef} type="file" accept=".plgm,application/vnd.poligome.project+zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void openProject(file); event.currentTarget.value = ""; }} />
    <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/gif" multiple hidden onChange={(event) => { void addImages(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
    <input ref={relinkInputRef} type="file" accept="image/*,.tif,.tiff" multiple hidden onChange={(event) => { void relinkProjectImages(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />

    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <strong style={{ marginRight: 8 }}>{copy.appTitle}</strong>
        <button onClick={() => void loadDemo()} disabled={loading}>{copy.tryDemo}</button>
        <button onClick={() => projectInputRef.current?.click()} disabled={loading}>{copy.openProject}</button>
        <button onClick={() => imageInputRef.current?.click()} disabled={loading}>{copy.importImages}</button>
        {missingImageCount > 0 && <button onClick={() => relinkInputRef.current?.click()} disabled={loading}>{copy.reloadProjectImages} ({missingImageCount})</button>}
        <RasterImportControl makeId={makeId} language={language} disabled={loading} onImported={applyRasterImport} onMessage={setMessage} />
        <CocoImportControl assets={assets} labels={labels} annotations={editor.annotations} makeId={makeId} language={language} disabled={loading} onImported={applyCocoImport} />
        <ExportControls assets={assets} labels={labels} annotations={editor.annotations} language={language} disabled={loading} onMessage={setMessage} />
        <button onClick={() => editor.undo()} disabled={!editor.history.length}>{copy.undo}</button>
        <button onClick={() => editor.redo()} disabled={!editor.redoHistory.length}>{copy.redo}</button>
        <select aria-label={copy.saveProjectDescription} value={saveMode} onChange={(event) => setSaveMode(event.target.value as "annotations" | "complete")} disabled={loading}>
          <option value="complete">{copy.imagesAndAnnotations}</option>
          <option value="annotations">{copy.annotationsOnly}</option>
        </select>
        <button onClick={saveProject} disabled={loading || !assets.length}>{copy.saveProject}</button>
        <button onClick={() => stepImage(-1)} disabled={imageIndex <= 0}>← {copy.images}</button>
        <button onClick={() => stepImage(1)} disabled={imageIndex < 0 || imageIndex >= assets.length - 1}>{copy.images} →</button>
        <select aria-label={copy.language} value={language} onChange={(event) => changeLanguage(event.target.value as Language)}>
          <option value="pt">PT</option><option value="en">EN</option><option value="fr">FR</option><option value="es">ES</option>
        </select>
        <span style={{ opacity: .7, marginLeft: "auto" }}>{asset ? `${imageIndex + 1}/${assets.length} · ${activeAssetAnnotations.length} ${copy.imageAnnotations}` : copy.imageNotLoaded}</span>
      </header>

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        {tools.map((entry) => <button key={entry.id} onClick={() => chooseTool(entry.id)} aria-pressed={tool === entry.id && !vectorTool} style={{ fontWeight: tool === entry.id && !vectorTool ? 700 : 400 }}>{entry.label}</button>)}
        <select value={activeLabel} onChange={(event) => setActiveLabel(event.target.value)} disabled={!labels.length}>{labels.map((label) => <option key={label.id} value={label.id}>{label.id === UNLABELED_ID ? copy.unlabeled : label.name}</option>)}</select>
        {(tool === "polygon" || tool === "line") && drawing.draft && <><button onClick={() => drawing.finishDraft()} disabled={!drawing.canFinish}>{copy.finishDrawing}</button><button onClick={drawing.cancelDraft}>{copy.cancel}</button></>}
        {vectorTool === "hole" && advanced.draft && <><button onClick={() => advanced.finishHole()} disabled={!advanced.canFinish}>{copy.finishDrawing}</button><button onClick={advanced.cancel}>{copy.cancel}</button></>}
        <span style={{ marginLeft: 8 }} />
        <button title={copy.zoomOut} onClick={() => viewport.zoomBy(-10)} disabled={!asset}>−</button>
        <button title={copy.fitImage} onClick={() => viewport.zoomTo(92)} disabled={!asset}>{viewport.state.zoom}%</button>
        <button title={copy.zoomIn} onClick={() => viewport.zoomBy(10)} disabled={!asset}>+</button>
      </div>

      <VectorToolbar
        copy={copy}
        snapEnabled={snapEnabled}
        vectorTool={vectorTool}
        canSimplify={Boolean(activePolygon)}
        canMerge={selectedPolygons.length >= 2}
        canEditPolygon={Boolean(activePolygon)}
        onToggleSnap={() => setSnapEnabled((value) => !value)}
        onSimplify={simplifySelected}
        onMerge={mergeSelected}
        onVectorTool={chooseVectorTool}
      />

      <div style={{ fontSize: 13, opacity: .75, margin: "8px 0" }}>
        {message} <span style={{ opacity: .7 }}>{touch.touchMode ? copy.touchDraw : `${copy.shortcuts}: V H B P F L K · O · X · R · Enter · Esc · Delete.`}</span>
      </div>

      <section ref={viewport.scrollRef} onScroll={viewport.onScroll} onWheel={viewport.onWheel} style={{ position: "relative", width: "100%", height: "72vh", minHeight: 360, margin: "0 auto", background: "var(--canvas-bg)", overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, overscrollBehavior: "contain" }}>
        <div style={{ position: "relative", width: viewport.layout.surfaceWidth, height: viewport.layout.surfaceHeight }}>
          <div style={{ position: "absolute", left: viewport.layout.left, top: viewport.layout.top, width: viewport.layout.width, height: viewport.layout.height }}>
            {asset?.raster?.mode === "tiled" ? <CogTiledLayer asset={asset} viewport={viewport.state} layout={viewport.layout} onError={setMessage} />
              : asset?.src ? <img src={asset.src} alt={asset.name} draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", userSelect: "none", pointerEvents: "none" }} />
              : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", gap: 8, opacity: .75 }}><span>{asset?.missing ? copy.imageMissingHint : copy.imageNotLoaded}</span>{asset?.missing && <button onClick={() => relinkInputRef.current?.click()}>{copy.reloadProjectImages}</button>}</div>}
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
              overlay={overlay}
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
              onPointerDown={vectorEditing ? advanced.onPointerDown : selecting ? interactions.selectAtCanvas : drawing.onPointerDown}
              onPointerMove={vectorEditing ? advanced.onPointerMove : selecting ? interactions.moveCanvasSelection : drawing.onPointerMove}
              onPointerUp={vectorEditing ? advanced.onPointerUp : selecting ? interactions.finishCanvasSelection : drawing.onPointerUp}
              onPointerCancel={vectorEditing ? advanced.cancel : selecting ? interactions.cancel : drawing.cancelDraft}
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

      <EditorManagementPanels
        assets={assets}
        currentAssetId={asset?.id ?? ""}
        annotations={editor.annotations}
        activeAssetAnnotations={activeAssetAnnotations}
        labels={labels}
        activeLabelId={activeLabel}
        selection={editor.selection}
        hiddenAnnotationIds={hiddenAnnotationIds}
        hiddenLabelIds={hiddenLabelIds}
        copy={copy}
        onSelectAsset={selectAsset}
        onMoveAsset={moveAsset}
        onDeleteAsset={deleteAsset}
        onSelectAnnotation={selectAnnotationFromPanel}
        onMoveAnnotation={(id, delta) => editor.dispatch({ type: "reorder-annotation", id, delta })}
        onDeleteAnnotations={deleteAnnotations}
        onToggleAnnotationVisibility={toggleAnnotationVisibility}
        onToggleLabelVisibility={toggleLabelVisibility}
        onSelectAllAnnotations={selectAllActiveAnnotations}
        onClearAnnotationSelection={() => editor.dispatch({ type: "clear-selection" })}
        onActiveLabelChange={setActiveLabel}
        onBatchReclassify={batchReclassify}
        onCreateLabel={createLabel}
        onRenameLabel={changeLabelName}
        onRecolorLabel={changeLabelColor}
        onDeleteLabel={deleteLabel}
      />

      <QualityReviewPanel
        mode={reviewMode}
        assets={assets}
        labels={labels}
        annotations={editor.annotations}
        activeAsset={asset}
        activeAnnotation={editor.selectedAnnotation}
        activeLabelId={activeLabel}
        copy={copy}
        language={language}
        onModeChange={setReviewMode}
        onActiveLabelChange={setActiveLabel}
        onAssetReview={reviewAsset}
        onAnnotationReview={reviewAnnotation}
        onLabelReview={reviewLabel}
      />

      <footer style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, opacity: .65, flexWrap: "wrap" }}>
        <span>{tools.find((entry) => entry.id === tool)?.label ?? tool}</span>
        <span>{snapEnabled ? copy.snapStateOn : copy.snapStateOff}</span>
        <span>Zoom: {viewport.state.zoom}%</span>
        <span>{copy.localOnly}</span>
        {asset?.raster?.mode === "tiled" && <span>COG tiled</span>}
        <span>{projectDirty ? copy.saving : copy.saved}</span>
      </footer>
    </div>
  </main>;
}
