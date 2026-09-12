import type { Annotation } from "../../lib/types";
import type { EditorAnnotation } from "./annotation-model";
import { flatPointsFromVertices, verticesFromFlatPoints } from "./vertex-model";

function vertexId(annotationId: string, ring: string, index: number) {
  return `${annotationId}:${ring}:v${index}`;
}

export function fromLegacyAnnotation(annotation: Annotation): EditorAnnotation {
  const base = {
    id: annotation.id,
    asset: annotation.asset,
    label: annotation.label,
    reviewScore: annotation.reviewScore,
  };

  if (annotation.type === "polygon") {
    return {
      ...base,
      type: "polygon",
      vertices: verticesFromFlatPoints(annotation.pts ?? [], (index) => vertexId(annotation.id, "outer", index)),
      holes: (annotation.holes ?? []).map((hole, holeIndex) =>
        verticesFromFlatPoints(hole, (index) => vertexId(annotation.id, `hole${holeIndex}`, index)),
      ),
    };
  }

  if (annotation.type === "line") {
    return {
      ...base,
      type: "line",
      vertices: verticesFromFlatPoints(annotation.pts ?? [], (index) => vertexId(annotation.id, "line", index)),
    };
  }

  if (annotation.type === "box") {
    return {
      ...base,
      type: "box",
      x: annotation.x ?? 0,
      y: annotation.y ?? 0,
      width: annotation.w ?? 0,
      height: annotation.h ?? 0,
      rotation: annotation.rotation,
    };
  }

  return {
    ...base,
    type: "point",
    x: annotation.x ?? 0,
    y: annotation.y ?? 0,
  };
}

export function toLegacyAnnotation(annotation: EditorAnnotation): Annotation {
  const base = {
    id: annotation.id,
    asset: annotation.asset,
    label: annotation.label,
    reviewScore: annotation.reviewScore,
  };

  if (annotation.type === "polygon") {
    return {
      ...base,
      type: "polygon",
      pts: flatPointsFromVertices(annotation.vertices),
      holes: annotation.holes.map(flatPointsFromVertices),
    };
  }

  if (annotation.type === "line") {
    return { ...base, type: "line", pts: flatPointsFromVertices(annotation.vertices) };
  }

  if (annotation.type === "box") {
    return {
      ...base,
      type: "box",
      x: annotation.x,
      y: annotation.y,
      w: annotation.width,
      h: annotation.height,
      rotation: annotation.rotation,
    };
  }

  return { ...base, type: "point", x: annotation.x, y: annotation.y };
}

export function fromLegacyAnnotations(annotations: Annotation[]) {
  return annotations.map(fromLegacyAnnotation);
}

export function toLegacyAnnotations(annotations: EditorAnnotation[]) {
  return annotations.map(toLegacyAnnotation);
}
