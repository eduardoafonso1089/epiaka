"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { EditorAnnotation } from "../models/annotation-model";
import {
  annotationBase,
  boxFromDraft,
  freehandFromDraft,
  lineFromDraft,
  pointFromDraft,
  polygonFromDraft,
  type BoxDraft,
} from "./annotation-builder";

export type DrawingTool = "select" | "box" | "polygon" | "line" | "point" | "freehand";

export type DrawingDraft =
  | { type: "box"; box: BoxDraft }
  | { type: "polygon"; points: number[] }
  | { type: "line"; points: number[] }
  | { type: "freehand"; points: number[] }
  | null;

export type DrawingInteractionOptions = {
  svgRef: RefObject<SVGSVGElement | null>;
  tool: DrawingTool;
  assetId: string | null;
  labelId: string;
  makeId: (prefix: string) => string;
  addAnnotation: (annotation: EditorAnnotation, select?: boolean) => void;
};

function editorPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1000, (clientX - rect.left) / Math.max(1, rect.width) * 1000)),
    y: Math.max(0, Math.min(650, (clientY - rect.top) / Math.max(1, rect.height) * 650)),
  };
}

function flatPoint(point: { x: number; y: number }) {
  return [point.x, point.y];
}

export function useDrawingInteractions({
  svgRef,
  tool,
  assetId,
  labelId,
  makeId,
  addAnnotation,
}: DrawingInteractionOptions) {
  const [draft, setDraft] = useState<DrawingDraft>(null);
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const canFinish = useMemo(() => {
    if (draft?.type === "polygon") return draft.points.length >= 6;
    if (draft?.type === "line") return draft.points.length >= 4;
    return false;
  }, [draft]);

  const commit = useCallback((annotation: EditorAnnotation | null) => {
    if (!annotation) return false;
    addAnnotation(annotation, true);
    return true;
  }, [addAnnotation]);

  const cancelDraft = useCallback(() => {
    startRef.current = null;
    setDraft(null);
  }, []);

  const finishDraft = useCallback(() => {
    if (!assetId) return false;
    let annotation: EditorAnnotation | null = null;
    if (draft?.type === "polygon") {
      annotation = polygonFromDraft(annotationBase(makeId("polygon"), assetId, labelId), draft.points);
    } else if (draft?.type === "line") {
      annotation = lineFromDraft(annotationBase(makeId("line"), assetId, labelId), draft.points);
    }
    const committed = commit(annotation);
    if (committed) setDraft(null);
    return committed;
  }, [assetId, commit, draft, labelId, makeId]);

  const onPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === "select" || !assetId || event.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    const point = editorPoint(svg, event.clientX, event.clientY);

    if (tool === "point") {
      commit(pointFromDraft(annotationBase(makeId("point"), assetId, labelId), point));
      return;
    }

    if (tool === "polygon" || tool === "line") {
      setDraft((current) => {
        const points = current?.type === tool ? current.points : [];
        return { type: tool, points: [...points, ...flatPoint(point)] };
      });
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    startRef.current = { ...point, pointerId: event.pointerId };
    if (tool === "box") {
      setDraft({ type: "box", box: { x: point.x, y: point.y, w: 0, h: 0 } });
    } else if (tool === "freehand") {
      setDraft({ type: "freehand", points: flatPoint(point) });
    }
  }, [assetId, commit, labelId, makeId, svgRef, tool]);

  const onPointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const svg = svgRef.current;
    if (!svg) return;
    const point = editorPoint(svg, event.clientX, event.clientY);

    if (tool === "box") {
      setDraft({
        type: "box",
        box: {
          x: Math.min(start.x, point.x),
          y: Math.min(start.y, point.y),
          w: Math.abs(point.x - start.x),
          h: Math.abs(point.y - start.y),
        },
      });
    } else if (tool === "freehand") {
      setDraft((current) => {
        if (current?.type !== "freehand") return current;
        const lastX = current.points.at(-2) ?? point.x;
        const lastY = current.points.at(-1) ?? point.y;
        if (Math.hypot(point.x - lastX, point.y - lastY) < 2) return current;
        return { type: "freehand", points: [...current.points, ...flatPoint(point)] };
      });
    }
  }, [svgRef, tool]);

  const onPointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== event.pointerId || !assetId) return;
    startRef.current = null;

    if (draft?.type === "box") {
      const annotation = boxFromDraft(annotationBase(makeId("box"), assetId, labelId), draft.box);
      if (commit(annotation)) setDraft(null);
      else setDraft(null);
      return;
    }
    if (draft?.type === "freehand") {
      const annotation = freehandFromDraft(annotationBase(makeId("freehand"), assetId, labelId), draft.points);
      if (commit(annotation)) setDraft(null);
      else setDraft(null);
    }
  }, [assetId, commit, draft, labelId, makeId]);

  return {
    draft,
    canFinish,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    finishDraft,
    cancelDraft,
  };
}
