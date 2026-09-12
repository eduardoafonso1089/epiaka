"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { edgeMidpoints } from "../../lib/geometry";
import { verticesFromFlatPoints } from "../models/vertex-model";

export type SelectedVertex = { annotationId: string; vertexIndex: number } | null;

export type VertexHandlesProps = {
  annotationId: string;
  points: number[];
  open?: boolean;
  selectedVertex: SelectedVertex;
  touchMode: boolean;
  touchRadius: number;
  markerRadius: number;
  markerAspect: number;
  color: string;
  onBeginVertexDrag: (event: ReactPointerEvent<SVGElement>, vertexIndex: number) => void;
  onMoveVertex: (event: ReactPointerEvent<SVGElement>) => void;
  onFinishVertex: (event: ReactPointerEvent<SVGElement>) => void;
  onCancel: () => void;
  onInsertVertex: (event: ReactPointerEvent<SVGElement>, edgeIndex: number, x: number, y: number) => void;
};

/**
 * Rendering-only vertex controls shared by polygons and polylines.
 * Persisted flat points are adapted to the richer Vertex[] model at this boundary.
 */
export function VertexHandles({
  annotationId,
  points,
  open = false,
  selectedVertex,
  touchMode,
  touchRadius,
  markerRadius,
  markerAspect,
  color,
  onBeginVertexDrag,
  onMoveVertex,
  onFinishVertex,
  onCancel,
  onInsertVertex,
}: VertexHandlesProps) {
  const vertices = verticesFromFlatPoints(points, (index) => `${annotationId}:v${index}`);
  const midpoints = edgeMidpoints(points, open);

  return <>
    {midpoints.map((midpoint) => <g key={`${annotationId}:e${midpoint.edgeIndex}`}>
      {touchMode && <ellipse
        className="touch-handle-hit"
        data-edge-index={midpoint.edgeIndex}
        onPointerDown={(event) => onInsertVertex(event, midpoint.edgeIndex, midpoint.x, midpoint.y)}
        onPointerMove={onMoveVertex}
        onPointerUp={onFinishVertex}
        onPointerCancel={onCancel}
        cx={midpoint.x}
        cy={midpoint.y}
        rx={touchRadius}
        ry={touchRadius * markerAspect}
        strokeWidth={0}
        fill="transparent"
      />}
      <ellipse
        className="edge-handle"
        data-edge-index={midpoint.edgeIndex}
        onPointerDown={(event) => onInsertVertex(event, midpoint.edgeIndex, midpoint.x, midpoint.y)}
        onPointerMove={onMoveVertex}
        onPointerUp={onFinishVertex}
        onPointerCancel={onCancel}
        cx={midpoint.x}
        cy={midpoint.y}
        rx={markerRadius * .5}
        ry={markerRadius * .5 * markerAspect}
        strokeWidth={markerRadius * .22}
      />
    </g>)}
    {vertices.map((vertex, vertexIndex) => {
      const isSelected = selectedVertex?.annotationId === annotationId && selectedVertex.vertexIndex === vertexIndex;
      return <g key={vertex.id} data-vertex-id={vertex.id}>
        {touchMode && <ellipse
          className="touch-handle-hit"
          data-vertex-id={vertex.id}
          onPointerDown={(event) => onBeginVertexDrag(event, vertexIndex)}
          onPointerMove={onMoveVertex}
          onPointerUp={onFinishVertex}
          onPointerCancel={onCancel}
          cx={vertex.x}
          cy={vertex.y}
          rx={touchRadius}
          ry={touchRadius * markerAspect}
          strokeWidth={0}
          fill="transparent"
        />}
        <ellipse
          className={`vertex-handle ${isSelected ? "selected" : ""}`}
          data-vertex-id={vertex.id}
          onPointerDown={(event) => onBeginVertexDrag(event, vertexIndex)}
          onPointerMove={onMoveVertex}
          onPointerUp={onFinishVertex}
          onPointerCancel={onCancel}
          cx={vertex.x}
          cy={vertex.y}
          rx={markerRadius}
          ry={markerRadius * markerAspect}
          fill="#fff"
          stroke={color}
          strokeWidth={markerRadius * .42}
        />
      </g>;
    })}
  </>;
}
