"use client";

import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import {
  Check, ChevronDown, ChevronUp, Eye, EyeOff, ImagePlus, Images, LoaderCircle, Menu, MoreHorizontal, Palette, Plus,
  Search, Tags, Trash2, WandSparkles, X,
} from "lucide-react";
import type { Asset, Label } from "../../lib/types";
import { getCopy } from "../../lib/i18n";
import type { EditorAnnotation } from "../models/annotation-model";
import type { SelectionState } from "../selection/selection-model";
import { UNLABELED_ID } from "./panel-model";
import ui from "../editor-interface.module.css";
import premerge from "./premerge-panel-refinement.module.css";

type Copy = ReturnType<typeof getCopy>;
type RightTab = "classes" | "annotations";

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
  loading?: boolean;
  onImportImages?: () => void;
  onLoadDemo?: () => void;
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
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("classes");

  useEffect(() => {
    const openImages = () => { setLeftOpen(true); setRightOpen(false); };
    const openRight = () => { setRightOpen(true); setLeftOpen(false); };
    window.addEventListener("poligome:open-images", openImages);
    window.addEventListener("poligome:open-right", openRight);
    return () => { window.removeEventListener("poligome:open-images", openImages); window.removeEventListener("poligome:open-right", openRight); };
  }, []);

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

  return <section aria-label={`${copy.appTitle} · ${copy.images} · ${copy.annotations} · ${copy.manageClasses}`} className={`${ui.managementGrid} canonical-management-panels`}>
    <button data-mobile-toggle="images" aria-label={copy.openImages} onClick={() => { setLeftOpen(true); setRightOpen(false); }}><Menu size={19} /></button>
    <button data-mobile-toggle="right" aria-label={copy.classes} onClick={() => { setRightOpen(true); setLeftOpen(false); }}><MoreHorizontal size={19} /></button>
    {(leftOpen || rightOpen) && <button data-mobile-backdrop="true" aria-label={copy.closePanel} onClick={() => { setLeftOpen(false); setRightOpen(false); }} />}

    <div data-panel="images" data-open={leftOpen ? "true" : "false"} className={classes("assets", leftOpen && "open", ui.panelCard, ui.imageRail)}>
      <div data-drawer-header="true"><strong>{copy.images}</strong><button aria-label={copy.closePanel} onClick={() => setLeftOpen(false)}><X size={18} /></button></div>
      <div className={ui.panelHeader}>
        <strong>{copy.images}</strong><small className={ui.counter}>{assets.length}</small>
      </div>
      {props.onImportImages && <button type="button" className="import" disabled={props.loading} onClick={props.onImportImages}><ImagePlus size={16} />{copy.importImages}</button>}
      {props.onLoadDemo && <button type="button" className="demo-import" disabled={props.loading} onClick={props.onLoadDemo}>{props.loading ? <LoaderCircle className="spin" size={16} /> : <WandSparkles size={16} />}{copy.tryDemo}</button>}
      <label className={ui.panelSearch}>
        <Search size={14} />
        <input aria-label={copy.searchImage} placeholder={copy.searchImage} value={imageSearch} onChange={(event) => setImageSearch(event.target.value)} />
      </label>
      <div className={classes(ui.list, ui.assetList)}>
        {filteredAssets.map((item) => {
          const index = assets.findIndex((asset) => asset.id === item.id);
          const count = annotations.filter((annotation) => annotation.asset === item.id).length;
          return <div key={item.id} className={classes(ui.assetRow, item.id === currentAssetId && ui.rowSelected)}>
            <button className={ui.assetMain} onClick={() => { props.onSelectAsset(item.id); setLeftOpen(false); }} title={item.name}>
              <span className={ui.assetThumb} style={{ backgroundImage: item.src ? `url(${item.src})` : "none" }}>
                <small>{String(index + 1).padStart(2, "0")}</small>
              </span>
              <span className={ui.assetText}><strong>{item.name}</strong><small>{count} {copy.projectAnnotations}</small></span>
              <span className={classes(ui.assetState, count > 0 && ui.assetStateDone)}>{count > 0 ? <Check size={10} /> : null}</span>
            </button>
            <div className={ui.rowActions}>
              <button className={ui.rowAction} title={copy.reorderImage} aria-label={`${copy.reorderImage}: ${item.name}`} disabled={index <= 0} onClick={() => props.onMoveAsset(item.id, -1)}><ChevronUp size={14} /></button>
              <button className={ui.rowAction} title={copy.reorderImage} aria-label={`${copy.reorderImage}: ${item.name}`} disabled={index < 0 || index >= assets.length - 1} onClick={() => props.onMoveAsset(item.id, 1)}><ChevronDown size={14} /></button>
              <button className={classes(ui.rowAction, ui.dangerAction)} title={`${copy.deleteSelectedAnnotations}: ${item.name}`} onClick={() => confirmAssetDelete(item, count)}><Trash2 size={14} /></button>
            </div>
          </div>;
        })}
      </div>
    </div>

    <div data-panel="right" data-open={rightOpen ? "true" : "false"} className={classes("labels", rightOpen && "open", ui.rightRail)}>
      <div data-drawer-header="true"><strong>{rightTab === "classes" ? copy.manageClasses : copy.annotations}</strong><button aria-label={copy.closePanel} onClick={() => setRightOpen(false)}><X size={18} /></button></div>
      <div className={classes(ui.panelCard, ui.rightPanelCard)}>
        <div className={ui.panelTabs} role="tablist" aria-label={`${copy.manageClasses} · ${copy.annotations}`}>
          <button role="tab" aria-selected={rightTab === "classes"} aria-pressed={rightTab === "classes"} onClick={() => setRightTab("classes")}><Tags size={14} />{copy.manageClasses}<small>{labels.length}</small></button>
          <button role="tab" aria-selected={rightTab === "annotations"} aria-pressed={rightTab === "annotations"} onClick={() => setRightTab("annotations")}><Images size={14} />{copy.annotations}<small>{activeAssetAnnotations.length}</small></button>
        </div>

        {rightTab === "annotations" ? <div className={ui.panelBody}>
          <small className={ui.helperText}>{copy.annotationPanelHint}</small>
          <div className={ui.controlRow}>
            <button className={ui.compactTextAction} onClick={props.onSelectAllAnnotations} disabled={!activeAssetAnnotations.length}>{copy.selectAllAnnotations}</button>
            <button className={ui.compactTextAction} onClick={props.onClearAnnotationSelection} disabled={!activeSelectedIds.length}>{copy.clearAnnotationSelection}</button>
            <button className={classes(ui.compactTextAction, ui.dangerAction)} onClick={() => confirmAnnotationDelete(activeSelectedIds)} disabled={!activeSelectedIds.length}>{copy.deleteSelectedAnnotations}</button>
          </div>
          {activeSelectedIds.length > 0 && <div className={ui.batchRow}>
            <small>{activeSelectedIds.length} {copy.batchSelection}</small>
            <select value={batchLabel} onChange={(event) => setBatchLabel(event.target.value)} aria-label={copy.changeClass}>
              {labels.map((label) => <option key={label.id} value={label.id}>{labelName(label)}</option>)}
            </select>
            <button onClick={() => props.onBatchReclassify(activeSelectedIds, batchLabel)}>{copy.applyClass}</button>
          </div>}
          <div className={classes(ui.list, ui.annotationList)}>
            {activeAssetAnnotations.map((annotation, index) => {
              const label = labels.find((item) => item.id === annotation.label);
              const selected = selectedIds.includes(annotation.id);
              const hidden = hiddenAnnotationIds.has(annotation.id) || hiddenLabelIds.has(annotation.label);
              const dotStyle = { "--label-color": label?.color ?? "#929a95" } as CSSProperties;
              return <div key={annotation.id} className={classes(ui.annotationRow, selected && ui.rowSelected, hidden && ui.rowHidden)}>
                <button className={ui.rowMain} onClick={(event) => props.onSelectAnnotation(annotation.id, { shift: event.shiftKey, additive: event.ctrlKey || event.metaKey })}>
                  <span className={ui.labelDot} style={dotStyle} />
                  <span>{label ? labelName(label) : annotation.label} · {annotation.type} #{index + 1}</span>
                </button>
                <button className={ui.rowAction} title={copy.reorderAnnotation} disabled={index <= 0} onClick={(event) => { stop(event); props.onMoveAnnotation(annotation.id, -1); }}><ChevronUp size={13} /></button>
                <button className={ui.rowAction} title={copy.reorderAnnotation} disabled={index >= activeAssetAnnotations.length - 1} onClick={(event) => { stop(event); props.onMoveAnnotation(annotation.id, 1); }}><ChevronDown size={13} /></button>
                <button className={ui.rowAction} title={hidden ? copy.showAnnotation : copy.hideAnnotation} onClick={(event) => { stop(event); props.onToggleAnnotationVisibility(annotation.id); }}>{hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                <button className={classes(ui.rowAction, ui.dangerAction)} title={copy.deleteShape} onClick={(event) => { stop(event); confirmAnnotationDelete([annotation.id]); }}><Trash2 size={13} /></button>
              </div>;
            })}
          </div>
        </div> : <div className={ui.panelBody}>
          <div className={premerge.classIntro}><Palette size={14} /><span><strong>{copy.classManagerTitle}</strong><small>{copy.classManagerHint}</small></span></div>
          <section className={premerge.quickLabelCard}>
            <div className={premerge.cardHeading}><Palette size={14} /><span><strong>{copy.labelStudio}</strong><small>{copy.labelStudioHint}</small></span></div>
            <div className={premerge.createRow}>
              <input aria-label={copy.className} value={newLabelName} onChange={(event) => setNewLabelName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createClass(); }} placeholder={copy.className} />
              <input className={ui.colorInput} aria-label={copy.labelColor} type="color" value={newLabelColor} onChange={(event) => setNewLabelColor(event.target.value)} />
              <button className={premerge.createButton} aria-label={copy.createLabel} title={copy.createLabel} onClick={createClass} disabled={!newLabelName.trim()}><Plus size={15} /></button>
            </div>
          </section>
          <div className={premerge.labelSectionHeader}><strong>{copy.classList}</strong><small>{labels.length} {copy.classes.toLocaleLowerCase()}</small></div>
          <div className={classes(ui.list, ui.labelList)}>
            {labels.map((label) => {
              const protectedLabel = label.id === UNLABELED_ID;
              const hidden = hiddenLabelIds.has(label.id);
              const count = annotations.filter((annotation) => annotation.label === label.id).length;
              return <div key={label.id} className={classes(ui.labelRow, label.id === activeLabelId && ui.rowSelected, hidden && ui.rowHidden)}>
                <input className={ui.colorInput} aria-label={`${copy.labelColor}: ${labelName(label)}`} type="color" value={label.color} disabled={protectedLabel} onChange={(event) => props.onRecolorLabel(label.id, event.target.value)} />
                <input aria-label={`${copy.renameClass}: ${labelName(label)}`} key={`${label.id}-${label.name}-${copy.unlabeled}`} defaultValue={labelName(label)} disabled={protectedLabel} onFocus={() => props.onActiveLabelChange(label.id)} onBlur={(event) => props.onRenameLabel(label.id, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
                <small>{count}</small>
                <button className={ui.rowAction} title={hidden ? copy.showClass : copy.hideClass} onClick={() => props.onToggleLabelVisibility(label.id)}>{hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                <button className={classes(ui.rowAction, ui.dangerAction)} title={protectedLabel ? copy.unlabeledProtected : copy.deleteClass} disabled={protectedLabel} onClick={() => confirmLabelDelete(label)}><Trash2 size={13} /></button>
              </div>;
            })}
          </div>
          <section className={premerge.activeLabelCard}>
            <div className={premerge.cardHeading}><Tags size={14} /><span><strong>{copy.newAnnotationClass}</strong><small>{copy.newShapesClass}</small></span></div>
            <select value={activeLabelId} onChange={(event) => props.onActiveLabelChange(event.target.value)} aria-label={copy.newAnnotationClass}>{labels.map((label) => <option key={label.id} value={label.id}>{labelName(label)}</option>)}</select>
          </section>
        </div>}
      </div>
    </div>
  </section>;
}
