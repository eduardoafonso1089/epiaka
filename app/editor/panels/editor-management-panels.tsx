"use client";

import { useMemo, useState, type MouseEvent } from "react";
import type { Asset, Label } from "../../lib/types";
import { getCopy } from "../../lib/i18n";
import type { EditorAnnotation } from "../models/annotation-model";
import type { SelectionState } from "../selection/selection-model";
import { UNLABELED_ID } from "./panel-model";

type Copy = ReturnType<typeof getCopy>;

type Props = {
  assets: Asset[];
  currentAssetId: string;
  annotations: EditorAnnotation[];
  activeAssetAnnotations: EditorAnnotation[];
  labels: Label[];
  activeLabelId: string;
  selection: SelectionState;
  hiddenAnnotationIds: ReadonlySet<string>;
  hiddenLabelIds: ReadonlySet<string>;
  copy: Copy;
  onSelectAsset: (id: string) => void;
  onMoveAsset: (id: string, delta: -1 | 1) => void;
  onDeleteAsset: (id: string) => void;
  onSelectAnnotation: (id: string, modifiers: { shift: boolean; additive: boolean }) => void;
  onMoveAnnotation: (id: string, delta: -1 | 1) => void;
  onDeleteAnnotations: (ids: string[]) => void;
  onToggleAnnotationVisibility: (id: string) => void;
  onToggleLabelVisibility: (id: string) => void;
  onSelectAllAnnotations: () => void;
  onClearAnnotationSelection: () => void;
  onActiveLabelChange: (id: string) => void;
  onBatchReclassify: (ids: string[], labelId: string) => void;
  onCreateLabel: (name: string, color: string) => void;
  onRenameLabel: (id: string, name: string) => void;
  onRecolorLabel: (id: string, color: string) => void;
  onDeleteLabel: (id: string) => void;
};

const panelStyle = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 10,
  background: "var(--paper)",
  minWidth: 0,
} as const;

const listStyle = {
  display: "grid",
  gap: 4,
  maxHeight: 260,
  overflow: "auto",
  marginTop: 8,
} as const;

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto auto auto",
  gap: 4,
  alignItems: "center",
} as const;

function stop(event: MouseEvent) {
  event.stopPropagation();
}

export function EditorManagementPanels(props: Props) {
  const {
    assets, currentAssetId, annotations, activeAssetAnnotations, labels, activeLabelId, selection,
    hiddenAnnotationIds, hiddenLabelIds, copy,
  } = props;
  const [imageSearch, setImageSearch] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6c8cff");
  const [batchLabel, setBatchLabel] = useState(activeLabelId);

  const filteredAssets = useMemo(() => {
    const query = imageSearch.trim().toLocaleLowerCase();
    return query ? assets.filter((asset) => asset.name.toLocaleLowerCase().includes(query)) : assets;
  }, [assets, imageSearch]);
  const selectedIds = selection.multiSelected.length ? selection.multiSelected : selection.selected ? [selection.selected] : [];
  const activeSelectedIds = selectedIds.filter((id) => activeAssetAnnotations.some((annotation) => annotation.id === id));

  function createClass() {
    if (!newLabelName.trim()) return;
    props.onCreateLabel(newLabelName, newLabelColor);
    setNewLabelName("");
  }

  return <section aria-label="Editor management" style={{ display: "grid", gridTemplateColumns: "minmax(220px, .9fr) minmax(260px, 1.1fr) minmax(280px, 1.2fr)", gap: 10, marginTop: 10 }}>
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong>{copy.images}</strong><small>{assets.length}</small>
      </div>
      <input aria-label={copy.searchImage} placeholder={copy.searchImage} value={imageSearch} onChange={(event) => setImageSearch(event.target.value)} style={{ width: "100%", marginTop: 8 }} />
      <div style={listStyle}>
        {filteredAssets.map((item) => {
          const index = assets.findIndex((asset) => asset.id === item.id);
          const count = annotations.filter((annotation) => annotation.asset === item.id).length;
          return <div key={item.id} style={{ ...rowStyle, outline: item.id === currentAssetId ? "1px solid var(--ink)" : "none", borderRadius: 5, padding: 3 }}>
            <button onClick={() => props.onSelectAsset(item.id)} title={item.name} style={{ textAlign: "left", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.name} <small>· {count}</small>
            </button>
            <button title={copy.reorderImage} disabled={index <= 0} onClick={() => props.onMoveAsset(item.id, -1)}>↑</button>
            <button title={copy.reorderImage} disabled={index < 0 || index >= assets.length - 1} onClick={() => props.onMoveAsset(item.id, 1)}>↓</button>
            <button title={`${copy.deleteSelectedAnnotations}: ${item.name}`} onClick={() => props.onDeleteAsset(item.id)}>×</button>
          </div>;
        })}
      </div>
    </div>

    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong>{copy.annotations}</strong><small>{activeAssetAnnotations.length}</small>
      </div>
      <small style={{ display: "block", opacity: .7, marginTop: 4 }}>{copy.annotationPanelHint}</small>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
        <button onClick={props.onSelectAllAnnotations} disabled={!activeAssetAnnotations.length}>{copy.selectAllAnnotations}</button>
        <button onClick={props.onClearAnnotationSelection} disabled={!activeSelectedIds.length}>{copy.clearAnnotationSelection}</button>
        <button onClick={() => props.onDeleteAnnotations(activeSelectedIds)} disabled={!activeSelectedIds.length}>{copy.deleteSelectedAnnotations}</button>
      </div>
      {activeSelectedIds.length > 0 && <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <small>{activeSelectedIds.length} {copy.batchSelection}</small>
        <select value={batchLabel} onChange={(event) => setBatchLabel(event.target.value)} aria-label={copy.changeClass}>
          {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
        </select>
        <button onClick={() => props.onBatchReclassify(activeSelectedIds, batchLabel)}>{copy.applyClass}</button>
      </div>}
      <div style={listStyle}>
        {activeAssetAnnotations.map((annotation, index) => {
          const label = labels.find((item) => item.id === annotation.label);
          const selected = selectedIds.includes(annotation.id);
          const hidden = hiddenAnnotationIds.has(annotation.id) || hiddenLabelIds.has(annotation.label);
          return <div key={annotation.id} style={{ ...rowStyle, outline: selected ? "1px solid var(--ink)" : "none", borderRadius: 5, padding: 3, opacity: hidden ? .5 : 1 }}>
            <button
              onClick={(event) => props.onSelectAnnotation(annotation.id, { shift: event.shiftKey, additive: event.ctrlKey || event.metaKey })}
              style={{ textAlign: "left", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 8, background: label?.color ?? "#929a95", marginRight: 6 }} />
              {label?.name ?? annotation.label} · {annotation.type} #{index + 1}
            </button>
            <button title={copy.reorderAnnotation} disabled={index <= 0} onClick={(event) => { stop(event); props.onMoveAnnotation(annotation.id, -1); }}>↑</button>
            <button title={hidden ? copy.showAnnotation : copy.hideAnnotation} onClick={(event) => { stop(event); props.onToggleAnnotationVisibility(annotation.id); }}>{hidden ? "○" : "●"}</button>
            <button title={copy.deleteShape} onClick={(event) => { stop(event); props.onDeleteAnnotations([annotation.id]); }}>×</button>
          </div>;
        })}
      </div>
    </div>

    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong>{copy.manageClasses}</strong><small>{labels.length}</small>
      </div>
      <small style={{ display: "block", opacity: .7, marginTop: 4 }}>{copy.classManagerHint}</small>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 4, marginTop: 8 }}>
        <input aria-label={copy.className} value={newLabelName} onChange={(event) => setNewLabelName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createClass(); }} placeholder={copy.className} />
        <input aria-label={copy.labelColor} type="color" value={newLabelColor} onChange={(event) => setNewLabelColor(event.target.value)} />
        <button onClick={createClass} disabled={!newLabelName.trim()}>{copy.createLabel}</button>
      </div>
      <div style={listStyle}>
        {labels.map((label) => {
          const protectedLabel = label.id === UNLABELED_ID;
          const hidden = hiddenLabelIds.has(label.id);
          const count = annotations.filter((annotation) => annotation.label === label.id).length;
          return <div key={label.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto auto auto", gap: 4, alignItems: "center", opacity: hidden ? .55 : 1 }}>
            <input aria-label={`${copy.labelColor}: ${label.name}`} type="color" value={label.color} disabled={protectedLabel} onChange={(event) => props.onRecolorLabel(label.id, event.target.value)} />
            <input
              aria-label={`${copy.renameClass}: ${label.name}`}
              key={`${label.id}-${label.name}`}
              defaultValue={label.name}
              disabled={protectedLabel}
              onBlur={(event) => props.onRenameLabel(label.id, event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
            />
            <small>{count}</small>
            <button title={hidden ? copy.showClass : copy.hideClass} onClick={() => props.onToggleLabelVisibility(label.id)}>{hidden ? "○" : "●"}</button>
            <button title={protectedLabel ? copy.unlabeledProtected : copy.deleteClass} disabled={protectedLabel} onClick={() => props.onDeleteLabel(label.id)}>×</button>
          </div>;
        })}
      </div>
      <div style={{ marginTop: 8 }}>
        <label>{copy.newAnnotationClass}: <select value={activeLabelId} onChange={(event) => props.onActiveLabelChange(event.target.value)}>{labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select></label>
      </div>
    </div>
  </section>;
}
