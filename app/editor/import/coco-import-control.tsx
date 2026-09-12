"use client";

import { useMemo, useRef, useState } from "react";
import type { Asset, Label } from "../../lib/types";
import { getCopy, storedLanguage, type Language } from "../../lib/i18n";
import { translateErrorCode } from "../../lib/error-message";
import type { EditorAnnotation } from "../models/annotation-model";
import type { CocoGeometry } from "./coco-import";
import {
  importCocoDocument,
  planCocoDocument,
  type CocoDocumentInput,
  type CocoDocumentPlan,
} from "./coco-document-import";

type PendingCoco = {
  file: File;
  document: CocoDocumentInput;
  plan: CocoDocumentPlan;
};

export function CocoImportControl({
  assets,
  labels,
  annotations,
  makeId,
  language,
  disabled = false,
  onImported,
}: {
  assets: Asset[];
  labels: Label[];
  annotations: EditorAnnotation[];
  makeId: (prefix: string) => string;
  language?: Language;
  disabled?: boolean;
  onImported: (result: { labels: Label[]; annotations: EditorAnnotation[]; message: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingCoco | null>(null);
  const [geometryTypes, setGeometryTypes] = useState<CocoGeometry[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [tab, setTab] = useState<"categories" | "annotations">("categories");
  const copy = getCopy(language ?? storedLanguage());

  const visibleCandidates = useMemo(() => pending?.plan.candidates.filter((candidate) =>
    candidate.geometries.some((geometry) => geometryTypes.includes(geometry)),
  ) ?? [], [geometryTypes, pending]);

  async function inspectFile(file: File) {
    setBusy(true);
    try {
      const document = JSON.parse(await file.text()) as CocoDocumentInput;
      const plan = planCocoDocument(document, assets, { unlabeledName: copy.unlabeled });
      if (!plan.candidates.length) {
        onImported({ labels, annotations, message: copy.noCategoriesSelected });
        return;
      }
      setPending({ file, document, plan });
      setGeometryTypes(plan.geometryTypes);
      setSelectedIndexes(plan.candidates.map((candidate) => candidate.index));
      setTab("categories");
    } catch (error) {
      onImported({
        labels,
        annotations,
        message: translateErrorCode(error, copy, copy.projectOpenError),
      });
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setPending(null);
    setGeometryTypes([]);
    setSelectedIndexes([]);
    setTab("categories");
  }

  function toggleGeometry(geometry: CocoGeometry) {
    const enabled = geometryTypes.includes(geometry);
    const affected = pending?.plan.candidates.filter((candidate) => candidate.geometries.includes(geometry)).map((candidate) => candidate.index) ?? [];
    if (enabled) {
      setGeometryTypes((items) => items.filter((item) => item !== geometry));
      setSelectedIndexes((items) => items.filter((index) => !affected.includes(index)));
    } else {
      setGeometryTypes((items) => [...items, geometry]);
      setSelectedIndexes((items) => Array.from(new Set([...items, ...affected])));
    }
  }

  function toggleCandidate(index: number) {
    setSelectedIndexes((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items, index]);
  }

  function importSelected() {
    if (!pending || !selectedIndexes.length || !geometryTypes.length) return;
    const result = importCocoDocument(pending.document, assets, labels, makeId, {
      selectedAnnotationIndexes: selectedIndexes,
      geometryTypes,
      unlabeledName: copy.unlabeled,
    });
    onImported({
      labels: result.labels,
      annotations: [...annotations, ...result.annotations],
      message: `${result.imported} ${copy.annotationsToLoad}${result.unmatched ? ` · ${result.unmatched}` : ""}.`,
    });
    close();
  }

  const geometryLabel = (geometry: CocoGeometry) => geometry === "box" ? copy.box : geometry === "point" ? copy.point : copy.polygon;

  return <>
    <input
      ref={inputRef}
      type="file"
      accept="application/json,.json"
      hidden
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void inspectFile(file);
        event.currentTarget.value = "";
      }}
    />
    <button onClick={() => inputRef.current?.click()} disabled={disabled || busy || !assets.length}>
      {busy ? `${copy.progress}…` : "COCO"}
    </button>

    {pending && <div role="dialog" aria-modal="true" aria-label={copy.chooseAnnotations} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <section style={{ width: "min(720px, 100%)", maxHeight: "80vh", overflow: "auto", background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, boxShadow: "0 18px 48px rgba(0,0,0,.25)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div><strong>{copy.chooseAnnotations}</strong><div style={{ fontSize: 13, opacity: .72, marginTop: 4 }}>{copy.chooseAnnotationsHint}</div><div style={{ fontSize: 12, opacity: .6, marginTop: 2 }}>{pending.file.name}</div></div>
          <button type="button" onClick={close}>{copy.cancel}</button>
        </header>

        <div style={{ display: "flex", gap: 6, margin: "14px 0 10px" }}>
          <button type="button" aria-pressed={tab === "categories"} onClick={() => setTab("categories")}>{copy.annotationCategories}</button>
          <button type="button" aria-pressed={tab === "annotations"} onClick={() => setTab("annotations")}>{copy.annotations} ({visibleCandidates.length})</button>
        </div>

        {tab === "categories" ? <>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={() => { setGeometryTypes(pending.plan.geometryTypes); setSelectedIndexes(pending.plan.candidates.map((candidate) => candidate.index)); }}>{copy.selectAllCategories}</button>
            <button type="button" onClick={() => { setGeometryTypes([]); setSelectedIndexes([]); }}>{copy.clearClassSelection}</button>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {pending.plan.geometryTypes.map((geometry) => {
              const checked = geometryTypes.includes(geometry);
              const count = pending.plan.candidates.filter((candidate) => candidate.geometries.includes(geometry)).length;
              return <button type="button" key={geometry} aria-pressed={checked} onClick={() => toggleGeometry(geometry)} style={{ textAlign: "left", padding: 10, fontWeight: checked ? 700 : 400 }}>
                {checked ? "✓ " : "○ "}{geometryLabel(geometry)} · {count} {copy.annotationsToLoad}
              </button>;
            })}
          </div>
        </> : <>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={() => setSelectedIndexes((items) => Array.from(new Set([...items, ...visibleCandidates.map((candidate) => candidate.index)])))}>{copy.selectAllAnnotations}</button>
            <button type="button" onClick={() => setSelectedIndexes((items) => items.filter((index) => !visibleCandidates.some((candidate) => candidate.index === index)))}>{copy.clearAnnotationSelection}</button>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {visibleCandidates.map((candidate) => {
              const checked = selectedIndexes.includes(candidate.index);
              const geometries = candidate.geometries.filter((geometry) => geometryTypes.includes(geometry));
              return <button type="button" key={candidate.index} aria-pressed={checked} onClick={() => toggleCandidate(candidate.index)} style={{ textAlign: "left", padding: 10, fontWeight: checked ? 700 : 400 }}>
                {checked ? "✓ " : "○ "}<strong>{candidate.labelName}</strong> · {candidate.imageName} · {geometries.map(geometryLabel).join(" + ")}
              </button>;
            })}
            {!visibleCandidates.length && <div style={{ padding: 12, opacity: .7 }}>{copy.noCategoriesSelected}</div>}
          </div>
        </>}

        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={close}>{copy.cancel}</button>
          <button type="button" disabled={!selectedIndexes.length || !geometryTypes.length} onClick={importSelected}>{copy.importSelectedAnnotations}</button>
        </footer>
      </section>
    </div>}
  </>;
}
