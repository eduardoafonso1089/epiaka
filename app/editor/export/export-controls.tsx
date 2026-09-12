"use client";

import { useState } from "react";
import type { Asset, Label } from "../../lib/types";
import { getCopy, type Language } from "../../lib/i18n";
import type { EditorAnnotation } from "../models/annotation-model";
import { exportEditorCoco, exportEditorGeoJson, exportEditorYoloZip } from "./export-files";

export function ExportControls({
  assets,
  labels,
  annotations,
  language = "pt",
  disabled = false,
  onMessage,
}: {
  assets: Asset[];
  labels: Label[];
  annotations: EditorAnnotation[];
  language?: Language;
  disabled?: boolean;
  onMessage?: (message: string) => void;
}) {
  const [busy, setBusy] = useState<"coco" | "yolo" | "geojson" | null>(null);
  const copy = getCopy(language);

  function coco() {
    try {
      exportEditorCoco(assets, labels, annotations);
      onMessage?.(copy.toastExportFile);
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : copy.toastExportFailed);
    }
  }

  async function yolo() {
    setBusy("yolo");
    try {
      await exportEditorYoloZip(assets, labels, annotations);
      onMessage?.(copy.toastExportYolo);
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : copy.toastExportFailed);
    } finally { setBusy(null); }
  }

  function geojson() {
    try {
      exportEditorGeoJson(assets, labels, annotations);
      onMessage?.(copy.toastExportGeoJson);
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : copy.toastExportFailed);
    }
  }

  const blocked = disabled || busy !== null || !assets.length;
  return <>
    <button title={`${copy.export}: COCO · ${copy.cocoDesc}`} onClick={coco} disabled={blocked}>COCO</button>
    <button title={`${copy.export}: YOLO · ${copy.yoloDesc}`} onClick={() => void yolo()} disabled={blocked}>{busy === "yolo" ? "YOLO…" : "YOLO"}</button>
    <button title={`${copy.export}: GeoJSON · ${copy.geojsonDesc}`} onClick={geojson} disabled={blocked || !annotations.length}>GeoJSON</button>
  </>;
}
