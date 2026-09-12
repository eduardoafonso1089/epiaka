"use client";

import { useCallback, useRef } from "react";
import type { EditorAnnotation } from "../models/annotation-model";
import type { Label } from "../../lib/types";
import { useEditorState } from "../state/use-editor-state";
import { useCanvasInteractions } from "../interactions/use-canvas-interactions";
import { EditorCanvas } from "./editor-canvas";

export type CanonicalEditorSurfaceProps = {
  initialAnnotations?: EditorAnnotation[];
  labels: Label[];
  tool?: string;
  lineThickness?: number;
  touchMode?: boolean;
  markerRadius?: number;
  markerAspect?: number;
  touchRadius?: number;
  boxTouchRadius?: number;
  boxRotationTouchRadius?: number;
  className?: string;
};

/**
 * Integration boundary for the canonical editor stack. It intentionally owns no project UI;
 * panels, import/export and image framing can remain outside while the legacy route is retired.
 */
export function CanonicalEditorSurface({
  initialAnnotations = [],
  labels,
  tool = "select",
  lineThickness = 3,
  touchMode = false,
  markerRadius = 4.6,
  markerAspect = 1,
  touchRadius = 22,
  boxTouchRadius = 28,
  boxRotationTouchRadius = 20,
  className,
}: CanonicalEditorSurfaceProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const editor = useEditorState(initialAnnotations);
  const idCounter = useRef(0);
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
  const selectedIds = editor.selection.multiSelected.length
    ? editor.selection.multiSelected
    : editor.selection.selected ? [editor.selection.selected] : [];

  return <EditorCanvas
    svgRef={svgRef}
    className={className}
    annotations={editor.annotations}
    labels={labels}
    tool={tool}
    selectedId={editor.selection.selected}
    selectedIds={selectedIds}
    selectedVertex={editor.selectedVertex}
    selectionMarquee={null}
    lineThickness={lineThickness}
    touchMode={touchMode}
    touchRadius={touchRadius}
    markerRadius={markerRadius}
    markerAspect={markerAspect}
    boxTouchRadius={boxTouchRadius}
    boxRotationTouchRadius={boxRotationTouchRadius}
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
  />;
}
