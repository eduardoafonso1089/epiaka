import type { Asset, Label } from "../../lib/types";
import type { EditorAnnotation } from "../models/annotation-model";
import { cocoAnnotationToEditor, cocoGeometryTypes, type CocoAnnotationInput, type CocoCategoryInput } from "./coco-import";

export type CocoImageInput = { id?: number; file_name?: string; width?: number; height?: number };
export type CocoDocumentInput = {
  images?: CocoImageInput[];
  categories?: CocoCategoryInput[];
  annotations?: Array<CocoAnnotationInput & { image_id?: number; category_id?: number }>;
};
export type CocoDocumentImportResult = { labels: Label[]; annotations: EditorAnnotation[]; imported: number; unmatched: number };

const IMPORT_COLORS = ["#6c8cff", "#d987ff", "#26c6b6", "#ff8a65", "#ffd166", "#7ee081", "#59b0f6", "#f26d9d"];

function baseName(name: string) {
  return name.split(/[\\/]/).pop()?.trim().toLocaleLowerCase() ?? "";
}

function names(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && !!item.trim()).map((item) => item.trim()) : [];
}

export function importCocoDocument(document: CocoDocumentInput, assets: Asset[], currentLabels: Label[], makeId: (prefix: string) => string): CocoDocumentImportResult {
  const images = Array.isArray(document.images) ? document.images : [];
  const categories = Array.isArray(document.categories) ? document.categories : [];
  const sourceAnnotations = Array.isArray(document.annotations) ? document.annotations : [];
  const labels = [...currentLabels];
  const annotations: EditorAnnotation[] = [];
  let unmatched = 0;

  const assetsByName = new Map(assets.map((asset) => [baseName(asset.name), asset]));
  const imageById = new Map(images.flatMap((image) => {
    if (typeof image.id !== "number" || typeof image.file_name !== "string") return [];
    const asset = assetsByName.get(baseName(image.file_name));
    return asset ? [[image.id, { image, asset }] as const] : [];
  }));
  const categoryById = new Map(categories.flatMap((category) => typeof category.id === "number" ? [[category.id, category] as const] : []));
  const labelByCategory = new Map<number, Label>();

  const ensureLabel = (name: string, preferredPrefix = "label") => {
    const normalized = name.trim() || "Sem label";
    const existing = labels.find((label) => label.name.toLocaleLowerCase() === normalized.toLocaleLowerCase());
    if (existing) return existing;
    const created: Label = { id: makeId(preferredPrefix), name: normalized, color: IMPORT_COLORS[labels.length % IMPORT_COLORS.length], key: "" };
    labels.push(created);
    return created;
  };

  for (const category of categories) {
    if (typeof category.id !== "number") continue;
    labelByCategory.set(category.id, ensureLabel(category.name?.trim() || `Classe ${category.id}`));
  }

  for (const input of sourceAnnotations) {
    if (typeof input.image_id !== "number") { unmatched += 1; continue; }
    const imageEntry = imageById.get(input.image_id);
    if (!imageEntry) { unmatched += 1; continue; }

    const category = typeof input.category_id === "number" ? categoryById.get(input.category_id) : undefined;
    const label = typeof input.category_id === "number"
      ? labelByCategory.get(input.category_id) ?? ensureLabel(`Classe ${input.category_id}`)
      : ensureLabel("Sem label");
    const geometryTypes = new Set(cocoGeometryTypes(input));
    if (!geometryTypes.size) { unmatched += 1; continue; }

    const sourceWidth = Number(imageEntry.image.width ?? imageEntry.asset.width);
    const sourceHeight = Number(imageEntry.image.height ?? imageEntry.asset.height);
    const targetWidth = Number(imageEntry.asset.width);
    const targetHeight = Number(imageEntry.asset.height);
    if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every((value) => Number.isFinite(value) && value > 0)) {
      unmatched += 1;
      continue;
    }

    const keypointNames = names(category?.keypoints);
    const converted = cocoAnnotationToEditor(input, {
      assetId: imageEntry.asset.id,
      sourceWidth,
      sourceHeight,
      targetWidth,
      targetHeight,
      labelId: label.id,
      geometryTypes,
      annotationId: () => makeId("annotation"),
      categoryKeypointNames: keypointNames,
      pointLabelId: (name) => ensureLabel(name, "keypoint").id,
    });
    annotations.push(...converted);
    if (!converted.length) unmatched += 1;
  }

  return { labels, annotations, imported: annotations.length, unmatched };
}
