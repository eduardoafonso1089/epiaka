"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { Size2D } from "../../lib/editor-viewport";
import type { PolygonAnnotation } from "../models/annotation-model";
import type { EditorAction } from "../state/editor-state";
import type { VectorTool } from "../commands/editor-shortcuts";
import { clientPointToImage } from "../viewport/svg-image-space";
import {
  addPolygonHole,
  reshapePolygonAnnotation,
  splitPolygonAnnotation,
  type Point,
} from "../geometry/vector-operations";

export type AdvancedVectorDraft =
  | { type: "hole"; points: Point[] }
  | { type: "split"; start: Point; end: Point }
  | { type: "reshape"; points: Point[] }
  | null;

export type AdvancedVectorResult =
  | "hole-added"
  | "hole-invalid"
  | "split-done"
  | "split-invalid"
  | "reshape-added"
  | "reshape-removed"
  | "reshape-mixed"
  | "reshape-crossings"
  | "reshape-direction";

type Options = {
  svgRef: RefObject<SVGSVGElement | null>;
  imageSize: Size2D;
  tool: VectorTool;
  activePolygon: PolygonAnnotation | null;
  makeId: (prefix: string) => string;
  dispatch: (action: EditorAction) => void;
  onResult?: (result: AdvancedVectorResult) => void;
};

type PointerStroke = { pointerId: number; points: Point[] } | null;

export function useAdvancedVectorInteractions({ svgRef, imageSize, tool, activePolygon, makeId, dispatch, onResult }: Options) {
  const [draft, setDraft] = useState<AdvancedVectorDraft>(null);
  const strokeRef = useRef<PointerStroke>(null);

  const canFinish = useMemo(() => draft?.type === "hole" && draft.points.length >= 3, [draft]);

  const cancel = useCallback(() => {
    strokeRef.current = null;
    setDraft(null);
  }, []);

  const finishHole = useCallback(() => {
    if (!activePolygon || draft?.type !== "hole" || draft.points.length < 3) return false;
    const updated = addPolygonHole(activePolygon, draft.points, makeId);
    if (updated === activePolygon) {
      onResult?.("hole-invalid");
      return false;
    }
    dispatch({ type: "replace-annotation", annotation: updated });
    setDraft(null);
    onResult?.("hole-added");
    return true;
  }, [activePolygon, dispatch, draft, makeId, onResult]);

  const pointFor = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    return svg ? clientPointToImage(svg, event.clientX, event.clientY, imageSize) : null;
  }, [imageSize, svgRef]);

  const onPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (!tool || !activePolygon || event.button !== 0 || event.target !== event.currentTarget) return;
    const point = pointFor(event);
    if (!point) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (tool === "hole") {
      setDraft((current) => ({ type: "hole", points: current?.type === "hole" ? [...current.points, point] : [point] }));
      return;
    }
    strokeRef.current = { pointerId: event.pointerId, points: [point] };
    if (tool === "split") setDraft({ type: "split", start: point, end: point });
    else setDraft({ type: "reshape", points: [point] });
  }, [activePolygon, pointFor, tool]);

  const onPointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId || !tool) return;
    const point = pointFor(event);
    if (!point) return;
    if (tool === "split") {
      const start = stroke.points[0];
      setDraft({ type: "split", start, end: point });
      return;
    }
    if (tool === "reshape") {
      const last = stroke.points.at(-1)!;
      if (Math.hypot(point.x - last.x, point.y - last.y) < 1) return;
      stroke.points.push(point);
      setDraft({ type: "reshape", points: [...stroke.points] });
    }
  }, [pointFor, tool]);

  const onPointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId || !activePolygon || !tool) return;
    const point = pointFor(event);
    strokeRef.current = null;
    if (!point) { setDraft(null); return; }

    if (tool === "split") {
      const result = splitPolygonAnnotation(activePolygon, stroke.points[0], point, imageSize, makeId);
      setDraft(null);
      if (result.length < 2) { onResult?.("split-invalid"); return; }
      dispatch({ type: "replace-annotations-batch", removeIds: [activePolygon.id], annotations: result, selectIds: result.map((item) => item.id) });
      onResult?.("split-done");
      return;
    }

    if (tool === "reshape") {
      const points = [...stroke.points, point];
      const result = reshapePolygonAnnotation(activePolygon, points, makeId);
      setDraft(null);
      if (!result.annotation) {
        onResult?.(result.reason === "mixed" ? "reshape-mixed" : result.reason === "direction" ? "reshape-direction" : "reshape-crossings");
        return;
      }
      dispatch({ type: "replace-annotation", annotation: result.annotation });
      onResult?.(result.mode === "add" ? "reshape-added" : "reshape-removed");
    }
  }, [activePolygon, dispatch, imageSize, makeId, onResult, pointFor, tool]);

  return { draft, canFinish, finishHole, cancel, onPointerDown, onPointerMove, onPointerUp };
}
