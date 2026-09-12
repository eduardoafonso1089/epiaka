import type { EditorAnnotation } from "../models/annotation-model";
import {
  createBox,
  createPoint,
  createPolygon,
} from "../models/annotation-factory";

export type CocoGeometry = "polygon" | "box" | "point";

export type CocoAnnotationInput = {
  category_id?: number;
  bbox?: number[];
  segmentation?: unknown;
  keypoints?: unknown;
  landmarks?: unknown;
  keypoint_names?: unknown;
  landmark_names?: unknown;
};

export type CocoCategoryInput = {
  id?: number;
  name?: string;
  keypoints?: unknown;
};

export type CocoImportContext = {
  assetId: string;
  sourceWidth: number;
  sourceHeight: number;
  labelId: string;
  geometryTypes: Set<CocoGeometry>;
  annotationId: () => string;
  pointLabelId?: (name: string, index: number) => string;
  categoryKeypointNames?: string[];
};

function arrays(value: unknown): unknown[][] {
  if (!Array.isArray(value)) return [];
  if (value.every((item) => typeof item === "number")) return [value];
  return value.filter(Array.isArray) as unknown[][];
}

function coordinatesFromRing(value: unknown, sx: number, sy: number) {
  if (!Array.isArray(value) || value.length < 6 || value.length % 2 !== 0) return [];
  const numbers = value.map(Number);
  if (!numbers.every(Number.isFinite)) return [];
  const coordinates: Array<[number, number]> = [];
  for (let index = 0; index < numbers.length; index += 2) coordinates.push([numbers[index] * sx, numbers[index + 1] * sy]);
  return coordinates;
}

function landmarkPoints(value: unknown): Array<{ x: number; y: number; index: number }> {
  if (!Array.isArray(value)) return [];
  if (value.every((item) => typeof item === "number")) {
    const stride = value.length % 3 === 0 ? 3 : 2;
    const points: Array<{ x: number; y: number; index: number }> = [];
    for (let offset = 0; offset + 1 < value.length; offset += stride) {
      const x = Number(value[offset]);
      const y = Number(value[offset + 1]);
      const visibility = stride === 3 ? Number(value[offset + 2]) : 1;
      if (Number.isFinite(x) && Number.isFinite(y) && visibility > 0) points.push({ x, y, index: offset / stride });
    }
    return points;
  }
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const point = item as { x?: unknown; y?: unknown; visibility?: unknown; v?: unknown };
    const x = Number(point.x);
    const y = Number(point.y);
    const visibility = Number(point.visibility ?? point.v ?? 1);
    return Number.isFinite(x) && Number.isFinite(y) && visibility > 0 ? [{ x, y, index }] : [];
  });
}

function names(value: unknown) {
  return Array.isArray(value) ? value.map((name) => typeof name === "string" ? name.trim() : "") : [];
}

export function cocoAnnotationToEditor(
  input: CocoAnnotationInput,
  context: CocoImportContext,
): EditorAnnotation[] {
  const sx = 1000 / Math.max(1, context.sourceWidth);
  const sy = 650 / Math.max(1, context.sourceHeight);
  const result: EditorAnnotation[] = [];

  if (context.geometryTypes.has("polygon")) {
    for (const ring of arrays(input.segmentation)) {
      const coordinates = coordinatesFromRing(ring, sx, sy);
      if (coordinates.length < 3) continue;
      result.push(createPolygon(
        { id: context.annotationId(), asset: context.assetId, label: context.labelId },
        coordinates,
      ));
    }
  }

  if (context.geometryTypes.has("point")) {
    const annotationNames = names(input.keypoint_names ?? input.landmark_names);
    const points = landmarkPoints(input.keypoints ?? input.landmarks);
    for (const point of points) {
      const name = annotationNames[point.index] || context.categoryKeypointNames?.[point.index] || "";
      const label = name && context.pointLabelId ? context.pointLabelId(name, point.index) : context.labelId;
      result.push(createPoint(
        { id: context.annotationId(), asset: context.assetId, label },
        { x: point.x * sx, y: point.y * sy },
      ));
    }
  }

  if (context.geometryTypes.has("box") && Array.isArray(input.bbox) && input.bbox.length >= 4) {
    const [x, y, width, height] = input.bbox.slice(0, 4).map(Number);
    if ([x, y, width, height].every(Number.isFinite)) {
      result.push(createBox(
        { id: context.annotationId(), asset: context.assetId, label: context.labelId },
        { x: x * sx, y: y * sy, width: width * sx, height: height * sy },
      ));
    }
  }

  return result;
}

export function cocoGeometryTypes(input: CocoAnnotationInput): CocoGeometry[] {
  const result: CocoGeometry[] = [];
  if (arrays(input.segmentation).some((ring) => coordinatesFromRing(ring, 1, 1).length >= 3)) result.push("polygon");
  if (landmarkPoints(input.keypoints ?? input.landmarks).length) result.push("point");
  if (Array.isArray(input.bbox) && input.bbox.length >= 4 && input.bbox.slice(0, 4).map(Number).every(Number.isFinite)) result.push("box");
  return result;
}
