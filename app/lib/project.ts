import JSZip from "jszip";
import { downloadBlob } from "./exporters";
import { fill } from "./i18n";
import type { Copy } from "./i18n";
import type { Annotation, Asset, Label } from "./types";
import type { EditorAnnotation } from "../editor/models/annotation-model";
import { fromLegacyAnnotations, toLegacyAnnotations } from "../editor/models/legacy-annotation-adapter";

type PortableAsset = Omit<Asset, "src" | "local"> & {
  bundled_path?: string;
  source?: string;
};

export type ProjectSaveMode = "annotations" | "complete";
export type ProjectLayout = {
  leftPanelWidth: number;
  rightPanelWidth: number;
};

type ProjectManifest = {
  format: "poligome-project";
  version: 3;
  project_name: string;
  saved_at: string;
  assets: PortableAsset[];
  labels: Label[];
  annotations: EditorAnnotation[];
  layout?: {
    left_panel_width: number;
    right_panel_width: number;
  };
};

export type LoadedPoligomeProject = {
  projectName: string;
  assets: Asset[];
  labels: Label[];
  annotations: Annotation[];
  layout?: ProjectLayout;
  objectUrls: string[];
  missingImages: number;
};

function safeBaseName(name: string) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "poligome-project";
}

function safeFileName(name: string, fallback: string) {
  const clean = name.replace(/[\\/:*?"<>|]+/g, "-").replace(/^\.+/, "").trim();
  return clean || fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseLayout(value: unknown): ProjectManifest["layout"] {
  if (!isObject(value)) return undefined;
  const left = value.left_panel_width;
  const right = value.right_panel_width;
  if (!isFiniteNumber(left) || !isFiniteNumber(right)) return undefined;
  return {
    left_panel_width: Math.round(left),
    right_panel_width: Math.round(right),
  };
}

function validVertex(value: unknown) {
  return isObject(value) && typeof value.id === "string" && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function validAnnotation(value: unknown): value is EditorAnnotation {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.asset !== "string" || typeof value.label !== "string") return false;
  if (value.type === "point") return isFiniteNumber(value.x) && isFiniteNumber(value.y);
  if (value.type === "box") {
    return isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.width) && isFiniteNumber(value.height) &&
      (value.rotation === undefined || isFiniteNumber(value.rotation));
  }
  if (value.type === "line") return Array.isArray(value.vertices) && value.vertices.length >= 2 && value.vertices.every(validVertex);
  if (value.type === "polygon") {
    return Array.isArray(value.vertices) && value.vertices.length >= 3 && value.vertices.every(validVertex) &&
      Array.isArray(value.holes) && value.holes.every((hole) => Array.isArray(hole) && hole.length >= 3 && hole.every(validVertex));
  }
  return false;
}

function parseManifest(value: unknown, copy: Copy): ProjectManifest {
  // V3 is intentionally strict. Older project manifests are not migrated here anymore;
  // compatibility code belongs outside the current editor architecture.
  if (!isObject(value) || value.format !== "poligome-project" || value.version !== 3) {
    throw new Error(copy.errProjectFormat);
  }
  if (typeof value.project_name !== "string" || !Array.isArray(value.assets) || !Array.isArray(value.labels) || !Array.isArray(value.annotations)) {
    throw new Error(copy.errProjectIncomplete);
  }

  const assets = value.assets.filter((item): item is PortableAsset =>
    isObject(item) && typeof item.id === "string" && typeof item.name === "string" &&
    (typeof item.bundled_path === "string" || typeof item.source === "string" || item.missing === true),
  );
  const labels = value.labels.filter((item): item is Label =>
    isObject(item) && typeof item.id === "string" && typeof item.name === "string" && typeof item.color === "string" && typeof item.key === "string",
  );
  const annotations = value.annotations.filter(validAnnotation);

  if (!assets.length || !labels.length) throw new Error(copy.errProjectEmpty);
  const assetIds = new Set(assets.map((item) => item.id));
  const labelIds = new Set(labels.map((item) => item.id));
  return {
    format: "poligome-project",
    version: 3,
    project_name: value.project_name.trim() || copy.defaultProjectName,
    saved_at: typeof value.saved_at === "string" ? value.saved_at : new Date().toISOString(),
    assets,
    labels,
    annotations: annotations.filter((item) => assetIds.has(item.asset) && labelIds.has(item.label)),
    layout: parseLayout(value.layout),
  };
}

export async function savePoligomeProject(projectName: string, assets: Asset[], labels: Label[], annotations: Annotation[], mode: ProjectSaveMode, copy: Copy, layout?: ProjectLayout) {
  const zip = new JSZip();
  const portableAssets = await Promise.all(assets.map(async (asset, index): Promise<PortableAsset> => {
    const { src, local, ...metadata } = asset;
    if (mode === "annotations" || asset.missing) return { ...metadata, missing: true };
    const shouldBundle = Boolean(asset.local || src.startsWith("blob:") || src.startsWith("data:"));
    void local;
    if (!shouldBundle) return { ...metadata, source: src };

    const response = await fetch(src);
    if (!response.ok) throw new Error(fill(copy.errProjectReadImage, { name: asset.name }));
    const imageBlob = await response.blob();
    const imagePath = `images/${String(index + 1).padStart(4, "0")}-${safeFileName(asset.name, `image-${index + 1}`)}`;
    zip.file(imagePath, imageBlob);
    return { ...metadata, bundled_path: imagePath };
  }));

  const manifest: ProjectManifest = {
    format: "poligome-project",
    version: 3,
    project_name: projectName.trim() || copy.defaultProjectName,
    saved_at: new Date().toISOString(),
    assets: portableAssets,
    labels,
    annotations: fromLegacyAnnotations(annotations),
    layout: layout ? {
      left_panel_width: Math.round(layout.leftPanelWidth),
      right_panel_width: Math.round(layout.rightPanelWidth),
    } : undefined,
  };
  zip.file("project.json", JSON.stringify(manifest, null, 2));
  const archive = await zip.generateAsync({ type: "blob", compression: "STORE", mimeType: "application/vnd.poligome.project+zip" });
  const fileName = `${safeBaseName(manifest.project_name)}.plgm`;
  downloadBlob(fileName, archive);
  return fileName;
}

export async function openPoligomeProject(file: File, copy: Copy): Promise<LoadedPoligomeProject> {
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file("project.json");
  if (!manifestEntry) throw new Error(copy.errProjectManifest);
  const manifest = parseManifest(JSON.parse(await manifestEntry.async("string")) as unknown, copy);
  const objectUrls: string[] = [];

  try {
    const assets = await Promise.all(manifest.assets.map(async (asset): Promise<Asset> => {
      const { bundled_path: bundledPath, source, ...metadata } = asset;
      if (bundledPath) {
        const imageEntry = zip.file(bundledPath);
        if (!imageEntry) throw new Error(fill(copy.errProjectImageMissing, { name: asset.name }));
        const imageBlob = await imageEntry.async("blob");
        const src = URL.createObjectURL(imageBlob);
        objectUrls.push(src);
        return { ...metadata, src, local: true, missing: false, byteSize: metadata.byteSize ?? imageBlob.size };
      }
      if (asset.missing) return { ...metadata, src: "", local: true, missing: true };
      if (!source || source === "local") throw new Error(fill(copy.errProjectImageNotBundled, { name: asset.name }));
      return { ...metadata, src: source, local: false };
    }));
    return {
      projectName: manifest.project_name,
      assets,
      labels: manifest.labels,
      // Temporary boundary while legacy-page.tsx is being retired. Project V3 itself no
      // longer stores flat points and no longer accepts V2 manifests.
      annotations: toLegacyAnnotations(manifest.annotations),
      layout: manifest.layout ? {
        leftPanelWidth: manifest.layout.left_panel_width,
        rightPanelWidth: manifest.layout.right_panel_width,
      } : undefined,
      objectUrls,
      missingImages: assets.filter((asset) => asset.missing).length,
    };
  } catch (error) {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  }
}
