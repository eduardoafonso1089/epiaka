import type { Annotation } from "../../lib/types";
import { MIN_VERTEX_DISTANCE } from "../../lib/geometry";

export type VertexRef = { annotationId: string; vertexIndex: number };

export function nearestVertexIndex(
  points: number[],
  point: { x: number; y: number },
  options: { markerAspect?: number; maxDistance?: number } = {},
) {
  const markerAspect = Math.max(options.markerAspect ?? 1, 0.01);
  const maxDistance = options.maxDistance ?? Number.POSITIVE_INFINITY;
  let closest = -1;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length; index += 2) {
    const distance = Math.hypot(
      points[index] - point.x,
      (points[index + 1] - point.y) / markerAspect,
    );
    if (distance < closestDistance) {
      closest = index / 2;
      closestDistance = distance;
    }
  }

  return closestDistance <= maxDistance ? closest : -1;
}

/** Vertices created by splits can be near-coincident; edit them as one topological node. */
export function linkedVertices(
  annotations: Annotation[],
  source: { x: number; y: number },
  tolerance = 3,
): VertexRef[] {
  return annotations.flatMap((annotation) => {
    if ((annotation.type !== "polygon" && annotation.type !== "line") || !annotation.pts) return [];
    const refs: VertexRef[] = [];
    for (let index = 0; index < annotation.pts.length; index += 2) {
      if (Math.hypot(annotation.pts[index] - source.x, annotation.pts[index + 1] - source.y) <= tolerance) {
        refs.push({ annotationId: annotation.id, vertexIndex: index / 2 });
      }
    }
    return refs;
  });
}

export function nearbyVertexIndex(points: number[], x: number, y: number, tolerance = MIN_VERTEX_DISTANCE * 1.5) {
  for (let index = 0; index < points.length; index += 2) {
    if (Math.hypot(points[index] - x, points[index + 1] - y) < tolerance) return index / 2;
  }
  return -1;
}

export function insertedVertexIndex(edgeIndex: number) {
  return edgeIndex + 1;
}
