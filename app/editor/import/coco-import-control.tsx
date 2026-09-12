"use client";

import { useRef, useState } from "react";
import type { Asset, Label } from "../../lib/types";
import type { EditorAnnotation } from "../models/annotation-model";
import { importCocoDocument, type CocoDocumentInput } from "./coco-document-import";

export function CocoImportControl({
  assets,
  labels,
  annotations,
  makeId,
  disabled = false,
  onImported,
}: {
  assets: Asset[];
  labels: Label[];
  annotations: EditorAnnotation[];
  makeId: (prefix: string) => string;
  disabled?: boolean;
  onImported: (result: { labels: Label[]; annotations: EditorAnnotation[]; message: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function importFile(file: File) {
    setBusy(true);
    try {
      const document = JSON.parse(await file.text()) as CocoDocumentInput;
      const result = importCocoDocument(document, assets, labels, makeId);
      onImported({
        labels: result.labels,
        annotations: [...annotations, ...result.annotations],
        message: `${result.imported} anotação(ões) COCO importada(s)${result.unmatched ? `; ${result.unmatched} não correspondida(s)` : ""}.`,
      });
    } catch (error) {
      onImported({
        labels,
        annotations,
        message: error instanceof Error ? `Falha no COCO: ${error.message}` : "Falha ao ler COCO JSON.",
      });
    } finally {
      setBusy(false);
    }
  }

  return <>
    <input
      ref={inputRef}
      type="file"
      accept="application/json,.json"
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void importFile(file);
        event.currentTarget.value = "";
      }}
    />
    <button onClick={() => inputRef.current?.click()} disabled={disabled || busy || !assets.length}>
      {busy ? "Importando COCO…" : "Importar COCO"}
    </button>
  </>;
}
