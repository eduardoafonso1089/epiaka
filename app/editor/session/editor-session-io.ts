import type { Asset, Label } from "../../lib/types";
import type { Copy, Language } from "../../lib/i18n";
import type { ProjectLayout, ProjectSaveMode } from "../../lib/project";
import { openPoligomeProjectV4, savePoligomeProjectV4 } from "../../lib/project";
import type { EditorAnnotation } from "../models/annotation-model";
import { createCanonicalDemoProject } from "../../lib/demo";
import { annotationToCoco, annotationToGeoJsonGeometry, annotationToYolo, type GeoPointProjector } from "../export/annotation-export";
import { cocoAnnotationToEditor, cocoGeometryTypes, type CocoAnnotationInput, type CocoImportContext } from "../import/coco-import";

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
  return openPoligomeProjectV4(file, copy);
}

export async function saveEditorProject(projectName: string, assets: Asset[], labels: Label[], annotations: EditorAnnotation[], mode: ProjectSaveMode, copy: Copy, layout?: ProjectLayout) {
  return savePoligomeProjectV4(projectName, assets, labels, annotations, mode, copy, layout);
}

export async function createEditorDemo(language: Language) {
  return createCanonicalDemoProject(language);
}

export function editorAnnotationsToCoco(assets: Asset[], labels: Label[], annotations: EditorAnnotation[]) {
  return annotations.map((annotation, index) => annotationToCoco(annotation, index, assets, labels));
}

export function editorAnnotationToYolo(annotation: EditorAnnotation, labels: Label[], asset: Asset) {
  return annotationToYolo(annotation, labels, asset);
}

export function editorAnnotationToGeoJson(annotation: EditorAnnotation, project: GeoPointProjector) {
  return annotationToGeoJsonGeometry(annotation, project);
}

export function importEditorCocoAnnotation(input: CocoAnnotationInput, context: CocoImportContext) {
  return cocoAnnotationToEditor(input, context);
}

export function editorCocoGeometryTypes(input: CocoAnnotationInput) {
  return cocoGeometryTypes(input);
}
