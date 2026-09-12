"use client";

import { useRef, useState } from "react";
import type { Asset } from "../../lib/types";
import { getCopy } from "../../lib/i18n";
import { readRasterSidecars } from "../../lib/georeference";
import type { RasterReference } from "../../lib/georeference";
import type { Recorte } from "../../lib/cog";
import CogCropDialog, { ehArquivoTiff } from "../../raster/cog-crop-dialog";

type PendingRaster = {
  file: File;
  reference: RasterReference;
};

export type RasterImportResult = {
  asset: Asset;
  objectUrl: string;
  message: string;
};

export type RasterImportControlProps = {
  makeId: (prefix: string) => string;
  disabled?: boolean;
  onImported: (result: RasterImportResult) => void;
  onMessage?: (message: string) => void;
};

const RASTER_ACCEPT = [
  ".tif", ".tiff", ".geotiff", ".btf", ".tf8", ".btf8",
  ".tfw", ".tifw", ".wld", ".prj", ".aux.xml", "image/tiff",
].join(",");

function cropName(sourceName: string) {
  return `${sourceName.replace(/\.[^/.]+$/, "") || "raster"}-crop.png`;
}

export function RasterImportControl({ makeId, disabled = false, onImported, onMessage }: RasterImportControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingRaster | null>(null);
  const copy = getCopy("pt");

  async function choose(files: File[]) {
    if (!files.length) return;
    const rasters = files.filter((file) => ehArquivoTiff(file.name, file.type));
    if (rasters.length !== 1) {
      onMessage?.(rasters.length ? "Selecione um GeoTIFF/COG por vez; sidecars podem ser incluídos junto." : "Nenhum arquivo TIFF/GeoTIFF válido foi selecionado.");
      return;
    }
    try {
      const reference = await readRasterSidecars(rasters[0], files);
      setPending({ file: rasters[0], reference });
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "Falha ao ler arquivos auxiliares do raster.");
    }
  }

  function finish(recorte: Recorte, sourceName: string) {
    const objectUrl = URL.createObjectURL(recorte.blob);
    const asset: Asset = {
      id: makeId("raster"),
      name: cropName(sourceName),
      src: objectUrl,
      local: true,
      byteSize: recorte.blob.size,
      width: recorte.largura,
      height: recorte.altura,
      geo: recorte.geo,
    };
    setPending(null);
    onImported({
      asset,
      objectUrl,
      message: recorte.geo
        ? `Recorte GeoTIFF/COG adicionado: ${asset.name} (${recorte.largura}×${recorte.altura}px, ${recorte.geo.crs}).`
        : `Recorte TIFF adicionado em espaço de pixels: ${asset.name} (${recorte.largura}×${recorte.altura}px).`,
    });
  }

  return <>
    <input
      ref={inputRef}
      type="file"
      accept={RASTER_ACCEPT}
      multiple
      hidden
      onChange={(event) => {
        void choose(Array.from(event.target.files ?? []));
        event.currentTarget.value = "";
      }}
    />
    <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
      GeoTIFF / COG
    </button>
    {pending && <CogCropDialog
      origem={pending.file}
      nome={pending.file.name}
      reference={pending.reference}
      copy={copy}
      onCancelar={() => setPending(null)}
      onPronto={finish}
    />}
  </>;
}
