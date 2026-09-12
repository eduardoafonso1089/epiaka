import type { Asset, Label } from "../../lib/types";
import type { Copy, Language } from "../../lib/i18n";
import type { ProjectLayout, ProjectSaveMode } from "../../lib/project";
import { openPoligomeProjectV3, savePoligomeProjectV3 } from "../../lib/project";
import type { EditorAnnotation } from "../models/annotation-model";
import { createCanonicalDemoProject } from "../../lib/demo";
import { buildCocoExport, buildGeoJsonExport, buildYoloRows } from "../export/annotation-export";
import { importCocoToEditor } from "../import/coco-import";

export type CanonicalProject = {
  projectName: string;
  assets: Asset[];
  labels: Label[];
  annotations: EditorAnnotation[];
  layout?: ProjectLayout;
  objectUrls: string[];
  missingImages: number;
};

export async function openEditorProject(file: File, copy: Copy): Promise<CanonicalProject> {
  return openPoligomeProjectV3(file, copy);
}

export async function saveEditorProject(
  projectName: string,
  assets: Asset[],
  labels: Label[],
  annotations: EditorAnnotation[],
  mode: ProjectSaveMode,
  copy: Copy,
  layout?: ProjectLayout,
) {
  return savePoligomeProjectV3(projectName, assets, labels, annotations, mode, copy, layout);
}

export async function createEditorDemo(language: Language) {
  return createCanonicalDemoProject(language);
}

export function exportEditorCoco(assets: Asset[], labels: Label[], annotations: EditorAnnotation[]) {
  return buildCocoExport(assets, labels, annotations);
}

export function exportEditorGeoJson(assets: Asset[], labels: Label[], annotations: EditorAnnotation[]) {
  return buildGeoJsonExport(assets, labels, annotations);
}

export function exportEditorYoloRows(assets: Asset[], labels: Label[], annotations: EditorAnnotation[]) {
  return buildYoloRows(assets, labels, annotations);
}

export function importEditorCoco(
  document: unknown,
  assets: Asset[],
  labels: Label[],
  options?: Parameters<typeof importCocoToEditor>[3],
) {
  return importCocoToEditor(document, assets, labels, options);
}
