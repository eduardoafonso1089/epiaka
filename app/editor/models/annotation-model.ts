import type { Vertex } from "./vertex-model";

export type AnnotationBase = {
  id: string;
  asset: string;
  label: string;
  reviewScore?: number;
};

export type BoxAnnotation = AnnotationBase & {
  type: "box";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type PolygonAnnotation = AnnotationBase & {
  type: "polygon";
  vertices: Vertex[];
  holes: Vertex[][];
};

export type PolylineAnnotation = AnnotationBase & {
  type: "line";
  vertices: Vertex[];
};

export type PointAnnotation = AnnotationBase & {
  type: "point";
  x: number;
  y: number;
};

export type EditorAnnotation =
  | BoxAnnotation
  | PolygonAnnotation
  | PolylineAnnotation
  | PointAnnotation;

export function annotationVertices(annotation: EditorAnnotation): Vertex[] {
  return annotation.type === "polygon" || annotation.type === "line" ? annotation.vertices : [];
}

export function replaceAnnotationVertices(annotation: EditorAnnotation, vertices: Vertex[]): EditorAnnotation {
  if (annotation.type === "polygon" || annotation.type === "line") return { ...annotation, vertices };
  return annotation;
}

export function cloneAnnotation(annotation: EditorAnnotation): EditorAnnotation {
  if (annotation.type === "polygon") {
    return {
      ...annotation,
      vertices: annotation.vertices.map((vertex) => ({ ...vertex })),
      holes: annotation.holes.map((hole) => hole.map((vertex) => ({ ...vertex }))),
    };
  }
  if (annotation.type === "line") {
    return { ...annotation, vertices: annotation.vertices.map((vertex) => ({ ...vertex })) };
  }
  return { ...annotation };
}
