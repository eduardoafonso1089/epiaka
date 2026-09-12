"use client";

import { useState } from "react";
import type { Asset, Label } from "../../lib/types";
import type { EditorAnnotation } from "../models/annotation-model";
import { exportEditorCoco, exportEditorGeoJson, exportEditorYoloZip } from "./export-files";

export function ExportControls({
  assets,
  labels,
  annotations,
  disabled = false,
  onMessage,
}: {
  assets: Asset[];
  labels: Label[];
  annotations: EditorAnnotation[];
  disabled?: boolean;
  onMessage?: (message: string) => void;
}) {
  const [busy, setBusy] = useState<"coco" | "yolo" | "geojson" | null>(null);

  function coco() {
    try {
      exportEditorCoco(assets, labels, annotations);
      onMessage?.("COCO exportado a partir do modelo canônico.");
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "Falha ao exportar COCO.");
    }
  }

  async function yolo() {
    setBusy("yolo");
    try {
      await exportEditorYoloZip(assets, labels, annotations);
      onMessage?.("YOLO exportado a partir do modelo canônico.");
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "Falha ao exportar YOLO.");
    } finally { setBusy(null); }
  }

  function geojson() {
    try {
      exportEditorGeoJson(assets, labels, annotations);
      onMessage?.("GeoJSON exportado em WGS84.");
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "Falha ao exportar GeoJSON.");
    }
  }

  const blocked = disabled || busy !== null || !assets.length;
  return <>
    <button onClick={coco} disabled={blocked}>COCO</button>
    <button onClick={() => void yolo()} disabled={blocked}>{busy === "yolo" ? "YOLO…" : "YOLO"}</button>
    <button onClick={geojson} disabled={blocked || !annotations.length}>GeoJSON</button>
  </>;
}
