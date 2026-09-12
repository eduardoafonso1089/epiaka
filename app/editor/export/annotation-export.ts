import type { Asset, Label } from "../../lib/types";
import type { BoxAnnotation, EditorAnnotation } from "../models/annotation-model";
import type { Vertex } from "../models/vertex-model";
import { EDITOR_HEIGHT, EDITOR_WIDTH, annotationBounds } from "../geometry/annotation-geometry";

export function verticesToFlat(vertices: Vertex[]) {
  return vertices.flatMap((vertex) => [vertex.x, vertex.y]);
}

export function scaleVertices(vertices: Vertex[], width: number, height: number) {
  return vertices.flatMap((vertex) => [
    vertex.x / EDITOR_WIDTH * width,
    vertex.y / EDITOR_HEIGHT * height,
  ]);
}

export function polygonArea(vertices: Vertex[]) {
  if (vertices.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

export function boxCorners(annotation: BoxAnnotation): Vertex[] {
  const centerX = annotation.x + annotation.width / 2;
  const centerY = annotation.y + annotation.height / 2;
  const cosine = Math.cos(annotation.rotation ?? 0);
  const sine = Math.sin(annotation.rotation ?? 0);
  const corners = [
    [annotation.x, annotation.y],
    [annotation.x + annotation.width, annotation.y],
    [annotation.x + annotation.width, annotation.y + annotation.height],
    [annotation.x, annotation.y + annotation.height],
  ];
  return corners.map(([x, y], index) => {
    const dx = x - centerX;
    const dy = y - centerY;
    return {
      id: `${annotation.id}:corner:${index}`,
      x: centerX + dx * cosine - dy * sine,
      y: centerY + dx * sine + dy * cosine,
    };
  });
}

export function exportBounds(annotation: EditorAnnotation) {
  if (annotation.type !== "box" || Math.abs(annotation.rotation ?? 0) < 0.0001) return annotationBounds(annotation);
  const corners = boxCorners(annotation);
  const xs = corners.map((vertex) => vertex.x);
  const ys = corners.map((vertex) => vertex.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function annotationToCoco(
  annotation: EditorAnnotation,
  annotationIndex: number,
  assets: Asset[],
  labels: Label[],
) {
  const imageIndex = assets.findIndex((asset) => asset.id === annotation.asset);
  const categoryIndex = labels.findIndex((label) => label.id === annotation.label);
  const asset = assets[imageIndex];
  const width = asset?.width ?? EDITOR_WIDTH;
  const height = asset?.height ?? EDITOR_HEIGHT;
  const bounds = exportBounds(annotation);
  const sx = width / EDITOR_WIDTH;
  const sy = height / EDITOR_HEIGHT;

  const segmentation = annotation.type === "polygon"
    ? [annotation.vertices, ...annotation.holes].map((ring) => scaleVertices(ring, width, height))
    : annotation.type === "box" && Math.abs(annotation.rotation ?? 0) > 0.0001
      ? [scaleVertices(boxCorners(annotation), width, height)]
      : [];

  const line = annotation.type === "line" ? scaleVertices(annotation.vertices, width, height) : [];

  const area = annotation.type === "polygon"
    ? (polygonArea(annotation.vertices) - annotation.holes.reduce((sum, hole) => sum + polygonArea(hole), 0)) * sx * sy
    : annotation.type === "line"
      ? 0
      : annotation.type === "box"
        ? annotation.width * annotation.height * sx * sy
        : 0;

  return {
    id: annotationIndex + 1,
    image_id: imageIndex + 1,
    category_id: categoryIndex + 1,
    bbox: [bounds.x * sx, bounds.y * sy, bounds.width * sx, bounds.height * sy],
    segmentation,
    line,
    keypoints: annotation.type === "point" ? [annotation.x * sx, annotation.y * sy, 2] : [],
    num_keypoints: annotation.type === "point" ? 1 : 0,
    area,
    rotation: annotation.type === "box" ? annotation.rotation ?? 0 : undefined,
    iscrowd: 0,
  };
}

export function annotationToYolo(annotation: EditorAnnotation, labels: Label[]) {
  const classIndex = labels.findIndex((label) => label.id === annotation.label);
  if (classIndex < 0) return null;

  if (annotation.type === "box") {
    const bounds = exportBounds(annotation);
    return [
      classIndex,
      (bounds.x + bounds.width / 2) / EDITOR_WIDTH,
      (bounds.y + bounds.height / 2) / EDITOR_HEIGHT,
      bounds.width / EDITOR_WIDTH,
      bounds.height / EDITOR_HEIGHT,
    ].map((value, index) => index === 0 ? String(value) : Number(value).toFixed(6)).join(" ");
  }

  if (annotation.type === "polygon") {
    const normalized = annotation.vertices.flatMap((vertex) => [
      (vertex.x / EDITOR_WIDTH).toFixed(6),
      (vertex.y / EDITOR_HEIGHT).toFixed(6),
    ]);
    return `${classIndex} ${normalized.join(" ")}`;
  }

  return null;
}

export type GeoPointProjector = (x: number, y: number) => [number, number];

function closeRing(points: Array<[number, number]>) {
  if (!points.length) return points;
  const first = points[0];
  const last = points.at(-1)!;
  return first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
}

export function annotationToGeoJsonGeometry(annotation: EditorAnnotation, project: GeoPointProjector) {
  if (annotation.type === "point") return { type: "Point", coordinates: project(annotation.x, annotation.y) } as const;
  if (annotation.type === "line") {
    return { type: "LineString", coordinates: annotation.vertices.map((vertex) => project(vertex.x, vertex.y)) } as const;
  }
  if (annotation.type === "box") {
    return { type: "Polygon", coordinates: [closeRing(boxCorners(annotation).map((vertex) => project(vertex.x, vertex.y)))] } as const;
  }
  return {
    type: "Polygon",
    coordinates: [
      closeRing(annotation.vertices.map((vertex) => project(vertex.x, vertex.y))),
      ...annotation.holes.map((hole) => closeRing(hole.map((vertex) => project(vertex.x, vertex.y)))),
    ],
  } as const;
}
