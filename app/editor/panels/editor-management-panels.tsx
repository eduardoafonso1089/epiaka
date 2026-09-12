"use client";

import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import type { Asset, Label } from "../../lib/types";
import { getCopy } from "../../lib/i18n";
import type { EditorAnnotation } from "../models/annotation-model";
import type { SelectionState } from "../selection/selection-model";
import { UNLABELED_ID } from "./panel-model";
import ui from "../editor-interface.module.css";

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

function stop(event: MouseEvent) {
  event.stopPropagation();
}

function classes(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
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

  useEffect(() => {
    if (!labels.some((label) => label.id === batchLabel)) {
      setBatchLabel(labels.some((label) => label.id === activeLabelId) ? activeLabelId : labels[0]?.id ?? UNLABELED_ID);
    }
  }, [activeLabelId, batchLabel, labels]);

  const filteredAssets = useMemo(() => {
    const query = imageSearch.trim().toLocaleLowerCase();
    return query ? assets.filter((asset) => asset.name.toLocaleLowerCase().includes(query)) : assets;
  }, [assets, imageSearch]);
  const selectedIds = selection.multiSelected.length ? selection.multiSelected : selection.selected ? [selection.selected] : [];
  const activeSelectedIds = selectedIds.filter((id) => activeAssetAnnotations.some((annotation) => annotation.id === id));
  const labelName = (label: Label) => label.id === UNLABELED_ID ? copy.unlabeled : label.name;

  function createClass() {
    if (!newLabelName.trim()) return;
    props.onCreateLabel(newLabelName, newLabelColor);
    setNewLabelName("");
  }

  function confirmAnnotationDelete(ids: string[]) {
    if (!ids.length) return;
    if (!window.confirm(`${copy.confirmDeleteAnnotations}\n${copy.deleteAnnotationsWarning}`)) return;
    props.onDeleteAnnotations(ids);
  }

  function confirmAssetDelete(item: Asset, annotationCount: number) {
    const annotationWarning = annotationCount
      ? `\n${annotationCount} ${copy.annotations.toLocaleLowerCase()}. ${copy.deleteAnnotationsWarning}`
      : "";
    if (!window.confirm(`${copy.deleteSelectedAnnotations}: ${item.name}?${annotationWarning}`)) return;
    props.onDeleteAsset(item.id);
  }

  function confirmLabelDelete(label: Label) {
    if (label.id === UNLABELED_ID) return;
    if (!window.confirm(`${copy.confirmDeleteClass}\n${copy.deleteClassWarning} ${copy.unlabeled}.`)) return;
    props.onDeleteLabel(label.id);
  }

  return <section aria-label={`${copy.appTitle} · ${copy.images} · ${copy.annotations} · ${copy.manageClasses}`} className={ui.managementGrid}>
    <div className={ui.panelCard}>
      <div className={ui.panelHeader}>
        <strong>{copy.images}</strong><small className={ui.counter}>{assets.length}</small>
      </div>
      <input className={ui.panelInput} aria-label={copy.searchImage} placeholder={copy.searchImage} value={imageSearch} onChange={(event) => setImageSearch(event.target.value)} />
      <div className={ui.list}>
        {filteredAssets.map((item) => {
          const index = assets.findIndex((asset) => asset.id === item.id);
          const count = annotations.filter((annotation) => annotation.asset === item.id).length;
          return <div key={item.id} className={classes(ui.row, item.id === currentAssetId && ui.rowSelected)}>
            <button className={ui.rowMain} onClick={() => props.onSelectAsset(item.id)} title={item.name}>
              {item.name} <small>· {count}</small>
            </button>
            <button className={ui.rowAction} title={copy.reorderImage} disabled={index <= 0} onClick={() => props.onMoveAsset(item.id, -1)}>↑</button>
            <button className={ui.rowAction} title={copy.reorderImage} disabled={index < 0 || index >= assets.length - 1} onClick={() => props.onMoveAsset(item.id, 1)}>↓</button>
            <button className={classes(ui.rowAction, ui.dangerAction)} title={`${copy.deleteSelectedAnnotations}: ${item.name}`} onClick={() => confirmAssetDelete(item, count)}>×</button>
          </div>;
        })}
      </div>
    </div>

    <div className={ui.panelCard}>
      <div className={ui.panelHeader}>
        <strong>{copy.annotations}</strong><small className={ui.counter}>{activeAssetAnnotations.length}</small>
      </div>
      <small className={ui.helperText}>{copy.annotationPanelHint}</small>
      <div className={ui.controlRow}>
        <button onClick={props.onSelectAllAnnotations} disabled={!activeAssetAnnotations.length}>{copy.selectAllAnnotations}</button>
        <button onClick={props.onClearAnnotationSelection} disabled={!activeSelectedIds.length}>{copy.clearAnnotationSelection}</button>
        <button className={ui.dangerAction} onClick={() => confirmAnnotationDelete(activeSelectedIds)} disabled={!activeSelectedIds.length}>{copy.deleteSelectedAnnotations}</button>
      </div>
      {activeSelectedIds.length > 0 && <div className={ui.batchRow}>
        <small>{activeSelectedIds.length} {copy.batchSelection}</small>
        <select value={batchLabel} onChange={(event) => setBatchLabel(event.target.value)} aria-label={copy.changeClass}>
          {labels.map((label) => <option key={label.id} value={label.id}>{labelName(label)}</option>)}
        </select>
        <button onClick={() => props.onBatchReclassify(activeSelectedIds, batchLabel)}>{copy.applyClass}</button>
      </div>}
      <div className={ui.list}>
        {activeAssetAnnotations.map((annotation, index) => {
          const label = labels.find((item) => item.id === annotation.label);
          const selected = selectedIds.includes(annotation.id);
          const hidden = hiddenAnnotationIds.has(annotation.id) || hiddenLabelIds.has(annotation.label);
          const dotStyle = { "--label-color": label?.color ?? "#929a95" } as CSSProperties;
          return <div key={annotation.id} className={classes(ui.annotationRow, selected && ui.rowSelected, hidden && ui.rowHidden)}>
            <button className={ui.rowMain} onClick={(event) => props.onSelectAnnotation(annotation.id, { shift: event.shiftKey, additive: event.ctrlKey || event.metaKey })}>
              <span className={ui.labelDot} style={dotStyle} />
              {label ? labelName(label) : annotation.label} · {annotation.type} #{index + 1}
            </button>
            <button className={ui.rowAction} title={copy.reorderAnnotation} disabled={index <= 0} onClick={(event) => { stop(event); props.onMoveAnnotation(annotation.id, -1); }}>↑</button>
            <button className={ui.rowAction} title={copy.reorderAnnotation} disabled={index >= activeAssetAnnotations.length - 1} onClick={(event) => { stop(event); props.onMoveAnnotation(annotation.id, 1); }}>↓</button>
            <button className={ui.rowAction} title={hidden ? copy.showAnnotation : copy.hideAnnotation} onClick={(event) => { stop(event); props.onToggleAnnotationVisibility(annotation.id); }}>{hidden ? "○" : "●"}</button>
            <button className={classes(ui.rowAction, ui.dangerAction)} title={copy.deleteShape} onClick={(event) => { stop(event); confirmAnnotationDelete([annotation.id]); }}>×</button>
          </div>;
        })}
      </div>
    </div>

    <div className={ui.panelCard}>
      <div className={ui.panelHeader}>
        <strong>{copy.manageClasses}</strong><small className={ui.counter}>{labels.length}</small>
      </div>
      <small className={ui.helperText}>{copy.classManagerHint}</small>
      <div className={ui.helperText}><b>{copy.labelStudio}</b><br />{copy.labelStudioHint}</div>
      <div className={ui.classCreator}>
        <input aria-label={copy.className} value={newLabelName} onChange={(event) => setNewLabelName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createClass(); }} placeholder={copy.className} />
        <input className={ui.colorInput} aria-label={copy.labelColor} type="color" value={newLabelColor} onChange={(event) => setNewLabelColor(event.target.value)} />
        <button onClick={createClass} disabled={!newLabelName.trim()}>{copy.createLabel}</button>
      </div>
      <div className={ui.list}>
        {labels.map((label) => {
          const protectedLabel = label.id === UNLABELED_ID;
          const hidden = hiddenLabelIds.has(label.id);
          const count = annotations.filter((annotation) => annotation.label === label.id).length;
          return <div key={label.id} className={classes(ui.labelRow, hidden && ui.rowHidden)}>
            <input className={ui.colorInput} aria-label={`${copy.labelColor}: ${labelName(label)}`} type="color" value={label.color} disabled={protectedLabel} onChange={(event) => props.onRecolorLabel(label.id, event.target.value)} />
            <input aria-label={`${copy.renameClass}: ${labelName(label)}`} key={`${label.id}-${label.name}-${copy.unlabeled}`} defaultValue={labelName(label)} disabled={protectedLabel} onBlur={(event) => props.onRenameLabel(label.id, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
            <small>{count}</small>
            <button className={ui.rowAction} title={hidden ? copy.showClass : copy.hideClass} onClick={() => props.onToggleLabelVisibility(label.id)}>{hidden ? "○" : "●"}</button>
            <button className={classes(ui.rowAction, ui.dangerAction)} title={protectedLabel ? copy.unlabeledProtected : copy.deleteClass} disabled={protectedLabel} onClick={() => confirmLabelDelete(label)}>×</button>
          </div>;
        })}
      </div>
      <div className={ui.activeClass}>
        <label>{copy.newAnnotationClass}: <select value={activeLabelId} onChange={(event) => props.onActiveLabelChange(event.target.value)}>{labels.map((label) => <option key={label.id} value={label.id}>{labelName(label)}</option>)}</select></label>
      </div>
    </div>
  </section>;
}
