import { rasterTransform, transformPoint } from "./georeference";
import { toWgs84 } from "./projections";
import JSZip from "jszip";
import { annotationBounds, boxCorners, polygonArea, scalePoints } from "./geometry";
import { EDITOR_HEIGHT, EDITOR_WIDTH } from "./geometry";
import type { Annotation, Asset, Label } from "./types";

function baseName(name: string, fallback: string) {
  const clean = name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "_");
  return clean || fallback;
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

export function exportCoco(assets: Asset[], labels: Label[], annotations: Annotation[]) {
  const images = assets.map((asset, index) => ({
    id: index + 1,
    file_name: asset.name,
    width: asset.width ?? 1000,
    height: asset.height ?? 650,
    ...(asset.geo ? { georeference: asset.geo } : {}),
  }));
  const categories = labels.map((label, index) => ({
    id: index + 1,
    name: label.name,
    supercategory: "object",
  }));
  const cocoAnnotations = annotations.map((annotation, index) => {
    const imageIndex = assets.findIndex((asset) => asset.id === annotation.asset);
    const categoryIndex = labels.findIndex((label) => label.id === annotation.label);
    const image = assets[imageIndex];
    const width = image?.width ?? 1000;
    const height = image?.height ?? 650;
    const bounds = annotationBounds(annotation);
    const scaledBounds = scalePoints(
      [bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height],
      width,
      height,
    );
    const segmentation = annotation.type === "polygon"
      ? [annotation.pts ?? [], ...(annotation.holes ?? [])].map((ring) => scalePoints(ring, width, height))
      : annotation.type === "box" && Math.abs(annotation.rotation ?? 0) > 0.0001
        ? [scalePoints(boxCorners(annotation), width, height)]
        : [];
    // A polyline does not enclose a region: it goes out in `line` (an extension), with area 0
    // and empty segmentation, so no consumer interprets it as a mask.
    const line = annotation.type === "line" ? scalePoints(annotation.pts ?? [], width, height) : [];
    const area = annotation.type === "polygon"
      ? polygonArea(scalePoints(annotation.pts ?? [], width, height)) - (annotation.holes ?? []).reduce((sum, ring) => sum + polygonArea(scalePoints(ring, width, height)), 0)
      : annotation.type === "line"
        ? 0
        : annotation.type === "box"
          ? (annotation.w ?? 0) * width / 1000 * (annotation.h ?? 0) * height / 650
          : (scaledBounds[2] - scaledBounds[0]) * (scaledBounds[3] - scaledBounds[1]);
    return {
      id: index + 1,
      image_id: imageIndex + 1,
      category_id: categoryIndex + 1,
      bbox: [
        scaledBounds[0],
        scaledBounds[1],
        scaledBounds[2] - scaledBounds[0],
        scaledBounds[3] - scaledBounds[1],
      ],
      segmentation,
      line,
      keypoints:
        annotation.type === "point"
          ? scalePoints([annotation.x ?? 0, annotation.y ?? 0], width, height).concat(2)
          : [],
      num_keypoints: annotation.type === "point" ? 1 : 0,
      area,
      rotation: annotation.type === "box" ? annotation.rotation ?? 0 : undefined,
      iscrowd: 0,
    };
  });
  downloadBlob(
    "poligome-coco.json",
    new Blob(
      [JSON.stringify({ info: { description: "Poligome dataset", version: "1.0" }, images, categories, annotations: cocoAnnotations }, null, 2)],
      { type: "application/json;charset=utf-8" },
    ),
  );
}

export async function exportYoloZip(assets: Asset[], labels: Label[], annotations: Annotation[], readme: string) {
  const zip = new JSZip();
  const trainCount = assets.length > 1
    ? Math.min(assets.length - 1, Math.max(1, Math.round(assets.length * 0.8)))
    : assets.length;

  for (const [imageIndex, asset] of assets.entries()) {
    if (!asset.src || asset.missing) throw new Error(`Image unavailable for YOLO export: ${asset.name}`);
    const split = imageIndex < trainCount ? "train" : "val";
    const numberedBaseName = `${String(imageIndex + 1).padStart(4, "0")}-${baseName(asset.name, `image_${imageIndex + 1}`)}`;
    const extension = asset.name.match(/\.[a-zA-Z0-9]+$/)?.[0].toLowerCase() ?? ".png";
    const lines = annotations
      .filter((annotation) => annotation.asset === asset.id)
      .flatMap((annotation) => {
        const classIndex = labels.findIndex((label) => label.id === annotation.label);
        if (annotation.type === "box") {
          // The common YOLO detection format is axis-aligned. For an oriented box we export
          // its enclosing rectangle; the exact angle remains in .plgm and COCO segmentation.
          const bounds = annotationBounds(annotation);
          const centerX = (bounds.x + bounds.width / 2) / 1000;
          const centerY = (bounds.y + bounds.height / 2) / 650;
          return [`${classIndex} ${centerX.toFixed(6)} ${centerY.toFixed(6)} ${(bounds.width / 1000).toFixed(6)} ${(bounds.height / 650).toFixed(6)}`];
        }
        if (annotation.type === "polygon") {
          const normalized = (annotation.pts ?? []).map((coordinate, index) =>
            (coordinate / (index % 2 ? 650 : 1000)).toFixed(6),
          );
          return [`${classIndex} ${normalized.join(" ")}`];
        }
        return [];
      });
    const response = await fetch(asset.src);
    if (!response.ok) throw new Error(`Could not read image for YOLO export: ${asset.name}`);
    zip.file(`images/${split}/${numberedBaseName}${extension}`, await response.arrayBuffer());
    zip.file(`labels/${split}/${numberedBaseName}.txt`, lines.join("\n"));
  }
  if (assets.some(asset => asset.geo)) zip.file("georeferences.json", JSON.stringify(assets.filter(asset => asset.geo).map(asset => ({ image: asset.name, georeference: asset.geo })), null, 2));
  zip.file("classes.txt", labels.map((label) => label.name).join("\n"));
  const validationPath = assets.length > 1 ? "images/val" : "images/train";
  zip.file(
    "data.yaml",
    `path: .\ntrain: images/train\nval: ${validationPath}\nnc: ${labels.length}\nnames:\n${labels.map((label, index) => `  ${index}: ${JSON.stringify(label.name)}`).join("\n")}\n`,
  );
  zip.file(
    "README.txt",
    `${readme}\n`,
  );
  downloadBlob("poligome-yolo.zip", await zip.generateAsync({ type: "blob" }));
}


// ---------------------------------------------------------------------------
// GeoJSON
//
// Only makes sense for an asset that came from a COG: it is its `geo` that carries the
// origin, the scale and the cropped window. Without that the annotation exists only in
// pixels, and a GeoJSON with pixel coordinates would be worse than none, because it looks
// georeferenced.
// ---------------------------------------------------------------------------

/**
 * Editor space (1000 × 650) → crop pixel → file pixel → CRS coordinate.
 * The editor's y grows downwards and the CRS's upwards; the flip happens in the last step.
 */
export function paraCoordenada(asset: Asset, x: number, y: number): [number, number] {
  const geo = asset.geo!;
  return transformPoint(rasterTransform(geo), geo.window.x + x / EDITOR_WIDTH * geo.window.w,
    geo.window.y + y / EDITOR_HEIGHT * geo.window.h);
}

function anel(asset: Asset, pontos: number[]) {
  const saida: Array<[number, number]> = [];
  for (let index = 0; index < pontos.length; index += 2) {
    const ponto = paraCoordenada(asset, pontos[index], pontos[index + 1]);
    // The double click that closes a polygon in the editor records a vertex on top of the
    // previous one. In pixels that is invisible; in a GeoJSON it becomes a zero-length
    // segment, which a geometry validator rejects.
    const ultimo = saida.at(-1);
    if (ultimo && ultimo[0] === ponto[0] && ultimo[1] === ponto[1]) continue;
    saida.push(ponto);
  }
  return saida;
}

function geometriaDe(asset: Asset, annotation: Annotation) {
  if (annotation.type === "point") {
    return { type: "Point", coordinates: paraCoordenada(asset, annotation.x ?? 0, annotation.y ?? 0) };
  }
  if (annotation.type === "box") {
    const caixa = anel(asset, boxCorners(annotation));
    return { type: "Polygon", coordinates: [[...caixa, caixa[0]]] };
  }
  const pontos = anel(asset, annotation.pts ?? []);
  if (pontos.length < 2) return null;
  if (annotation.type === "line") return { type: "LineString", coordinates: pontos };
  // A GeoJSON polygon ring has to close by repeating the first vertex.
  if (pontos.length < 3) return null;
  const holes = (annotation.holes ?? []).map((hole) => anel(asset, hole)).filter((hole) => hole.length >= 3);
  return { type: "Polygon", coordinates: [[...pontos, pontos[0]], ...holes.map((hole) => [...hole, hole[0]])] };
}

function projectGeometry(geometry: NonNullable<ReturnType<typeof geometriaDe>>, project: (p: [number, number]) => [number, number]) {
  // Geometry construction above deliberately happens in native CRS before reprojection.
  const map = (coordinates: unknown): unknown => {
    const values = coordinates as unknown[];
    return typeof values[0] === "number" ? project(values as [number, number]) : values.map(map);
  };
  const coordinates = map(geometry.coordinates);
  if (geometry.type === "Polygon") {
    (coordinates as number[][][]).forEach((ring, index) => {
      // RFC 7946: outer rings counterclockwise, inner rings clockwise.
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      if ((index === 0 && area < 0) || (index > 0 && area > 0)) ring.reverse();
    });
  }
  return { type: geometry.type, coordinates };
}

export function annotationsToGeoJson(assets: Asset[], labels: Label[], annotations: Annotation[]) {
  const assetMap = new Map(assets.map(asset => [asset.id, asset]));
  const labelMap = new Map(labels.map(label => [label.id, label]));
  const projections = new Map<string, ReturnType<typeof toWgs84>>();
  const features = annotations.map(annotation => {
    const asset = assetMap.get(annotation.asset);
    // Never silently drop annotations or emit local/projected coordinates as longitude.
    if (!asset?.geo) throw new Error('rasterMissingReference');
    const crs = asset.geo.crs;
    if (!projections.has(crs)) projections.set(crs, toWgs84(crs));
    const geometry = geometriaDe(asset, annotation);
    if (!geometry) throw new Error('rasterInvalidCoordinates');
    const label = labelMap.get(annotation.label);
    return {
      type: "Feature", geometry: projectGeometry(geometry, projections.get(crs)!),
      properties: {
        id: annotation.id, classe: label?.name ?? annotation.label, classe_id: annotation.label,
        cor: label?.color ?? null, forma: annotation.type,
        rotacao: annotation.type === "box" ? annotation.rotation ?? 0 : undefined,
        recorte: asset.name, origem: asset.geo.source, crs,
      },
    };
  });
  return { colecao: { type: "FeatureCollection", features }, crsUsados: [...projections.keys()], total: features.length, semGeo: 0 };
}

export function exportGeoJson(assets: Asset[], labels: Label[], annotations: Annotation[]) {
  const resultado = annotationsToGeoJson(assets, labels, annotations);
  downloadBlob("poligome-annotations.geojson", new Blob([JSON.stringify(resultado.colecao, null, 2)], { type: "application/geo+json;charset=utf-8" }));
  return resultado;
}
