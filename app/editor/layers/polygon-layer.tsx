"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { Annotation } from "../../lib/types";
import { VertexHandles, type SelectedVertex } from "./vertex-handles";

function polygonPath(outer: number[] = [], holes: number[][] = []) {
  return [outer, ...holes]
    .filter((ring) => ring.length >= 6)
    .map((ring) => `M ${ring[0]} ${ring[1]} ${ring.slice(2).reduce((path, coordinate, index) => index % 2 === 0 ? `${path} L ${coordinate} ${ring[index + 3]}` : path, "")} Z`)
    .join(" ");
}

export type PolygonLayerProps = {
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

/** Presentational polygon layer. All editor state/commands stay outside this component. */
export function PolygonLayer({
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
}: PolygonLayerProps) {
  const points = annotation.pts ?? [];
  const showHandles = tool === "select" && selected && primarySelected;

  return <g data-annotation-id={annotation.id}>
    <path
      fillRule="evenodd"
      className={`${tool === "select" ? "movable-annotation" : ""} ${tool === "reshape" && primarySelected ? "reshape-target" : ""}`.trim()}
      onPointerDown={onBeginAnnotationDrag}
      onPointerMove={onMoveAnnotation}
      onPointerUp={onFinishAnnotation}
      onPointerCancel={onCancel}
      d={polygonPath(points, annotation.holes ?? [])}
      fill={`${color}30`}
      stroke={color}
      strokeWidth={selected ? lineThickness + 2 : lineThickness}
    />
    {showHandles && <VertexHandles
      annotationId={annotation.id}
      points={points}
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
