import type { Label } from "../../lib/types";
import type { EditorAnnotation } from "../models/annotation-model";

export const UNLABELED_ID = "unlabeled";

export function moveItemById<T extends { id: string }>(items: T[], id: string, delta: -1 | 1): T[] {
  const index = items.findIndex((item) => item.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function moveIdByDelta(ids: string[], id: string, delta: -1 | 1) {
  const index = ids.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function renameLabel(labels: Label[], id: string, name: string): Label[] {
  const normalized = name.trim();
  if (!normalized || id === UNLABELED_ID) return labels;
  if (labels.some((label) => label.id !== id && label.name.localeCompare(normalized, undefined, { sensitivity: "accent" }) === 0)) return labels;
  return labels.map((label) => label.id === id ? { ...label, name: normalized } : label);
}

export function recolorLabel(labels: Label[], id: string, color: string): Label[] {
  if (id === UNLABELED_ID || !/^#[0-9a-f]{6}$/i.test(color)) return labels;
  return labels.map((label) => label.id === id ? { ...label, color } : label);
}

export function removeLabelsAndReclassify(
  labels: Label[],
  annotations: EditorAnnotation[],
  ids: string[],
): { labels: Label[]; annotations: EditorAnnotation[]; affected: number } {
  const deleted = new Set(ids.filter((id) => id !== UNLABELED_ID));
  if (!deleted.size) return { labels, annotations, affected: 0 };
  const nextLabels = labels.filter((label) => !deleted.has(label.id));
  let affected = 0;
  const nextAnnotations = annotations.map((annotation) => {
    if (!deleted.has(annotation.label)) return annotation;
    affected += 1;
    return { ...annotation, label: UNLABELED_ID };
  });
  return { labels: nextLabels, annotations: nextAnnotations, affected };
}

const PALETTE = [
  "#6c8cff", "#d987ff", "#26c6b6", "#ff8a65", "#ffd166", "#7ee081",
  "#59b0f6", "#f26d9d", "#c792ea", "#ff9f45", "#4dd4ac", "#e0dc3c",
];

export function nextLabelColor(labels: Label[]) {
  const used = new Set(labels.map((label) => label.color.toLowerCase()));
  return PALETTE.find((color) => !used.has(color.toLowerCase())) ?? PALETTE[labels.length % PALETTE.length];
}

export function createLabel(
  labels: Label[],
  id: string,
  name: string,
  color = nextLabelColor(labels),
): Label[] {
  const normalized = name.trim();
  if (!normalized || labels.some((label) => label.name.localeCompare(normalized, undefined, { sensitivity: "accent" }) === 0)) return labels;
  return [...labels, { id, name: normalized, color, key: "" }];
}
