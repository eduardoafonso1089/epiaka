import type { EditorAnnotation } from "../models/annotation-model";
import type { Vertex } from "../models/vertex-model";
import { deleteVertex, insertVertex, moveVertices, updateVertex } from "../models/vertex-model";

export const EDITOR_WIDTH = 1000;
export const EDITOR_HEIGHT = 650;
export const MIN_VERTEX_DISTANCE = 10;

export type Bounds = { x: number; y: number; width: number; height: number };

export function clampPoint(point: { x: number; y: number }) {
  return {
    x: Math.max(0, Math.min(EDITOR_WIDTH, point.x)),
    y: Math.max(0, Math.min(EDITOR_HEIGHT, point.y)),
  };
}

export function verticesBounds(vertices: Vertex[]): Bounds {
  if (!vertices.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = vertices.map((vertex) => vertex.x);
  const ys = vertices.map((vertex) => vertex.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function annotationBounds(annotation: EditorAnnotation): Bounds {
  if (annotation.type === "polygon" || annotation.type === "line") return verticesBounds(annotation.vertices);
  if (annotation.type === "box") {
    return { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height };
  }
  return { x: annotation.x - 4, y: annotation.y - 4, width: 8, height: 8 };
}

export function translateAnnotation(annotation: EditorAnnotation, dx: number, dy: number): EditorAnnotation {
  if (annotation.type === "polygon") {
    return {
      ...annotation,
      vertices: moveVertices(annotation.vertices, dx, dy),
      holes: annotation.holes.map((hole) => moveVertices(hole, dx, dy)),
    };
  }
  if (annotation.type === "line") return { ...annotation, vertices: moveVertices(annotation.vertices, dx, dy) };
  return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
}

export function updateAnnotationVertex(annotation: EditorAnnotation, vertexId: string, point: { x: number; y: number }): EditorAnnotation {
  if (annotation.type !== "polygon" && annotation.type !== "line") return annotation;
  const target = clampPoint(point);
  const overlaps = annotation.vertices.some((vertex) =>
    vertex.id !== vertexId && Math.hypot(vertex.x - target.x, vertex.y - target.y) < MIN_VERTEX_DISTANCE,
  );
  if (overlaps) return annotation;
  return { ...annotation, vertices: updateVertex(annotation.vertices, vertexId, target) };
}

export function insertAnnotationVertex(
  annotation: EditorAnnotation,
  afterVertexId: string,
  point: { x: number; y: number },
  vertexId: string,
): EditorAnnotation {
  if (annotation.type !== "polygon" && annotation.type !== "line") return annotation;
  const target = clampPoint(point);
  const tooClose = annotation.vertices.some((vertex) =>
    Math.hypot(vertex.x - target.x, vertex.y - target.y) < MIN_VERTEX_DISTANCE,
  );
  if (tooClose) return annotation;
  return {
    ...annotation,
    vertices: insertVertex(annotation.vertices, afterVertexId, target, () => vertexId),
  };
}

export function deleteAnnotationVertex(annotation: EditorAnnotation, vertexId: string): EditorAnnotation | null {
  if (annotation.type !== "polygon" && annotation.type !== "line") return annotation;
  const minimum = annotation.type === "line" ? 2 : 3;
  if (annotation.vertices.length <= minimum) return null;
  return { ...annotation, vertices: deleteVertex(annotation.vertices, vertexId, minimum) };
}

export function edgeMidpoints(vertices: Vertex[], open = false) {
  if (vertices.length < 2) return [];
  const limit = open ? vertices.length - 1 : vertices.length;
  const result: Array<{ afterVertexId: string; x: number; y: number }> = [];
  for (let index = 0; index < limit; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    if (Math.hypot(current.x - next.x, current.y - next.y) < MIN_VERTEX_DISTANCE * 3) continue;
    result.push({
      afterVertexId: current.id,
      x: (current.x + next.x) / 2,
      y: (current.y + next.y) / 2,
    });
  }
  return result;
}
