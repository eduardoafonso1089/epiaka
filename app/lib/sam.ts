import { contours } from "d3-contour";
import { fill } from "./i18n";
import { EDITOR_HEIGHT, EDITOR_WIDTH, polygonArea } from "./geometry";
import type { Copy } from "./i18n";
import type { Asset, SamPrompt } from "./types";

type SamResponse = Record<string, unknown>;

function readDataUrl(blob: Blob, copy: Copy) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(copy.errSamReadImage));
    reader.readAsDataURL(blob);
  });
}

/**
 * SAM receives the whole image embedded in the request body, and that happens on every point
 * the user clicks. A COG crop at the 12 MP limit becomes 34 MB of base64 per call — measured.
 * The model resizes the input to 1024 px anyway, so sending more than that is pure waste of
 * network time.
 */
const SAM_LADO_MAX = 1600;

type ImagemParaSam = { url: string; largura: number; altura: number };

function carregaImagem(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const imagem = new Image();
    imagem.crossOrigin = "anonymous";
    imagem.onload = () => resolve(imagem);
    imagem.onerror = () => reject(new Error("falha ao carregar a imagem"));
    imagem.src = src;
  });
}

async function assetAsDataUrl(asset: Asset, copy: Copy): Promise<ImagemParaSam> {
  const largura = asset.width ?? EDITOR_WIDTH;
  const altura = asset.height ?? EDITOR_HEIGHT;
  const fator = Math.min(1, SAM_LADO_MAX / Math.max(largura, altura));

  if (fator >= 1) {
    // Already fits: keeping the original bytes avoids re-encoding and losing quality for nothing.
    if (asset.src.startsWith("data:")) return { url: asset.src, largura, altura };
    const response = await fetch(asset.src);
    if (!response.ok) throw new Error(copy.errSamPrepareImage);
    return { url: await readDataUrl(await response.blob(), copy), largura, altura };
  }

  try {
    const imagem = await carregaImagem(asset.src);
    const alvoLargura = Math.max(1, Math.round(imagem.naturalWidth * fator));
    const alvoAltura = Math.max(1, Math.round(imagem.naturalHeight * fator));
    const tela = document.createElement("canvas");
    tela.width = alvoLargura;
    tela.height = alvoAltura;
    const contexto = tela.getContext("2d");
    if (!contexto) throw new Error("sem contexto 2D");
    contexto.drawImage(imagem, 0, 0, alvoLargura, alvoAltura);
    // JPEG because the destination is a vision model, not a user file: at 0.9 the artefact
    // stays below what SAM's own internal resizing introduces.
    return { url: tela.toDataURL("image/jpeg", 0.9), largura: alvoLargura, altura: alvoAltura };
  } catch {
    // Canvas tainted by a cross-origin image, or a browser with no 2D: send the original.
    // It is slow, but it works.
    const response = await fetch(asset.src);
    if (!response.ok) throw new Error(copy.errSamPrepareImage);
    return { url: await readDataUrl(await response.blob(), copy), largura, altura };
  }
}

function flattenPolygon(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  if (typeof value[0] === "number") return value.map(Number);
  if (Array.isArray(value[0])) {
    const nested = value as unknown[][];
    if (nested.length && nested[0].length === 2 && typeof nested[0][0] === "number") {
      return nested.flat().map(Number);
    }
    return flattenPolygon(nested[0]);
  }
  if (typeof value[0] === "object" && value[0]) {
    const points = value as Array<{ x?: unknown; y?: unknown }>;
    if (points.every((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))) {
      return points.flatMap((point) => [Number(point.x), Number(point.y)]);
    }
  }
  return null;
}

function simplify(points: number[], tolerance = 2.2) {
  if (points.length <= 12) return points;
  const result: number[] = [];
  for (let index = 0; index < points.length; index += 2) {
    const previousX = result.at(-2);
    const previousY = result.at(-1);
    if (previousX === undefined || previousY === undefined || Math.hypot(points[index] - previousX, points[index + 1] - previousY) >= tolerance) {
      result.push(points[index], points[index + 1]);
    }
  }
  return result.length >= 6 ? result : points;
}

function matrixToPolygon(mask: unknown[][]) {
  const height = mask.length;
  const width = Array.isArray(mask[0]) ? mask[0].length : 0;
  if (!width || !height) return null;
  const values = mask.flatMap((row) => row.map((value) => Number(value) > 0.5 ? 1 : 0));
  const geometry = contours().size([width, height]).thresholds([0.5])(values)[0];
  if (!geometry?.coordinates.length) return null;
  const rings = geometry.coordinates.flatMap((polygon) => polygon);
  const candidates = rings.map((ring) => ring.flatMap(([x, y]) => [x, y]));
  return candidates.sort((a, b) => polygonArea(b) - polygonArea(a))[0] ?? null;
}

function normalizePolygon(points: number[], width: number, height: number) {
  const maxX = Math.max(...points.filter((_, index) => index % 2 === 0));
  const maxY = Math.max(...points.filter((_, index) => index % 2 === 1));
  const normalized = maxX <= 1.5 && maxY <= 1.5;
  return simplify(points.map((coordinate, index) => {
    if (normalized) return coordinate * (index % 2 ? EDITOR_HEIGHT : EDITOR_WIDTH);
    return coordinate * (index % 2 ? EDITOR_HEIGHT / height : EDITOR_WIDTH / width);
  })).map((coordinate, index) => Math.max(0, Math.min(index % 2 ? EDITOR_HEIGHT : EDITOR_WIDTH, coordinate)));
}

function parseResponse(body: SamResponse, width: number, height: number, copy: Copy) {
  const data = (body.data && typeof body.data === "object" ? body.data : body) as SamResponse;
  const masks = data.masks as unknown[] | undefined;
  const candidates = [data.polygon, data.polygons, data.contour, data.contours, masks?.[0]];
  for (const candidate of candidates) {
    const direct = flattenPolygon(candidate);
    if (direct && direct.length >= 6) return normalizePolygon(direct, width, height);
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const objectCandidate = candidate as SamResponse;
      const nested = flattenPolygon(objectCandidate.polygon ?? objectCandidate.segmentation ?? objectCandidate.points);
      if (nested && nested.length >= 6) return normalizePolygon(nested, width, height);
    }
  }
  const maskCandidate = data.mask ?? masks?.[0];
  if (Array.isArray(maskCandidate) && Array.isArray(maskCandidate[0])) {
    const polygon = matrixToPolygon(maskCandidate as unknown[][]);
    if (polygon) return normalizePolygon(polygon, (maskCandidate[0] as unknown[]).length, maskCandidate.length);
  }
  throw new Error(copy.errSamNoPolygon);
}

export async function requestSamMask({ endpoint, asset, prompts, copy }: { endpoint: string; asset: Asset; prompts: SamPrompt[]; copy: Copy }) {
  // The dimensions come from what was actually sent: if the image was downscaled, the points
  // and the polygon coming back have to speak in its scale, otherwise the mask is offset.
  const { url: image, largura: width, altura: height } = await assetAsDataUrl(asset, copy);
  const pointCoords = prompts.map((prompt) => [prompt.x / EDITOR_WIDTH * width, prompt.y / EDITOR_HEIGHT * height]);
  const pointLabels = prompts.map((prompt) => prompt.label);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image,
        point_coords: pointCoords,
        point_labels: pointLabels,
        points: pointCoords.map(([x, y], index) => ({ x, y, label: pointLabels[index] })),
        multimask_output: false,
        return_format: "polygon",
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(fill(copy.errSamHttp, { status: response.status }));
    return parseResponse(await response.json() as SamResponse, width, height, copy);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(copy.errSamTimeout);
    }
    if (error instanceof TypeError) {
      throw new Error(copy.errSamUnreachable);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
