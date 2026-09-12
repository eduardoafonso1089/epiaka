"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset, Label } from "../../lib/types";
import { getCopy } from "../../lib/i18n";
import { createEditorDemo, saveEditorProject } from "../session/editor-session-io";
import { useEditorState } from "../state/use-editor-state";
import { useCanvasInteractions } from "../interactions/use-canvas-interactions";
import { EditorCanvas } from "../canvas/editor-canvas";

const EMPTY_LABELS: Label[] = [{ id: "unlabeled", name: "Sem label", color: "#929a95", key: "" }];

export function CanonicalEditorWorkbench() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [labels, setLabels] = useState<Label[]>(EMPTY_LABELS);
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

  const interactions = useCanvasInteractions({
    svgRef,
    state: editor.state,
    dispatch: editor.dispatch,
    makeId,
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

  async function loadDemo() {
    setLoading(true);
    try {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      const demo = await createEditorDemo("pt");
      objectUrls.current = demo.objectUrls;
      setAssets(demo.assets);
      setLabels(demo.labels);
      setCurrent(demo.assets[0]?.id ?? "");
      setProjectName(demo.name);
      editor.replaceAnnotations(demo.annotations, true);
      setMessage("Demo carregado no modelo canônico EditorAnnotation/V3.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar demo.");
    } finally {
      setLoading(false);
    }
  }

  function stepImage(delta: number) {
    if (!asset || !assets.length) return;
    const index = assets.findIndex((item) => item.id === asset.id);
    const next = Math.max(0, Math.min(assets.length - 1, index + delta));
    setCurrent(assets[next].id);
    editor.dispatch({ type: "clear-selection" });
  }

  async function saveProject() {
    if (!assets.length) return;
    setLoading(true);
    try {
      const name = await saveEditorProject(
        projectName,
        assets,
        labels,
        editor.annotations,
        "complete",
        getCopy("pt"),
      );
      editor.markSaved();
      setMessage(`Projeto V3 salvo: ${name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar projeto.");
    } finally {
      setLoading(false);
    }
  }

  const imageIndex = asset ? assets.findIndex((item) => item.id === asset.id) : -1;
  const aspectRatio = asset ? `${asset.width ?? 1000} / ${asset.height ?? 650}` : "1000 / 650";

  return <main style={{ minHeight: "100vh", background: "#111315", color: "#f4f5f5", padding: 16, fontFamily: "system-ui, sans-serif" }}>
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <strong style={{ marginRight: 12 }}>Poligome · editor canônico</strong>
        <button onClick={loadDemo} disabled={loading}>Carregar demo</button>
        <button onClick={() => editor.undo()} disabled={!editor.history.length}>Desfazer</button>
        <button onClick={() => editor.redo()} disabled={!editor.redoHistory.length}>Refazer</button>
        <button onClick={saveProject} disabled={loading || !assets.length}>Salvar .plgm V3</button>
        <button onClick={() => stepImage(-1)} disabled={imageIndex <= 0}>← Imagem</button>
        <button onClick={() => stepImage(1)} disabled={imageIndex < 0 || imageIndex >= assets.length - 1}>Imagem →</button>
        <span style={{ opacity: .7, marginLeft: "auto" }}>
          {asset ? `${imageIndex + 1}/${assets.length} · ${visibleAnnotations.length} anotações` : "sem imagem"}
        </span>
      </header>

      <div style={{ fontSize: 13, opacity: .75, marginBottom: 8 }}>{message}</div>

      <section style={{ position: "relative", width: "100%", aspectRatio, maxHeight: "78vh", margin: "0 auto", background: "#080909", overflow: "hidden", border: "1px solid #34383b", borderRadius: 8 }}>
        {asset?.src ? <img
          src={asset.src}
          alt={asset.name}
          draggable={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", userSelect: "none", pointerEvents: "none" }}
        /> : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: .55 }}>Nenhuma imagem carregada</div>}

        {asset && <EditorCanvas
          svgRef={svgRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }}
          annotations={visibleAnnotations}
          labels={labels}
          tool="select"
          selectedId={editor.selection.selected}
          selectedIds={selectedIds}
          selectedVertex={editor.selectedVertex}
          selectionMarquee={null}
          lineThickness={3}
          touchMode={false}
          touchRadius={22}
          markerRadius={4.6}
          markerAspect={650 * (asset.width ?? 1000) / (1000 * (asset.height ?? 650))}
          boxTouchRadius={28}
          boxRotationTouchRadius={20}
          onPointerDown={interactions.selectAtCanvas}
          onPointerMove={() => undefined}
          onPointerUp={() => undefined}
          onPointerCancel={interactions.cancel}
          onBeginAnnotationDrag={interactions.beginAnnotationDrag}
          onMoveAnnotation={interactions.moveAnnotation}
          onFinishAnnotation={interactions.finishAnnotation}
          onBeginVertexDrag={interactions.beginVertexDrag}
          onMoveVertex={interactions.moveVertex}
          onFinishVertex={interactions.finishVertex}
          onInsertVertex={interactions.insertVertex}
          onResizeStart={interactions.resizeStart}
          onResizeMove={interactions.resizeMove}
          onResizeEnd={interactions.resizeEnd}
          onRotateStart={interactions.rotateStart}
          onTransformMove={interactions.transformMove}
          onTransformEnd={interactions.transformEnd}
        />}
      </section>

      <footer style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, opacity: .65 }}>
        <span>Formato interno: EditorAnnotation[]</span>
        <span>Projeto: .plgm V3</span>
        <span>Vértices: IDs estáveis</span>
        <span>{editor.saved ? "salvo" : "alterado"}</span>
      </footer>
    </div>
  </main>;
}
