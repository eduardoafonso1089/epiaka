"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Asset, Label } from "../../lib/types";
import { getCopy } from "../../lib/i18n";
import type { EditorAnnotation } from "../models/annotation-model";
import type { BoxCorner } from "../layers/box-layer";
import { createEditorDemo, saveEditorProject } from "../session/editor-session-io";
import { useEditorState } from "../state/use-editor-state";
import { useCanvasInteractions } from "../interactions/use-canvas-interactions";
import { EditorCanvas } from "../canvas/editor-canvas";
import { DrawingDraftLayer } from "../drawing/drawing-draft-layer";
import { useDrawingInteractions, type DrawingTool } from "../drawing/use-drawing-interactions";

const EMPTY_LABELS: Label[] = [{ id: "unlabeled", name: "Sem label", color: "#929a95", key: "" }];
const TOOLS: Array<{ id: DrawingTool; label: string }> = [
  { id: "select", label: "Selecionar" },
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
  const [projectName, setProjectName] = useState("Poligome V3");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Carregue o demo para testar o editor canônico.");
  const objectUrls = useRef<string[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const idCounter = useRef(0);
  const editor = useEditorState();

  const makeId = useCallback((prefix: string) => {
    idCounter.current += 1;
    const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    return `${prefix}-${random}-${idCounter.current}`;
  }, []);

  const interactions = useCanvasInteractions({ svgRef, state: editor.state, dispatch: editor.dispatch, makeId });
  const drawing = useDrawingInteractions({
    svgRef,
    tool,
    assetId: current || null,
    labelId: activeLabel,
    makeId,
    addAnnotation: editor.addAnnotation,
  });

  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const asset = assets.find((item) => item.id === current) ?? assets[0] ?? null;
  const visibleAnnotations = useMemo(
    () => asset ? editor.annotations.filter((annotation) => annotation.asset === asset.id) : [],
    [asset, editor.annotations],
  );
  const selectedIds = editor.selection.multiSelected.length
    ? editor.selection.multiSelected
    : editor.selection.selected ? [editor.selection.selected] : [];
  const activeColor = labels.find((label) => label.id === activeLabel)?.color ?? "#929a95";

  async function loadDemo() {
    setLoading(true);
    try {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      const demo = await createEditorDemo("pt");
      objectUrls.current = demo.objectUrls;
      setAssets(demo.assets);
      setLabels(demo.labels);
      setActiveLabel(demo.labels[0]?.id ?? EMPTY_LABELS[0].id);
      setCurrent(demo.assets[0]?.id ?? "");
      setProjectName(demo.name);
      setTool("select");
      drawing.cancelDraft();
      editor.replaceAnnotations(demo.annotations, true);
      setMessage("Demo carregado no modelo canônico EditorAnnotation/V3.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar demo.");
    } finally {
      setLoading(false);
    }
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
      setMessage(`Projeto V3 salvo: ${name}`);
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
  const aspectRatio = asset ? `${asset.width ?? 1000} / ${asset.height ?? 650}` : "1000 / 650";
  const selecting = tool === "select";

  return <main style={{ minHeight: "100vh", background: "#111315", color: "#f4f5f5", padding: 16, fontFamily: "system-ui, sans-serif" }}>
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <strong style={{ marginRight: 8 }}>Poligome · editor canônico</strong>
        <button onClick={loadDemo} disabled={loading}>Carregar demo</button>
        <button onClick={() => editor.undo()} disabled={!editor.history.length}>Desfazer</button>
        <button onClick={() => editor.redo()} disabled={!editor.redoHistory.length}>Refazer</button>
        <button onClick={saveProject} disabled={loading || !assets.length}>Salvar .plgm V3</button>
        <button onClick={() => stepImage(-1)} disabled={imageIndex <= 0}>← Imagem</button>
        <button onClick={() => stepImage(1)} disabled={imageIndex < 0 || imageIndex >= assets.length - 1}>Imagem →</button>
        <span style={{ opacity: .7, marginLeft: "auto" }}>{asset ? `${imageIndex + 1}/${assets.length} · ${visibleAnnotations.length} anotações` : "sem imagem"}</span>
      </header>

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        {TOOLS.map((entry) => <button key={entry.id} onClick={() => chooseTool(entry.id)} aria-pressed={tool === entry.id} style={{ fontWeight: tool === entry.id ? 700 : 400 }}>{entry.label}</button>)}
        <select value={activeLabel} onChange={(event) => setActiveLabel(event.target.value)} disabled={!labels.length}>
          {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
        </select>
        {(tool === "polygon" || tool === "line") && drawing.draft && <>
          <button onClick={() => drawing.finishDraft()} disabled={!drawing.canFinish}>Concluir forma</button>
          <button onClick={drawing.cancelDraft}>Cancelar</button>
        </>}
      </div>

      <div style={{ fontSize: 13, opacity: .75, marginBottom: 8 }}>{message}</div>

      <section style={{ position: "relative", width: "100%", aspectRatio, maxHeight: "78vh", margin: "0 auto", background: "#080909", overflow: "hidden", border: "1px solid #34383b", borderRadius: 8 }}>
        {asset?.src ? <img src={asset.src} alt={asset.name} draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", userSelect: "none", pointerEvents: "none" }} />
          : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: .55 }}>Nenhuma imagem carregada</div>}

        {asset && <EditorCanvas
          svgRef={svgRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", cursor: selecting ? "default" : "crosshair" }}
          annotations={visibleAnnotations}
          labels={labels}
          tool={tool}
          selectedId={editor.selection.selected}
          selectedIds={selectedIds}
          selectedVertex={editor.selectedVertex}
          selectionMarquee={null}
          overlay={<DrawingDraftLayer draft={drawing.draft} color={activeColor} lineThickness={3} />}
          lineThickness={3}
          touchMode={false}
          touchRadius={22}
          markerRadius={4.6}
          markerAspect={650 * (asset.width ?? 1000) / (1000 * (asset.height ?? 650))}
          boxTouchRadius={28}
          boxRotationTouchRadius={20}
          onPointerDown={selecting ? interactions.selectAtCanvas : drawing.onPointerDown}
          onPointerMove={selecting ? (() => undefined) : drawing.onPointerMove}
          onPointerUp={selecting ? (() => undefined) : drawing.onPointerUp}
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
      </section>

      <footer style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, opacity: .65, flexWrap: "wrap" }}>
        <span>Ferramenta: {tool}</span><span>Formato interno: EditorAnnotation[]</span><span>Projeto: .plgm V3</span><span>Vértices: IDs estáveis</span><span>{editor.saved ? "salvo" : "alterado"}</span>
      </footer>
    </div>
  </main>;
}
