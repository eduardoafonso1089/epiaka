"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { Annotation } from "../../lib/types";
import { pointsToSvg } from "../../lib/geometry";
import { VertexHandles, type SelectedVertex } from "./vertex-handles";

export type PolylineLayerProps = {
  annotation: Annotation;
  color: string;
  tool: string;
  selected: boolean;
  primarySelected: boolean;
  selectedVertex: SelectedVertex;
  lineThickness: number;
  touchMode: boolean;
  touchRadius: number;
  markerRadius: number;
  markerAspect: number;
  onBeginAnnotationDrag: (event: ReactPointerEvent<SVGElement>) => void;
  onMoveAnnotation: (event: ReactPointerEvent<SVGElement>) => void;
  onFinishAnnotation: (event: ReactPointerEvent<SVGElement>) => void;
  onCancel: () => void;
  onBeginVertexDrag: (event: ReactPointerEvent<SVGElement>, vertexIndex: number) => void;
  onMoveVertex: (event: ReactPointerEvent<SVGElement>) => void;
  onFinishVertex: (event: ReactPointerEvent<SVGElement>) => void;
  onInsertVertex: (event: ReactPointerEvent<SVGElement>, edgeIndex: number, x: number, y: number) => void;
};

/** Presentational open-polyline layer sharing the same vertex controls as polygons. */
export function PolylineLayer({
  annotation,
  color,
  tool,
  selected,
  primarySelected,
  selectedVertex,
  lineThickness,
  touchMode,
  touchRadius,
  markerRadius,
  markerAspect,
  onBeginAnnotationDrag,
  onMoveAnnotation,
  onFinishAnnotation,
  onCancel,
  onBeginVertexDrag,
  onMoveVertex,
  onFinishVertex,
  onInsertVertex,
}: PolylineLayerProps) {
  const points = annotation.pts ?? [];
  const showHandles = tool === "select" && selected && primarySelected;

  return <g data-annotation-id={annotation.id}>
    <polyline
      className={`line-hit ${tool === "select" ? "movable-annotation" : ""}`}
      onPointerDown={onBeginAnnotationDrag}
      onPointerMove={onMoveAnnotation}
      onPointerUp={onFinishAnnotation}
      onPointerCancel={onCancel}
      points={pointsToSvg(points)}
      strokeWidth={Math.max(14, lineThickness + 12)}
    />
    <polyline
      className="line-shape"
      points={pointsToSvg(points)}
      stroke={color}
      strokeWidth={selected ? lineThickness + 2 : lineThickness}
    />
    {showHandles && <VertexHandles
      annotationId={annotation.id}
      points={points}
      open
      selectedVertex={selectedVertex}
      touchMode={touchMode}
      touchRadius={touchRadius}
      markerRadius={markerRadius}
      markerAspect={markerAspect}
      color={color}
      onBeginVertexDrag={onBeginVertexDrag}
      onMoveVertex={onMoveVertex}
      onFinishVertex={onFinishVertex}
      onCancel={onCancel}
      onInsertVertex={onInsertVertex}
    />}
  </g>;
}
