"use client";

import type { Asset, Label } from "../../lib/types";
import type { Copy, Language } from "../../lib/i18n";
import type { EditorAnnotation } from "../models/annotation-model";
import { buildQualitySummary } from "./quality-review-model";

function ScoreButtons({ value, onChange, label }: { value?: number; onChange: (score: number) => void; label: string }) {
  return <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }} aria-label={label}>
    {[1, 2, 3, 4, 5].map((score) => <button
      key={score}
      type="button"
      aria-label={`${label}: ${score} de 5`}
      aria-pressed={value === score}
      onClick={() => onChange(score)}
      style={{ fontSize: 18, opacity: score <= (value ?? 0) ? 1 : .35 }}
    >★</button>)}
    <small style={{ opacity: .7 }}>{value ? `${value}/5` : "sem nota"}</small>
  </div>;
}

export function QualityReviewPanel({
  mode,
  assets,
  labels,
  annotations,
  activeAsset,
  activeAnnotation,
  activeLabelId,
  copy,
  language,
  onModeChange,
  onActiveLabelChange,
  onAssetReview,
  onAnnotationReview,
  onLabelReview,
}: {
  mode: "quality" | "review";
  assets: Asset[];
  labels: Label[];
  annotations: EditorAnnotation[];
  activeAsset: Asset | null;
  activeAnnotation: EditorAnnotation | null;
  activeLabelId: string;
  copy: Copy;
  language: Language;
  onModeChange: (mode: "quality" | "review") => void;
  onActiveLabelChange: (id: string) => void;
  onAssetReview: (score: number) => void;
  onAnnotationReview: (score: number) => void;
  onLabelReview: (score: number) => void;
}) {
  const quality = buildQualitySummary(assets, labels, annotations);
  const activeLabel = labels.find((label) => label.id === activeLabelId) ?? labels[0] ?? null;
  const panelStyle = { border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "var(--paper)" } as const;
  const sectionStyle = { display: "grid", gap: 7, borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 } as const;

  return <aside style={{ ...panelStyle, marginTop: 10 }} aria-label={`${copy.quality} / ${copy.reviewTab}`}>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button type="button" aria-pressed={mode === "quality"} onClick={() => onModeChange("quality")}>{copy.quality}</button>
      <button type="button" aria-pressed={mode === "review"} onClick={() => onModeChange("review")}>{copy.reviewTab}</button>
    </div>

    {mode === "quality" ? <div>
      <section style={sectionStyle}>
        <b>{copy.qualityBalanceByImage}</b>
        <small>{copy.qualityInstancesPerImage.replace("{min}", String(quality.minPerImage)).replace("{max}", String(quality.maxPerImage))}</small>
        {quality.perImage.map(({ item, count }) => <div key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(100px, 1fr) 3fr auto", gap: 8, alignItems: "center" }}>
          <span title={item.name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
          <i style={{ height: 6, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}><em style={{ display: "block", width: `${quality.maxPerImage ? count / quality.maxPerImage * 100 : 0}%`, height: "100%", background: "currentColor" }} /></i>
          <b>{count}</b>
        </div>)}
      </section>

      <section style={sectionStyle}>
        <b>{copy.qualityClassBalance}</b>
        {quality.counts.map(({ label, count }) => <div key={label.id} style={{ display: "grid", gridTemplateColumns: "12px minmax(100px, 1fr) auto auto", gap: 8, alignItems: "center" }}>
          <i style={{ width: 10, height: 10, borderRadius: 999, background: label.color }} />
          <span>{label.name}</span>
          <b>{count}</b>
          <small>{count === quality.maxCount && count > 0 ? copy.qualityMajority : count <= Math.max(1, quality.maxCount * .25) ? copy.qualityMinority : copy.qualityBalanced}</small>
        </div>)}
      </section>

      <section style={sectionStyle}>
        <b>{copy.qualitySegmentationArea}</b>
        <small>{copy.qualitySegmentationHint}</small>
        {quality.counts.map(({ label }) => <div key={`${label.id}-area`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <i style={{ width: 10, height: 10, borderRadius: 999, background: label.color }} />
          <span style={{ flex: 1 }}>{label.name}</span>
          <b>{Math.round(quality.areas.get(label.id) ?? 0).toLocaleString(language === "pt" ? "pt-BR" : language)} px²</b>
        </div>)}
      </section>

      <section style={sectionStyle}>
        <b>{copy.qualitySuggestedClasses}</b>
        {quality.emptyLabelIds.length ? <p>{copy.qualityEmptyClasses.replace("{classes}", quality.emptyLabelIds.map((id) => labels.find((label) => label.id === id)?.name ?? id).join(", "))}</p>
          : <p>{quality.emptyAssetIds.length ? copy.qualityImagesWithoutInstances : copy.qualityNoClassSuggestion}</p>}
      </section>
    </div> : <div>
      <section style={sectionStyle}>
        <b>{copy.reviewImage}</b>
        <small>{activeAsset?.name ?? copy.reviewSelectImage}</small>
        <ScoreButtons label={copy.reviewImageScore} value={activeAsset?.reviewScore} onChange={onAssetReview} />
      </section>
      <section style={sectionStyle}>
        <b>{copy.reviewAnnotation}</b>
        <small>{activeAnnotation ? `${labels.find((label) => label.id === activeAnnotation.label)?.name ?? activeAnnotation.label} · ${activeAnnotation.type}` : copy.reviewSelectAnnotation}</small>
        <ScoreButtons label={copy.reviewAnnotationScore} value={activeAnnotation?.reviewScore} onChange={onAnnotationReview} />
      </section>
      <section style={sectionStyle}>
        <b>{copy.reviewClass}</b>
        <select aria-label={copy.reviewSelectClass} value={activeLabel?.id ?? ""} onChange={(event) => onActiveLabelChange(event.target.value)} disabled={!labels.length}>
          {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
        </select>
        <ScoreButtons label={copy.reviewClassScore} value={activeLabel?.reviewScore} onChange={onLabelReview} />
      </section>
      <p style={{ fontSize: 12, opacity: .7 }}>{copy.reviewHint}</p>
    </div>}
  </aside>;
}
