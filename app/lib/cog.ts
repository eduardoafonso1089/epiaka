// Reading GeoTIFF/COG and generating crops for the annotator.
//
// The annotator works on an <img> in a 1000 × 650 space. A gigapixel COG does not fit there
// for two independent reasons: the browser does not decode TIFF, and the bitmap would not
// fit in memory. The way out is not to try: the COG is read by tiles only so the user can
// choose the region, and what enters the annotator is a crop of that region, already PNG and
// size-limited. With that, every existing tool — including SAM, which sends the whole image
// as a data URL — keeps working unchanged.
//
// The price is keeping the reference: origin, scale and the cropped window. It is what maps
// the annotation back to a pixel of the original file and to a ground coordinate.

import type { GeoRef } from "./types";

/** A crop larger than this does not help: the annotator draws in a 1000 × 650 space, and
 *  SAM receives the whole image as a data URL. Beyond that only memory and latency grow. */
export const RECORTE_LADO_MAX = 4096;
export const RECORTE_MP_MAX = 12;

export type MetadadosCog = {
  largura: number;
  altura: number;
  bandas: number;
  crs: string;
  origemX: number;
  origemY: number;
  escalaX: number;
  escalaY: number;
  larguraTile: number;
  alturaTile: number;
  overviews: number;
  /** Indices of the IFDs that are real images, from finest to coarsest. */
  niveis: number[];
  tiled: boolean;
  semDado: number | null;
  /** Possible values: "sim" | "tiled, sem overviews" | "não — por faixas" */
  perfil: string;
};

/** Only the first 4 bytes. A File gives slice, a URL gives a range request: it is the
 *  cheapest possible check and avoids handing error HTML to the TIFF reader, which hangs
 *  trying to interpret random bytes. */
export async function primeirosBytes(origem: File | string) {
  if (typeof origem !== "string") {
    return new Uint8Array(await origem.slice(0, 4).arrayBuffer());
  }
  const resposta = await fetch(origem, { headers: { Range: "bytes=0-3" } });
  if (!resposta.ok) throw new Error(`O servidor respondeu HTTP ${resposta.status}.`);
  return new Uint8Array(await resposta.arrayBuffer());
}

export function assinaturaTiff(bytes: Uint8Array) {
  if (bytes.length < 4) return null;
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  const big = bytes[0] === 0x4d && bytes[1] === 0x4d;
  if (!little && !big) return null;
  const magic = little ? bytes[2] | (bytes[3] << 8) : (bytes[2] << 8) | bytes[3];
  return magic === 42 ? "TIFF" : magic === 43 ? "BigTIFF" : null;
}

export function ehArquivoTiff(nome: string, tipo?: string) {
  return /\.tiff?$/i.test(nome) || tipo === "image/tiff" || tipo === "image/x-tiff";
}

type Geotiff = Awaited<ReturnType<typeof abre>>["tiff"];
type ImagemTiff = Awaited<ReturnType<Geotiff["getImage"]>>;

/** Opens the file and returns the handle along with the metadata both screens need. */
export async function abre(origem: File | string) {
  const { fromBlob, fromUrl } = await import("geotiff");
  const tiff = typeof origem === "string" ? await fromUrl(origem) : await fromBlob(origem);
  return { tiff, imagem: await tiff.getImage(0) };
}

/**
 * A COG holds more IFDs than the pyramid levels: internal masks come in as reduced
 * resolution images, with the same dimensions as an overview. Picking one of them by mistake
 * makes the reader return "Invalid or unsupported photometric interpretation", because a
 * mask is PhotometricInterpretation 4. Bit 4 of NewSubfileType is what identifies them.
 */
function ehMascara(imagem: ImagemTiff) {
  const diretorio = (imagem as unknown as {
    fileDirectory?: { getValue?: (nome: string) => unknown } & Record<string, unknown>;
  }).fileDirectory;
  const tipo = typeof diretorio?.getValue === "function"
    ? diretorio.getValue("NewSubfileType")
    : diretorio?.NewSubfileType;
  const valor = Array.isArray(tipo) ? tipo[0] : tipo;
  return typeof valor === "number" && (valor & 4) === 4;
}

export async function leMetadados(origem: File | string): Promise<MetadadosCog & { tiff: Geotiff }> {
  const assinatura = assinaturaTiff(await primeirosBytes(origem));
  if (!assinatura) throw new Error("Os primeiros bytes não são de um TIFF: esperado II* ou MM*.");
  const { tiff, imagem } = await abre(origem);
  const total = await tiff.getImageCount();
  const niveis: number[] = [];
  for (let indice = 0; indice < total; indice += 1) {
    if (!ehMascara(await tiff.getImage(indice))) niveis.push(indice);
  }
  // In a striped TIFF geotiff.js returns the image width as the "tile", so getTileWidth()
  // does not distinguish tiled from striped. The isTiled flag is false when the file has
  // StripOffsets instead of TileWidth.
  const tiled = Boolean((imagem as unknown as { isTiled?: boolean }).isTiled);
  const [escalaX, escalaY] = imagem.getResolution() as number[];
  const origemModelo = imagem.getOrigin() as number[];
  return {
    tiff,
    largura: imagem.getWidth(),
    altura: imagem.getHeight(),
    bandas: imagem.getSamplesPerPixel(),
    crs: codigoCrs(imagem),
    origemX: origemModelo[0],
    origemY: origemModelo[1],
    escalaX: Math.abs(escalaX),
    escalaY: Math.abs(escalaY),
    larguraTile: imagem.getTileWidth(),
    alturaTile: imagem.getTileHeight(),
    overviews: Math.max(0, niveis.length - 1),
    niveis,
    tiled,
    semDado: imagem.getGDALNoData(),
    perfil: tiled && niveis.length > 1 ? "sim" : tiled ? "tiled, sem overviews" : "não — por faixas",
  };
}

function codigoCrs(imagem: ImagemTiff) {
  // geotiff.js 3.x exposes the GeoKeys through getGeoKeys(); in the 2.x versions they were
  // a `geoKeys` property of the object. Both forms are accepted.
  const alvo = imagem as unknown as {
    getGeoKeys?: () => Record<string, unknown> | null;
    geoKeys?: Record<string, unknown>;
  };
  const chaves = (typeof alvo.getGeoKeys === "function" ? alvo.getGeoKeys() : null) ?? alvo.geoKeys;
  const bruto = chaves?.ProjectedCSTypeGeoKey ?? chaves?.GeographicTypeGeoKey;
  // Some tags arrive as a single-element array.
  const codigo = Array.isArray(bruto) ? bruto[0] : bruto;
  return typeof codigo === "number" && codigo > 0 && codigo < 32767 ? `EPSG:${codigo}` : "sem CRS";
}

/**
 * Decides the crop size. The requested window can have tens of thousands of pixels; the
 * result is capped per side and per megapixel, preserving the proportion. It never scales
 * up: cropping 300 px does not produce a 4096 image.
 */
export function dimensionaRecorte(janelaLargura: number, janelaAltura: number) {
  const porLado = Math.min(1, RECORTE_LADO_MAX / Math.max(janelaLargura, janelaAltura));
  const porArea = Math.min(1, Math.sqrt(RECORTE_MP_MAX * 1e6 / (janelaLargura * janelaAltura)));
  const fator = Math.min(1, porLado, porArea);
  return {
    largura: Math.max(1, Math.round(janelaLargura * fator)),
    altura: Math.max(1, Math.round(janelaAltura * fator)),
    // How many pixels of the file fit in 1 px of the crop. 1 means native resolution.
    reducao: fator ? 1 / fator : 1,
  };
}

/**
 * Picks the coarsest pyramid level that still does not force upscaling. Reading the full
 * resolution only to downscale in software would transfer the whole file; that is exactly
 * what overviews exist to avoid.
 */
async function nivelPara(tiff: Geotiff, niveis: number[], larguraTotal: number, reducao: number) {
  let escolhido = niveis[0] ?? 0;
  let fatorEscolhido = 1;
  for (const indice of niveis) {
    const imagem = await tiff.getImage(indice);
    const fator = larguraTotal / imagem.getWidth();
    if (fator <= reducao + 1e-6 && fator > fatorEscolhido) {
      escolhido = indice;
      fatorEscolhido = fator;
    }
  }
  return { imagem: await tiff.getImage(escolhido), fator: fatorEscolhido, indice: escolhido };
}

/** Ramp for single-band images, the same as the viewer's — the crop has to come out looking
 *  like the preview, otherwise the user annotates one thing and sees another. */
function rampa(valor: number, min: number, max: number) {
  const t = max > min ? Math.min(1, Math.max(0, (valor - min) / (max - min))) : 0;
  const paradas: Array<[number, number, number]> = [[16, 22, 19], [104, 148, 124], [242, 246, 243]];
  const pos = t * (paradas.length - 1);
  const i = Math.min(paradas.length - 2, Math.floor(pos));
  const f = pos - i;
  return [
    paradas[i][0] + (paradas[i + 1][0] - paradas[i][0]) * f,
    paradas[i][1] + (paradas[i + 1][1] - paradas[i][1]) * f,
    paradas[i][2] + (paradas[i + 1][2] - paradas[i][2]) * f,
  ];
}

export type Recorte = {
  blob: Blob;
  largura: number;
  altura: number;
  geo: GeoRef;
};

/**
 * Reads the requested window and returns a PNG ready to become an annotator asset, along
 * with the reference that ties each pixel of the crop back to the file and to the ground.
 *
 * `janela` is in pixels of the original file, with y growing downwards.
 */
export async function geraRecorte(
  origem: File | string,
  nomeOrigem: string,
  janela: { x: number; y: number; w: number; h: number },
  faixaBanda?: { min: number; max: number } | null,
): Promise<Recorte> {
  const meta = await leMetadados(origem);
  const { tiff } = meta;

  // Clips against the file bounds: dragging the view outside the image is common, and
  // asking for a nonexistent pixel makes geotiff.js return garbage instead of an error.
  const x0 = Math.max(0, Math.floor(janela.x));
  const y0 = Math.max(0, Math.floor(janela.y));
  const x1 = Math.min(meta.largura, Math.ceil(janela.x + janela.w));
  const y1 = Math.min(meta.altura, Math.ceil(janela.y + janela.h));
  if (x1 <= x0 || y1 <= y0) throw new Error("A área escolhida está fora da imagem.");

  const larguraJanela = x1 - x0;
  const alturaJanela = y1 - y0;
  const alvo = dimensionaRecorte(larguraJanela, alturaJanela);
  const nivel = await nivelPara(tiff, meta.niveis, meta.largura, alvo.reducao);

  // The window has to go to the scale of the chosen level before reading.
  const janelaNivel = [
    Math.floor(x0 / nivel.fator), Math.floor(y0 / nivel.fator),
    Math.ceil(x1 / nivel.fator), Math.ceil(y1 / nivel.fator),
  ] as [number, number, number, number];

  const opcoes = {
    window: janelaNivel,
    width: alvo.largura,
    height: alvo.altura,
    resampleMethod: "bilinear" as const,
  };

  const pixels = new Uint8ClampedArray(alvo.largura * alvo.altura * 4);
  if (meta.bandas >= 3) {
    // readRGB resolves photometric on its own — including YCbCr, the dominant format in
    // drone orthophotos, which readRasters would hand back with raw Y, Cb and Cr in the three
    // channels. `interleave` defaults to false in readRGB, and without it the return is three
    // separate arrays instead of one — the loop below would read undefined and the crop would
    // come out black.
    const dados = await nivel.imagem.readRGB({
      ...opcoes, interleave: true, enableAlpha: false,
    }) as unknown as ArrayLike<number>;
    for (let i = 0, p = 0; p < pixels.length; i += 3, p += 4) {
      pixels[p] = dados[i];
      pixels[p + 1] = dados[i + 1];
      pixels[p + 2] = dados[i + 2];
      pixels[p + 3] = 255;
    }
  } else {
    const rasters = await nivel.imagem.readRasters(opcoes) as unknown as Array<ArrayLike<number>>;
    const banda = rasters[0];
    const faixa = faixaBanda ?? medeFaixa(banda, meta.semDado);
    for (let i = 0, p = 0; i < banda.length; i += 1, p += 4) {
      const valor = banda[i];
      if (!Number.isFinite(valor) || valor === meta.semDado) {
        pixels[p + 3] = 0;
        continue;
      }
      const [r, g, b] = rampa(valor, faixa.min, faixa.max);
      pixels[p] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
      pixels[p + 3] = 255;
    }
  }

  const tela = document.createElement("canvas");
  tela.width = alvo.largura;
  tela.height = alvo.altura;
  const contexto = tela.getContext("2d");
  if (!contexto) throw new Error("O navegador não forneceu um contexto de canvas 2D.");
  contexto.putImageData(new ImageData(pixels, alvo.largura, alvo.altura), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => tela.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Não foi possível gerar o PNG do recorte.");

  return {
    blob,
    largura: alvo.largura,
    altura: alvo.altura,
    geo: {
      source: nomeOrigem,
      crs: meta.crs,
      originX: meta.origemX,
      originY: meta.origemY,
      scaleX: meta.escalaX,
      scaleY: meta.escalaY,
      sourceWidth: meta.largura,
      sourceHeight: meta.altura,
      window: { x: x0, y: y0, w: larguraJanela, h: alturaJanela },
      cropWidth: alvo.largura,
      cropHeight: alvo.altura,
    },
  };
}

export function medeFaixa(valores: ArrayLike<number>, semDado: number | null) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < valores.length; i += 1) {
    const valor = valores[i];
    if (!Number.isFinite(valor) || valor === semDado) continue;
    if (valor < min) min = valor;
    if (valor > max) max = valor;
  }
  return Number.isFinite(min) && max > min ? { min, max } : { min: 0, max: 255 };
}
