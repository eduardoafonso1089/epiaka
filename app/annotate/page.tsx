"use client";

import {
  Check, ChevronDown, CodeXml, ChevronLeft, ChevronRight, CircleMinus, CirclePlus, Crosshair,
  Combine, Copy, Download, Eye, EyeOff, FileText, FolderOpen, FolderUp, Hand, HardDriveDownload, ImagePlus, Images, Keyboard, Languages, Link2,
  Focus, Globe, GripVertical, House, ListRestart, LoaderCircle, Magnet, Maximize2, Menu, MoreHorizontal, MousePointer2, PenLine, Save, ShieldCheck,
  Monitor, Moon, Palette, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pencil, Pentagon, Plus, Power, Redo2, Scissors, Search, Settings2, Sparkles,
  Spline, Square, Sun, Tags, Trash2, Undo2, WandSparkles, X, ZoomIn, ZoomOut, PenTool,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  annotationIntersectsRect, boundedAnnotationDelta, deletePolygonVertex, edgeMidpoints,
  canAddPolygonHole, insertPolygonVertex, isValidPolygon, movePolygon, MIN_VERTEX_DISTANCE, pointInPolygon, pointsToSvg,
  polygonBounds, polygonCenter, reshapePolygon, simplifyPolygon, snapPointToPolygons,
  splitPolygon, transformPolygon, translateAnnotation, unionPolygons, updatePolygonVertex,
} from "../lib/geometry";
import { exportCoco, exportGeoJson, exportYoloZip } from "../lib/exporters";
import { SOURCE_URL, fill, getCopy, storedLanguage, storedTheme } from "../lib/i18n";
import { openPoligomeProject, savePoligomeProject } from "../lib/project";
import type { ProjectLayout, ProjectSaveMode } from "../lib/project";
import { requestSamMask } from "../lib/sam";
import { createDemoProject } from "../lib/demo";
import { TouchGesture, pinchZoom, touchToolUsesTap, nearestTouchVertex } from "../lib/touch-gestures";
import CogRecorte from "./CogRecorte";
import { ehArquivoTiff } from "../lib/cog";
import { geoReference, isRasterSidecar, readRasterSidecars } from "../lib/georeference";
import type { RasterReference } from "../lib/georeference";
import type { Recorte } from "../lib/cog";
import type { Copy as TranslationCopy, Language, ThemeMode } from "../lib/i18n";
import type { Annotation, Asset, Label, SamPrompt, Tool } from "../lib/types";

// useLayoutEffect does not run on the server; swapping avoids the React warning during SSR.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const UNLABELED_ID = "unlabeled";
const UNLABELED_COLOR = "#929a95";
// Boolean cuts are represented by a very thin strip, so the two generated nodes can be
// a couple of editor units apart. Treat that as a shared topological vertex.
const TOPOLOGY_VERTEX_TOLERANCE = 3;
const unlabeledLabel = (name = "Sem label"): Label => ({ id: UNLABELED_ID, name, color: UNLABELED_COLOR, key: "" });

const colors = [
  "#6c8cff", "#d987ff", "#26c6b6", "#ff8a65", "#ffd166", "#7ee081",
  "#59b0f6", "#f26d9d", "#c792ea", "#ff9f45", "#4dd4ac", "#e0dc3c",
  "#8d7bff", "#ff6b6b", "#3fd0d4", "#b6c94a",
];

// Converts a hue to hex keeping saturation and lightness fixed, so the colours generated
// after the palette runs out stay legible over the image.
function hueToHex(hue: number) {
  const chroma = 0.4712;
  const match = 0.3844;
  const sector = hue / 60;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const channels = [
    [chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary],
    [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary],
  ][Math.min(5, Math.floor(sector))];
  return `#${channels.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

// Suggests the next free colour for a new class. The palette is walked in order and the
// hue wheel is only used once every colour is already taken.
function nextLabelColor(existing: Label[]) {
  const used = new Set(existing.map((label) => label.color.toLowerCase()));
  const available = colors.find((color) => !used.has(color.toLowerCase()));
  if (available) return available;
  for (let step = 0; step < 360; step += 1) {
    const candidate = hueToHex((existing.length * 47 + step * 11) % 360);
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return colors[existing.length % colors.length];
}

type AnnotationDrag = { startX: number; startY: number; originals: Annotation[]; started: boolean };
type VertexDrag = { offset?: { x: number; y: number }; annotationId: string; vertexIndex: number; linked?: Array<{ annotationId: string; vertexIndex: number }> };

function polygonPath(outer: number[] = [], holes: number[][] = []) {
  return [outer, ...holes].filter((ring) => ring.length >= 6).map((ring) => `M ${ring[0]} ${ring[1]} ${ring.slice(2).reduce((path, coordinate, index) => index % 2 === 0 ? `${path} L ${coordinate} ${ring[index + 3]}` : path, "")} Z`).join(" ");
}
type SelectionMarquee = {
  startX: number; startY: number; currentX: number; currentY: number; additiveIds: string[];
};
type TransformDrag = {
  annotationId: string;
  kind: "scale" | "rotate";
  center: { x: number; y: number };
  startAngle: number;
  startDistance: number;
  original: Annotation;
};
type PanelSide = "left" | "right";
type PanelResize = { side: PanelSide; pointerId: number; startX: number; startWidth: number };
type ReorderDrag = { sourceId: string; targetId: string | null; position: "before" | "after" };
type CocoImage = { id?: number; file_name?: string; width?: number; height?: number };
type CocoCategory = { id?: number; name?: string; keypoints?: unknown };
type CocoAnnotation = { image_id?: number; category_id?: number; bbox?: number[]; segmentation?: unknown; keypoints?: unknown; landmarks?: unknown; keypoint_names?: unknown; landmark_names?: unknown };
type CocoGeometry = "polygon" | "box" | "point";
type CocoImportCandidate = { index: number; imageName: string; labelName: string; geometries: CocoGeometry[] };
type CocoImportPlan = { file: File; candidates: CocoImportCandidate[] };

function CocoImportDialog({ plan, copy: sourceCopy, selectedIndexes, selectedGeometryTypes, tab, onClose, onImport, onIndexesChange, onGeometryTypesChange, onTabChange }: {
  plan: CocoImportPlan; copy: TranslationCopy; selectedIndexes: number[]; selectedGeometryTypes: CocoGeometry[]; tab: "categories" | "annotations";
  onClose: () => void; onImport: () => void; onIndexesChange: (indexes: number[]) => void; onGeometryTypesChange: (types: CocoGeometry[]) => void; onTabChange: (tab: "categories" | "annotations") => void;
}) {
  const copy = { ...sourceCopy, clearCategorySelection: sourceCopy.clearClassSelection, annotationTypes: sourceCopy.annotationCategories };
  const geometryTypes: CocoGeometry[] = ["box", "point", "polygon"];
  const visibleCandidates = plan.candidates.filter((candidate) => candidate.geometries.some((type) => selectedGeometryTypes.includes(type)));
  const selectAllCategories = () => { onGeometryTypesChange(geometryTypes); onIndexesChange(plan.candidates.map((candidate) => candidate.index)); };
  const clearCategories = () => { onGeometryTypesChange([]); onIndexesChange([]); };
  const toggleCategory = (type: CocoGeometry) => {
    const enabled = !selectedGeometryTypes.includes(type);
    const candidateIndexes = plan.candidates.filter((candidate) => candidate.geometries.includes(type)).map((candidate) => candidate.index);
    onGeometryTypesChange(enabled ? [...selectedGeometryTypes, type] : selectedGeometryTypes.filter((item) => item !== type));
    if (enabled) onIndexesChange(Array.from(new Set([...selectedIndexes, ...candidateIndexes])));
  };
  const toggleAnnotation = (index: number) => onIndexesChange(selectedIndexes.includes(index) ? selectedIndexes.filter((item) => item !== index) : [...selectedIndexes, index]);
  const selectVisibleAnnotations = () => onIndexesChange(Array.from(new Set([...selectedIndexes, ...visibleCandidates.map((candidate) => candidate.index)])));
  const clearVisibleAnnotations = () => onIndexesChange(selectedIndexes.filter((index) => !visibleCandidates.some((candidate) => candidate.index === index)));
  const geometry = (type: CocoGeometry) => type === "polygon" ? copy.polygon : type === "point" ? copy.point : copy.box;
  return <div className="modal-backdrop"><section className="sam-modal coco-import-modal" role="dialog" aria-modal="true" aria-labelledby="coco-import-title"><header><div><span><FileText size={18} /></span><div><h2 id="coco-import-title">{copy.chooseAnnotations}</h2><p>{copy.chooseAnnotationsHint}</p></div></div><button onClick={onClose} aria-label={copy.close}><X size={19} /></button></header><div className="coco-import-tabs"><button className={tab === "categories" ? "active" : ""} onClick={() => onTabChange("categories")}>{copy.annotationTypes} <b>{geometryTypes.length}</b></button><button className={tab === "annotations" ? "active" : ""} onClick={() => onTabChange("annotations")}>{copy.annotations} <b>{visibleCandidates.length}</b></button></div>{tab === "categories" ? <><div className="coco-import-actions"><button onClick={selectAllCategories}>{copy.selectAllCategories}</button><button onClick={clearCategories}>{copy.clearCategorySelection}</button></div><div className="coco-import-list">{geometryTypes.map((type) => { const checked = selectedGeometryTypes.includes(type); const count = plan.candidates.filter((candidate) => candidate.geometries.includes(type)).length; return <button key={type} className={checked ? "selected" : ""} aria-pressed={checked} onClick={() => toggleCategory(type)}><i>{checked && <Check size={13} />}</i><span><b>{geometry(type)}</b><small>{count} {copy.annotationsToLoad}</small></span></button>; })}</div></> : <><div className="coco-import-actions"><button onClick={selectVisibleAnnotations}>{copy.selectAllAnnotations}</button><button onClick={clearVisibleAnnotations}>{copy.clearAnnotationSelection}</button></div><div className="coco-import-list">{visibleCandidates.map((candidate) => { const checked = selectedIndexes.includes(candidate.index); return <button key={candidate.index} className={checked ? "selected" : ""} aria-pressed={checked} onClick={() => toggleAnnotation(candidate.index)}><i>{checked && <Check size={13} />}</i><span><b>{candidate.labelName}</b><small>{candidate.imageName} Â· {candidate.geometries.filter((type) => selectedGeometryTypes.includes(type)).map(geometry).join(" + ")}</small></span></button>; })}{!visibleCandidates.length && <p className="coco-import-empty">{copy.noCategoriesSelected}</p>}</div></>}<footer><button onClick={onClose}>{copy.cancel}</button><button className="connect" disabled={!selectedIndexes.length || !selectedGeometryTypes.length} onClick={onImport}>{copy.importSelectedAnnotations}</button></footer></section></div>;
}

const LEFT_PANEL_MIN_WIDTH = 190;
const LEFT_PANEL_MAX_WIDTH = 520;
const RIGHT_PANEL_MIN_WIDTH = 220;
const RIGHT_PANEL_MAX_WIDTH = 560;
const EDITOR_MIN_WIDTH = 440;

function landmarkCoordinates(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  if (value.every((item) => typeof item === "number")) {
    const points: number[] = [];
    for (let index = 0; index + 1 < value.length; index += value.length % 3 === 0 ? 3 : 2) {
      const x = Number(value[index]); const y = Number(value[index + 1]); const visibility = value.length % 3 === 0 ? Number(value[index + 2]) : 1;
      if (Number.isFinite(x) && Number.isFinite(y) && visibility > 0) points.push(x, y);
    }
    return points;
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const landmark = item as { x?: unknown; y?: unknown; visibility?: unknown; v?: unknown };
    const x = Number(landmark.x); const y = Number(landmark.y); const visibility = Number(landmark.visibility ?? landmark.v ?? 1);
    return Number.isFinite(x) && Number.isFinite(y) && visibility > 0 ? [x, y] : [];
  });
}

function landmarkPoints(value: unknown): Array<{ x: number; y: number; index: number }> {
  if (!Array.isArray(value)) return [];
  if (value.every((item) => typeof item === "number")) {
    const stride = value.length % 3 === 0 ? 3 : 2;
    const points: Array<{ x: number; y: number; index: number }> = [];
    for (let offset = 0; offset + 1 < value.length; offset += stride) {
      const x = Number(value[offset]); const y = Number(value[offset + 1]); const visibility = stride === 3 ? Number(value[offset + 2]) : 1;
      if (Number.isFinite(x) && Number.isFinite(y) && visibility > 0) points.push({ x, y, index: offset / stride });
    }
    return points;
  }
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const landmark = item as { x?: unknown; y?: unknown; visibility?: unknown; v?: unknown };
    const x = Number(landmark.x); const y = Number(landmark.y); const visibility = Number(landmark.visibility ?? landmark.v ?? 1);
    return Number.isFinite(x) && Number.isFinite(y) && visibility > 0 ? [{ x, y, index }] : [];
  });
}

function keypointNames(value: unknown): string[] {
  return Array.isArray(value) ? value.map((name) => typeof name === "string" ? name.trim() : "") : [];
}

function cocoFormatMessage(language: Language) {
  if (language === "en") return "This file does not follow the expected COCO JSON structure (images, categories and annotations).";
  if (language === "fr") return "Ce fichier ne respecte pas la structure COCO JSON attendue (images, categories et annotations).";
  if (language === "es") return "Este archivo no sigue la estructura COCO JSON esperada (images, categories y annotations).";
  return "Este arquivo não segue a estrutura COCO JSON esperada (images, categories e annotations).";
}

function defaultPanelLayout(): ProjectLayout {
  const compact = typeof window !== "undefined" && window.innerWidth <= 1080;
  return { leftPanelWidth: compact ? 222 : 256, rightPanelWidth: compact ? 252 : 288 };
}

function normalizePanelLayout(layout?: Partial<ProjectLayout>): ProjectLayout {
  const defaults = defaultPanelLayout();
  let leftPanelWidth = Math.min(LEFT_PANEL_MAX_WIDTH, Math.max(LEFT_PANEL_MIN_WIDTH, layout?.leftPanelWidth ?? defaults.leftPanelWidth));
  let rightPanelWidth = Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, layout?.rightPanelWidth ?? defaults.rightPanelWidth));
  if (typeof window !== "undefined" && window.innerWidth > 860) {
    const maximumPanelsWidth = Math.max(LEFT_PANEL_MIN_WIDTH + RIGHT_PANEL_MIN_WIDTH, window.innerWidth - EDITOR_MIN_WIDTH);
    let overflow = leftPanelWidth + rightPanelWidth - maximumPanelsWidth;
    if (overflow > 0) {
      const rightReduction = Math.min(overflow, rightPanelWidth - RIGHT_PANEL_MIN_WIDTH);
      rightPanelWidth -= rightReduction;
      overflow -= rightReduction;
      leftPanelWidth -= Math.min(overflow, leftPanelWidth - LEFT_PANEL_MIN_WIDTH);
    }
  }
  return { leftPanelWidth: Math.round(leftPanelWidth), rightPanelWidth: Math.round(rightPanelWidth) };
}

function reorderItems<T extends { id: string }>(items: T[], sourceId: string, targetId: string, position: "before" | "after") {
  if (sourceId === targetId) return items;
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  if (sourceIndex < 0 || !items.some((item) => item.id === targetId)) return items;
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  const targetIndex = next.findIndex((item) => item.id === targetId);
  next.splice(targetIndex + (position === "after" ? 1 : 0), 0, moved);
  return next;
}

// Geometric symbol native to the brand; the text follows the font the app already loads.
function BrandLockup({ height = 30 }: { height?: number }) {
  return <span className="brand-lockup" role="img" aria-label="Poligome">
    <svg viewBox="0 0 40 40" height={height} aria-hidden="true">
      <path d="M20 2 35 11v18L20 38 5 29V11z" fill="currentColor" />
      <path d="m14 13 12 7-12 7z" fill="var(--surface)" />
    </svg>
    <strong>Poligome</strong>
  </span>;
}

function ToolButton({ title, active, disabled, onClick, children, keyHint, className }: { title: string; active?: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode; keyHint?: string; className?: string }) {
  return <button className={`tool-btn ${active ? "active" : ""} ${className ?? ""}`} aria-label={title} title={title} disabled={disabled} onClick={onClick}>{children}{keyHint && <small>{keyHint}</small>}</button>;
}

// Base radius of every canvas marker, in viewBox units: polygon nodes, keypoints,
// SAM prompts, handles and guides all derive from it. Being part of the drawing, they scale with the image.
const MARKER_RADIUS = 4.6;

// Polygon nodes shrink as vertex density grows so they do not overlap, but never exceed the
// base radius — so a simple polygon has nodes the same size as the other markers.
function polygonHandleRadius(zoomScale: number) {
  return MARKER_RADIUS * zoomScale;
}

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function readImageDimensions(src: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function warmImage(src: string) {
  const image = new Image();
  image.src = src;
  void image.decode().catch(() => undefined);
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [current, setCurrent] = useState("");
  const [labels, setLabels] = useState<Label[]>(() => [unlabeledLabel()]);
  const [activeLabel, setActiveLabel] = useState(UNLABELED_ID);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [redoHistory, setRedoHistory] = useState<Annotation[][]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const [hiddenAnnotations, setHiddenAnnotations] = useState<string[]>([]);
  const [hiddenLabels, setHiddenLabels] = useState<string[]>([]);
  const [selectedVertex, setSelectedVertex] = useState<{ annotationId: string; vertexIndex: number } | null>(null);
  const [annotationDrag, setAnnotationDrag] = useState<AnnotationDrag | null>(null);
  const [selectionMarquee, setSelectionMarquee] = useState<SelectionMarquee | null>(null);
  const [vertexDrag, setVertexDrag] = useState<VertexDrag | null>(null);
  const [transformDrag, setTransformDrag] = useState<TransformDrag | null>(null);
  const [reshapeDraft, setReshapeDraft] = useState<number[]>([]);
  const [reshapeDrawing, setReshapeDrawing] = useState(false);
  const [reshapeStartInside, setReshapeStartInside] = useState<boolean | null>(null);
  const [snapping, setSnapping] = useState(true);
  const [snapGuide, setSnapGuide] = useState<{ x: number; y: number } | null>(null);
  const [coordinatesGuide, setCoordinatesGuide] = useState(false);
  const [cursorPoint, setCursorPoint] = useState<{ x: number; y: number } | null>(null);
  const [readyImageIds, setReadyImageIds] = useState<string[]>([]);
  const [touchMode, setTouchMode] = useState(false);
  const [addToSelection, setAddToSelection] = useState(false);
  const touchGesture = useRef(new TouchGesture());
  const touchClosePoint = useRef(false);
  const touchSnapshot = useRef<{ annotations: Annotation[]; history: Annotation[][]; redo: Annotation[][]; saved: boolean; selected: string | null; multi: string[]; vertex: typeof selectedVertex } | null>(null);
  const pinchRef = useRef<{ zoom: number; distance: number; anchorX: number; anchorY: number } | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(1000);
  const [zoom, setZoom] = useState(92);
  const [lineThickness, setLineThickness] = useState(() => {
    if (typeof window === "undefined") return 3;
    const stored = Number(localStorage.getItem("poligome-line-thickness"));
    return Number.isFinite(stored) && stored >= 1 && stored <= 10 ? stored : 3;
  });
  const [search, setSearch] = useState("");
  const [quality, setQuality] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [projectSaveOpen, setProjectSaveOpen] = useState(false);
  const [projectSaveMode, setProjectSaveMode] = useState<ProjectSaveMode>("complete");
  const [saved, setSaved] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(colors[0]);
  // A GeoTIFF does not become an asset directly: each file goes through the crop step
  // before entering the list. The queue exists because the user can drop several at once.
  const [cogFila, setCogFila] = useState<Array<{ file: File; reference: RasterReference }>>([]);
  const [batchLabel, setBatchLabel] = useState(UNLABELED_ID);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [panelLayout, setPanelLayout] = useState<ProjectLayout>(defaultPanelLayout);
  const [resizingPanel, setResizingPanel] = useState<PanelSide | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectEditing, setProjectEditing] = useState(false);
  const [projectName, setProjectName] = useState(() => getCopy(storedLanguage()).newProject);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [classManagerOpen, setClassManagerOpen] = useState(false);
  const [preferencesTab, setPreferencesTab] = useState<"appearance" | "language">("appearance");
  const [language, setLanguage] = useState<Language>(storedLanguage);
  const [themeMode, setThemeMode] = useState<ThemeMode>(storedTheme);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number; left: number; top: number } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [polygonDraft, setPolygonDraft] = useState<number[]>([]);
  const [lineDraft, setLineDraft] = useState<number[]>([]);
  const [freehandDraft, setFreehandDraft] = useState<number[]>([]);
  const [freehandDrawing, setFreehandDrawing] = useState(false);
  const [splitStart, setSplitStart] = useState<{ x: number; y: number } | null>(null);
  const [splitEnd, setSplitEnd] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelName, setEditingLabelName] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [assetReorder, setAssetReorder] = useState<ReorderDrag | null>(null);
  const [annotationReorder, setAnnotationReorder] = useState<ReorderDrag | null>(null);
  const [pendingDeleteClassIds, setPendingDeleteClassIds] = useState<string[]>([]);
  const [pendingDeleteAnnotationIds, setPendingDeleteAnnotationIds] = useState<string[]>([]);
  const [cocoImportPlan, setCocoImportPlan] = useState<CocoImportPlan | null>(null);
  const [selectedCocoAnnotationIndexes, setSelectedCocoAnnotationIndexes] = useState<number[]>([]);
  const [selectedCocoGeometryTypes, setSelectedCocoGeometryTypes] = useState<CocoGeometry[]>([]);
  const [cocoImportTab, setCocoImportTab] = useState<"categories" | "annotations">("categories");
  const [samOpen, setSamOpen] = useState(false);
  const [samEndpoint, setSamEndpoint] = useState(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem("poligome-sam-endpoint") ?? "";
    try {
      const host = new URL(stored).hostname;
      return host === "localhost" || host === "127.0.0.1" || host === "[::1]" ? stored : "";
    } catch { return ""; }
  });
  const [samEndpointDraft, setSamEndpointDraft] = useState("http://127.0.0.1:7860/predict");
  const [samConnectionState, setSamConnectionState] = useState<"idle" | "checking" | "loading" | "ready" | "offline">("idle");
  const [samRuntime, setSamRuntime] = useState("");
  const [samPromptMode, setSamPromptMode] = useState<0 | 1>(1);
  const [samPrompts, setSamPrompts] = useState<SamPrompt[]>([]);
  const [samPreview, setSamPreview] = useState<number[]>([]);
  const [samLoading, setSamLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const cocoInputRef = useRef<HTMLInputElement>(null);
  const openProjectInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const projectSwitcherRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const annotationDragRef = useRef<AnnotationDrag | null>(null);
  const selectionMarqueeRef = useRef<SelectionMarquee | null>(null);
  const vertexDragRef = useRef<VertexDrag | null>(null);
  const transformDragRef = useRef<TransformDrag | null>(null);
  const reshapeTargetRef = useRef<string | null>(null);
  const annotationSelectionAnchorRef = useRef<string | null>(null);
  const panelResizeRef = useRef<PanelResize | null>(null);
  const samRequestRef = useRef(0);
  const renameCancelledRef = useRef(false);
  const zoomAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const pendingZoomRef = useRef<{ clientX: number; clientY: number; anchorX: number; anchorY: number } | null>(null);
  const projectObjectUrlsRef = useRef<string[]>([]);
  const routeDemoHandledRef = useRef(false);
  const demoLoadingRef = useRef(false);
  const labelsRef = useRef(labels);
  const idCounter = useRef(0);

  const asset = assets.find((item) => item.id === current) ?? assets[0];
  const assetIndex = Math.max(0, assets.findIndex((item) => item.id === asset?.id));
  const imageWindow = assets.slice(Math.max(0, assetIndex - 3), assetIndex + 4).filter((item) => !item.missing);
  const imageIsReady = !!asset && readyImageIds.includes(asset.id);
  const canEditImage = !!asset && !asset.missing && imageIsReady;
  const currentAnnotations = annotations.filter((annotation) => annotation.asset === current);
  const visibleAnnotations = currentAnnotations.filter((annotation) =>
    !hiddenAnnotations.includes(annotation.id) && !hiddenLabels.includes(annotation.label),
  );
  const currentImageAnnotationsHidden = currentAnnotations.length > 0 && currentAnnotations.every((annotation) => hiddenAnnotations.includes(annotation.id));
  const copy = getCopy(language);
  const activeAnnotation = annotations.find((annotation) => annotation.id === selected);
  const activeTransformBounds = activeAnnotation?.type === "polygon" && (activeAnnotation.pts?.length ?? 0) >= 6
    ? polygonBounds(activeAnnotation.pts ?? [])
    : activeAnnotation?.type === "box"
      ? { x: activeAnnotation.x ?? 0, y: activeAnnotation.y ?? 0, width: activeAnnotation.w ?? 0, height: activeAnnotation.h ?? 0 }
      : null;
  const activeTransformCenter = activeAnnotation?.type === "polygon" && (activeAnnotation.pts?.length ?? 0) >= 6
    ? polygonCenter(activeAnnotation.pts ?? [])
    : activeAnnotation?.type === "box"
      ? { x: (activeAnnotation.x ?? 0) + (activeAnnotation.w ?? 0) / 2, y: (activeAnnotation.y ?? 0) + (activeAnnotation.h ?? 0) / 2 }
      : null;
  const transformRotationY = activeTransformBounds
    ? activeTransformBounds.y > 52
      ? activeTransformBounds.y - 42
      : activeTransformBounds.y + activeTransformBounds.height + 42
    : 0;
  const transformRotationAnchorY = activeTransformBounds
    ? activeTransformBounds.y > 52
      ? activeTransformBounds.y
      : activeTransformBounds.y + activeTransformBounds.height
    : 0;
  // Tools and labels are screen controls: we compensate for zoom so they do not grow while
  // the image is magnified. The configured thickness is therefore visual, not in photo pixels.
  // Zooming out, a smooth curve shrinks the controls without making them illegible; zooming in,
  // we compensate so they do not become disproportionately large on screen.
  const touchRadius = 22 * 1000 / Math.max(1, canvasWidth);
  const handleScale = zoom < 100 ? Math.pow(100 / zoom, 0.6) : 100 / zoom;
  const markerRadius = MARKER_RADIUS * handleScale;
  const visualLineWidth = lineThickness * handleScale;
  // The plate also uses handleScale to keep the same visual size. Its limits have to follow
  // that scale; constants computed for 100% made the plate stop well short of the edge when
  // zoomed in and overflow the canvas when zoomed out.
  const coordinateLabelWidth = 116 * handleScale;
  const coordinateLabelHeight = 22 * handleScale;
  const coordinateLabelGap = 9 * handleScale;
  const coordinateLabelX = cursorPoint
    ? Math.min(1000 - coordinateLabelWidth - coordinateLabelGap, cursorPoint.x + coordinateLabelGap)
    : 0;
  const coordinateLabelY = cursorPoint
    ? Math.min(650 - coordinateLabelHeight, Math.max(coordinateLabelHeight + handleScale, cursorPoint.y - coordinateLabelGap))
    : 0;
  const cursorOverCoordinateLabel = !!cursorPoint && cursorPoint.x >= coordinateLabelX && cursorPoint.x <= coordinateLabelX + coordinateLabelWidth && cursorPoint.y >= coordinateLabelY && cursorPoint.y <= coordinateLabelY + coordinateLabelHeight;
  // The SVG uses a fixed viewBox over images of varying proportions. Compensating the Y axis
  // keeps a control circle from turning into an ellipse when the image changes.
  const markerAspect = 650 * (asset?.width ?? 1000) / (1000 * (asset?.height ?? 650));
  const selectedIds = multiSelected.length ? multiSelected : selected ? [selected] : [];
  const resolvedBatchLabel = labels.some((label) => label.id === batchLabel) ? batchLabel : labels[0]?.id ?? "";
  const selectableClasses = labels.filter((label) => label.id !== UNLABELED_ID);
  const pendingDeleteClasses = labels.filter((label) => pendingDeleteClassIds.includes(label.id));
  const pendingAffectedAnnotations = annotations.filter((annotation) => pendingDeleteClassIds.includes(annotation.label)).length;
  const pendingDeleteAnnotations = annotations.filter((annotation) => pendingDeleteAnnotationIds.includes(annotation.id));
  const missingProjectImages = assets.filter((item) => item.missing).length;
  const knownProjectImageBytes = assets.reduce((total, item) => total + (item.byteSize ?? 0), 0);
  const annotationProjectBytes = JSON.stringify({ assets: assets.map((item) => ({ id: item.id, name: item.name, width: item.width, height: item.height })), labels, annotations }).length;
  const selectedPolygons = annotations.filter((annotation) => multiSelected.includes(annotation.id) && annotation.type === "polygon");
  const getLabel = useCallback((id: string) => labels.find((label) => label.id === id) ?? labels[0] ?? unlabeledLabel(copy.unlabeled), [copy.unlabeled, labels]);
  const completed = useMemo(() => new Set(annotations.map((annotation) => annotation.asset)).size, [annotations]);
  const remember = useCallback(() => {
    setHistory((items) => [...items.slice(-24), annotations]);
    // Any new edit forks the timeline, so states that were redoable no longer apply.
    setRedoHistory([]);
    setSaved(false);
  }, [annotations]);

  useEffect(() => { labelsRef.current = labels; }, [labels]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(() => setCanvasWidth(svg.getBoundingClientRect().width));
    observer.observe(svg);
    return () => observer.disconnect();
  }, [current, mounted, canEditImage]);

  // Puts the scroll back as soon as the canvas takes its new size and before painting, so
  // the anchored point stays exactly under the cursor with no intermediate frame.
  useIsomorphicLayoutEffect(() => {
    const pending = pendingZoomRef.current;
    pendingZoomRef.current = null;
    const scroller = scrollRef.current;
    const canvas = svgRef.current?.parentElement;
    if (!pending || !scroller || !canvas) return;
    const bounds = canvas.getBoundingClientRect();
    scroller.scrollLeft += bounds.left + pending.anchorX * bounds.width - pending.clientX;
    scroller.scrollTop += bounds.top + pending.anchorY * bounds.height - pending.clientY;
  }, [zoom]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.lang = language === "pt" ? "pt-BR" : language;
    document.title = copy.appTitle;
    localStorage.setItem("poligome-theme", themeMode);
    localStorage.setItem("poligome-language", language);
  }, [copy.appTitle, language, themeMode]);

  useEffect(() => {
    localStorage.setItem("poligome-line-thickness", String(lineThickness));
  }, [lineThickness]);

  useEffect(() => {
    localStorage.removeItem("poligome-labels");
    localStorage.removeItem("poligome-annotations");
    localStorage.removeItem("poligome-project-name");
  }, []);

  useEffect(() => () => {
    projectObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (saved) return;
    const warnBeforeClose = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeClose);
    return () => window.removeEventListener("beforeunload", warnBeforeClose);
  }, [saved]);

  useEffect(() => {
    const closeProjectMenu = (event: PointerEvent) => {
      if (!projectSwitcherRef.current?.contains(event.target as Node)) setProjectOpen(false);
    };
    document.addEventListener("pointerdown", closeProjectMenu);
    return () => document.removeEventListener("pointerdown", closeProjectMenu);
  }, []);

  function makeId(prefix: string) {
    idCounter.current += 1;
    const randomPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${randomPart}-${idCounter.current}`;
  }

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((currentToast) => currentToast === message ? null : currentToast), 3800);
  }, []);

  const undo = useCallback(() => {
    if (!history.length) return;
    setRedoHistory((items) => [...items.slice(-24), annotations]);
    setAnnotations(history.at(-1)!);
    setHistory((items) => items.slice(0, -1));
    setSelected(null); setMultiSelected([]); setSelectedVertex(null); setSnapGuide(null); setSaved(false);
  }, [annotations, history]);

  const redo = useCallback(() => {
    if (!redoHistory.length) return;
    setHistory((items) => [...items.slice(-24), annotations]);
    setAnnotations(redoHistory.at(-1)!);
    setRedoHistory((items) => items.slice(0, -1));
    setSelected(null); setMultiSelected([]); setSelectedVertex(null); setSnapGuide(null); setSaved(false);
  }, [annotations, redoHistory]);

  const deleteSelection = useCallback(() => {
    if (polygonDraft.length) {
      setPolygonDraft((points) => points.slice(0, -2));
      return;
    }
    if (lineDraft.length) {
      setLineDraft((points) => points.slice(0, -2));
      return;
    }
    if (selectedVertex) {
      const annotation = annotations.find((item) => item.id === selectedVertex.annotationId);
      if (!annotation?.pts?.length) return;
      remember();
      // Removing a point below the minimum deletes the shape instead of storing invalid geometry.
      if (annotation.pts.length <= (annotation.type === "line" ? 4 : 6)) {
        setAnnotations((items) => items.filter((item) => item.id !== selectedVertex.annotationId));
        setSelected(null); setMultiSelected([]); setSelectedVertex(null);
        showToast(annotation.type === "line" ? copy.toastLineDeleted : copy.toastPolygonDeleted);
        return;
      }
      const nextPoints = deletePolygonVertex(annotation.pts, selectedVertex.vertexIndex);
      const nextVertexIndex = Math.min(selectedVertex.vertexIndex, nextPoints.length / 2 - 1);
      setAnnotations((items) => items.map((item) => item.id === selectedVertex.annotationId ? { ...item, pts: nextPoints } : item));
      setSelectedVertex({ annotationId: selectedVertex.annotationId, vertexIndex: nextVertexIndex });
      showToast(copy.toastVertexRemoved);
      return;
    }
    if (!selected) return;
    const ids = multiSelected.length > 1 ? multiSelected : [selected];
    if (ids.length > 1) { setPendingDeleteAnnotationIds(ids); return; }
    remember();
    setAnnotations((items) => items.filter((annotation) => !ids.includes(annotation.id)));
    setSelected(null); setMultiSelected([]);
  }, [annotations, copy.toastLineDeleted, copy.toastPolygonDeleted, copy.toastVertexRemoved, lineDraft.length,
      multiSelected, polygonDraft.length, remember, selected, selectedVertex, showToast]);

  const finishPolygon = useCallback(() => {
    if (polygonDraft.length < 6) return;
    if (!isValidPolygon(polygonDraft)) { showToast("O polígono se cruza ou não tem área. Pressione Delete para remover o último ponto e corrija o cruzamento antes de concluir."); return; }
    if (tool === "ring") {
      if (activeAnnotation?.type !== "polygon" || !canAddPolygonHole(activeAnnotation.pts ?? [], polygonDraft, activeAnnotation.holes)) {
        showToast("O buraco deve ficar inteiramente dentro do polígono, sem tocar a borda ou outro buraco."); return;
      }
      remember();
      setAnnotations((items) => items.map((item) => item.id === activeAnnotation.id ? { ...item, holes: [...(item.holes ?? []), polygonDraft] } : item));
      setPolygonDraft([]); showToast("Buraco adicionado ao polígono."); return;
    }
    remember();
    const id = makeId("annotation");
    setAnnotations((items) => [...items, { id, asset: current, label: activeLabel, type: "polygon", pts: polygonDraft }]);
    setPolygonDraft([]); setSelected(id); setMultiSelected([id]);
  }, [activeAnnotation, polygonDraft, remember, current, activeLabel, showToast, tool]);

  // A line needs only two points; the outline stays open.
  const finishLine = useCallback(() => {
    if (lineDraft.length < 4) return;
    remember();
    const id = makeId("line");
    setAnnotations((items) => [...items, { id, asset: current, label: activeLabel, type: "line", pts: lineDraft }]);
    setLineDraft([]); setSelected(id); setMultiSelected([id]);
  }, [lineDraft, remember, current, activeLabel]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if (event.key === "Enter" && (tool === "polygon" || tool === "ring")) finishPolygon();
      if (event.key === "Enter" && tool === "line") finishLine();
      if (event.key === "Escape") {
        // The editing tools work on the already selected polygon. Cancelling them returns
        // to Select and move without losing that editing context.
        const returnsToSelection = tool === "split" || tool === "transform" || tool === "reshape";
        const isCreationTool = tool === "box" || tool === "polygon" || tool === "ring" || tool === "freehand" || tool === "line" || tool === "point" || tool === "sam";
        setProjectOpen(false); setProjectEditing(false); setProjectSaveOpen(false); setClassManagerOpen(false); setSelectedClassIds([]);
        setPolygonDraft([]); setLineDraft([]); setFreehandDraft([]); setFreehandDrawing(false); setDraft(null);
        setSplitStart(null); setSplitEnd(null); setReshapeDraft([]); setReshapeDrawing(false);
        annotationDragRef.current = null; setAnnotationDrag(null);
        selectionMarqueeRef.current = null; setSelectionMarquee(null);
        reshapeTargetRef.current = null; setReshapeStartInside(null);
        transformDragRef.current = null; setTransformDrag(null); setSnapGuide(null);
        samRequestRef.current += 1; setSamPrompts([]); setSamPreview([]); setSamLoading(false);
        if (returnsToSelection) setTool("select");
        else {
          setSelected(null); setMultiSelected([]);
          if (isCreationTool) setTool("select");
        }
        setSelectedVertex(null);
        // Outside the polygon-dependent tools, Esc cancels the selection and the current draft.
        setPanStart(null); setStart(null);
      }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelection(); }
      const tools: Record<string, Tool> = { v: "select", h: "pan", b: "box", p: "polygon", o: "ring", f: "freehand", l: "line", k: "point", s: "sam", t: "transform", r: "reshape" };
      const nextTool = tools[event.key.toLowerCase()];
      if (nextTool) {
        if (!canEditImage) return;
        if (nextTool === "sam" && !samEndpoint) {
          setSamEndpointDraft(samEndpoint || "http://127.0.0.1:7860/predict"); setSamOpen(true);
        } else if (nextTool === "sam") {
          samRequestRef.current += 1; setSamPrompts([]); setSamPreview([]); setSamLoading(false);
          setSamPromptMode(1); setTool(tool === "sam" ? "select" : "sam");
        } else setTool(nextTool);
      }
      const label = labels.find((item) => item.key === event.key);
      if (label) setActiveLabel(label.id);
    };
    addEventListener("keydown", keydown);
    return () => removeEventListener("keydown", keydown);
  }, [canEditImage, deleteSelection, finishLine, finishPolygon, labels, redo, samEndpoint, tool, undo]);

  function changeTool(next: Tool) {
    clearPointerDrafts();
    setTool(next);
  }

  function resetDrafts() {
    clearPointerDrafts();
    setPolygonDraft([]); setLineDraft([]); setFreehandDraft([]); setFreehandDrawing(false); setDraft(null);
    setSplitStart(null); setSplitEnd(null); setReshapeDraft([]); setReshapeDrawing(false);
    annotationDragRef.current = null; setAnnotationDrag(null);
    selectionMarqueeRef.current = null; setSelectionMarquee(null);
    reshapeTargetRef.current = null; setReshapeStartInside(null);
    transformDragRef.current = null; setTransformDrag(null); setSnapGuide(null); clearSam();
  }

  const loadDemoProject = useCallback(async () => {
    if (demoLoadingRef.current) return;
    demoLoadingRef.current = true;
    setDemoLoading(true);
    try {
      const demo = await createDemoProject(language);
      projectObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      projectObjectUrlsRef.current = demo.objectUrls;
      idCounter.current = 0;
      setProjectName(demo.name); setProjectNameDraft("");
      setAssets(demo.assets); setCurrent(demo.assets[0].id); setReadyImageIds([]);
      setLabels(demo.labels); setAnnotations(demo.annotations);
      setActiveLabel(demo.labels[0].id); setBatchLabel(demo.labels[0].id); setNewLabelColor(nextLabelColor(demo.labels));
      setHistory([]); setRedoHistory([]); setSelected(demo.annotations[0].id); setMultiSelected([demo.annotations[0].id]); setSelectedVertex(null);
      setSelectedClassIds([]); setSelectedAssetIds([]); setHiddenAnnotations([]); setHiddenLabels([]);
      setPendingDeleteAnnotationIds([]); setPendingDeleteClassIds([]); setSearch(""); setQuality(false); setTool("select"); setZoom(92);
      setPanelLayout(defaultPanelLayout()); setLeftPanelCollapsed(false); setRightPanelCollapsed(false);
      setProjectOpen(false); setProjectEditing(false); setProjectSaveOpen(false); setClassManagerOpen(false); setLeftOpen(false); setRightOpen(false);
      setSaved(true);
      showToast(copy.demoReady);
    } catch {
      showToast(copy.demoError);
    } finally {
      demoLoadingRef.current = false;
      setDemoLoading(false);
    }
  }, [copy.demoError, copy.demoReady, language, showToast, setLeftOpen, setRightOpen]);

  useEffect(() => {
    if (routeDemoHandledRef.current || new URLSearchParams(window.location.search).get("demo") !== "1") return;
    routeDemoHandledRef.current = true;
    void loadDemoProject();
  }, [loadDemoProject]);

  function editorPoint(clientX: number, clientY: number) {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return { x: Math.max(0, Math.min(1000, (clientX - bounds.left) / bounds.width * 1000)), y: Math.max(0, Math.min(650, (clientY - bounds.top) / bounds.height * 650)) };
  }

  // Applies a new zoom keeping the point that must stay still: the cursor when it is over
  // the canvas, otherwise the viewport centre. The scroll is repositioned in the layout
  // effect below, with the canvas already at its new size.
  const applyZoom = useCallback((nextZoom: number, anchor?: { x: number; y: number }) => {
    const target = Math.max(10, Math.min(400, Math.round(nextZoom)));
    if (target === zoom) return;
    const scroller = scrollRef.current;
    const canvas = svgRef.current?.parentElement;
    if (!scroller || !canvas) { setZoom(target); return; }
    const viewport = scroller.getBoundingClientRect();
    const focus = anchor ?? zoomAnchorRef.current
      ?? { x: viewport.left + viewport.width / 2, y: viewport.top + viewport.height / 2 };
    const clientX = Math.max(viewport.left, Math.min(viewport.right, focus.x));
    const clientY = Math.max(viewport.top, Math.min(viewport.bottom, focus.y));
    const bounds = canvas.getBoundingClientRect();
    pendingZoomRef.current = {
      clientX, clientY,
      anchorX: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)),
      anchorY: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)),
    };
    setZoom(target);
  }, [zoom]);

  // The wheel needs a native listener with passive:false. React registers `onWheel` as
  // passive (react-dom: "wheel" is in the same list as touchstart/touchmove), so there
  // preventDefault() is ignored and Chrome still applies the native Shift + wheel scroll —
  // which is horizontal and dragged the image sideways on every zoom step.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.shiftKey && !event.ctrlKey) return;
      event.preventDefault();
      const wheelDelta = event.deltaY || event.deltaX;
      if (!wheelDelta) return;
      applyZoom(zoom + (wheelDelta < 0 ? 10 : -10), { x: event.clientX, y: event.clientY });
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [applyZoom, mounted, zoom]);

  // Keeps the navigation window in memory and decoded, without spending RAM on the whole dataset.
  useEffect(() => {
    const index = Math.max(0, assets.findIndex((item) => item.id === current));
    assets.slice(Math.max(0, index - 3), index + 4).forEach((item) => { if (!item.missing) warmImage(item.src); });
  }, [assets, current]);

  function zoomToFit(image: Asset) {
    const scroller = scrollRef.current;
    if (!scroller) return 92;
    const imageWidth = image.width ?? 1000;
    const imageHeight = image.height ?? 650;
    const widthAtHundred = Math.max(1, scroller.clientWidth);
    const heightAtHundred = widthAtHundred * imageHeight / imageWidth;
    const heightFit = scroller.clientHeight / Math.max(1, heightAtHundred) * 100;
    return Math.max(10, Math.min(100, Math.floor(Math.min(100, heightFit) * 0.96)));
  }

  // Each image has its own framing: when the file changes, the previous zoom and
  // scroll cannot be reused.
  useEffect(() => {
    if (!current || !asset?.width || !asset?.height) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    setZoom(zoomToFit(asset));

    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        const currentScroller = scrollRef.current;
        if (!currentScroller) return;
        currentScroller.scrollLeft = Math.max(0, (currentScroller.scrollWidth - currentScroller.clientWidth) / 2);
        currentScroller.scrollTop = Math.max(0, (currentScroller.scrollHeight - currentScroller.clientHeight) / 2);
      });
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      if (innerFrame) cancelAnimationFrame(innerFrame);
    };
  }, [asset, current]);

  function fitImageToViewport() {
    const scroller = scrollRef.current;
    if (!scroller) { setZoom(92); return; }
    const imageWidth = asset.width ?? 1000;
    const imageHeight = asset.height ?? 650;
    const widthAtHundred = Math.max(1, scroller.clientWidth);
    const heightAtHundred = widthAtHundred * imageHeight / imageWidth;
    const heightFit = scroller.clientHeight / Math.max(1, heightAtHundred) * 100;
    const nextZoom = Math.max(10, Math.min(100, Math.floor(Math.min(100, heightFit) * 0.96)));
    setZoom(nextZoom);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const currentScroller = scrollRef.current;
      if (!currentScroller) return;
      currentScroller.scrollTo({
        left: Math.max(0, (currentScroller.scrollWidth - currentScroller.clientWidth) / 2),
        top: Math.max(0, (currentScroller.scrollHeight - currentScroller.clientHeight) / 2),
        behavior: "smooth",
      });
    }));
    showToast(copy.imageCentered);
  }

  function capture(pointerId: number) {
    try { svgRef.current?.setPointerCapture(pointerId); } catch { /* Pointer already released. */ }
  }

  function clearPointerDrafts() {
    setStart(null); setDraft(null); setPanStart(null);
    annotationDragRef.current = null; setAnnotationDrag(null);
    vertexDragRef.current = null; setVertexDrag(null);
    transformDragRef.current = null; setTransformDrag(null);
    selectionMarqueeRef.current = null; setSelectionMarquee(null);
    setFreehandDraft([]); setFreehandDrawing(false);
    setReshapeDraft([]); setReshapeDrawing(false); setReshapeStartInside(null);
    reshapeTargetRef.current = null; setSnapGuide(null);
  }

  function cancelTouchEdit() {
    const snapshot = touchSnapshot.current;
    if (snapshot) {
      setAnnotations(snapshot.annotations); setHistory(snapshot.history); setRedoHistory(snapshot.redo);
      setSaved(snapshot.saved); setSelected(snapshot.selected); setMultiSelected(snapshot.multi); setSelectedVertex(snapshot.vertex);
      touchSnapshot.current = null;
    }
    clearPointerDrafts();
  }

  function beginPinch() {
    const pair = touchGesture.current.pair();
    const bounds = svgRef.current?.getBoundingClientRect();
    pinchRef.current = pair && bounds ? {
      zoom, distance: pair.distance,
      anchorX: (pair.x - bounds.left) / bounds.width,
      anchorY: (pair.y - bounds.top) / bounds.height,
    } : null;
  }

  function touchPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") { setTouchMode(false); return; }
    const gesture = touchGesture.current;
    if (!canEditImage || (!gesture.points.size && !(event.target instanceof Element && svgRef.current?.contains(event.target)))) return;
    setTouchMode(true);
    if (!gesture.points.size) {
      touchSnapshot.current = { annotations, history, redo: redoHistory, saved, selected, multi: multiSelected, vertex: selectedVertex };
      touchClosePoint.current = event.target instanceof Element && !!event.target.closest(".polygon-close-point");
    }
    const navigating = gesture.down(event.pointerId, event.clientX, event.clientY);
    capture(event.pointerId);
    if (navigating) { cancelTouchEdit(); beginPinch(); }
    if (navigating || touchToolUsesTap(tool)) { event.preventDefault(); event.stopPropagation(); }
  }

  function touchPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = touchGesture.current;
    if (event.pointerType !== "touch" || !gesture.points.has(event.pointerId)) return;
    gesture.move(event.pointerId, event.clientX, event.clientY);
    if (!gesture.navigating && !touchToolUsesTap(tool)) return;
    event.preventDefault(); event.stopPropagation();
    const pair = gesture.pair();
    const pinch = pinchRef.current;
    const canvas = svgRef.current;
    const scroller = scrollRef.current;
    if (!gesture.navigating || !pair || !pinch || !canvas || !scroller) return;
    const next = pinchZoom(pinch.zoom, pinch.distance, pair.distance);
    const anchor = { clientX: pair.x, clientY: pair.y, anchorX: pinch.anchorX, anchorY: pinch.anchorY };
    if (next === zoom) {
      const bounds = canvas.getBoundingClientRect();
      scroller.scrollLeft += bounds.left + anchor.anchorX * bounds.width - anchor.clientX;
      scroller.scrollTop += bounds.top + anchor.anchorY * bounds.height - anchor.clientY;
    } else {
      pendingZoomRef.current = anchor;
      setZoom(next);
    }
  }

  function touchPointerEnd(event: React.PointerEvent<HTMLDivElement>, cancelled = false) {
    const gesture = touchGesture.current;
    if (event.pointerType !== "touch" || !gesture.points.has(event.pointerId)) return;
    gesture.move(event.pointerId, event.clientX, event.clientY);
    const result = gesture.end(event.pointerId, cancelled);
    if (cancelled) cancelTouchEdit();
    if (result.blocked || touchToolUsesTap(tool)) {
      event.preventDefault(); event.stopPropagation();
      if (result.tap) {
        if (touchClosePoint.current && (tool === "polygon" || tool === "ring") && polygonDraft.length >= 6) finishPolygon();
        else canvasPointerDown(event as unknown as React.PointerEvent<SVGSVGElement>);
      }
    } else if (tool === "freehand" || tool === "reshape") {
      event.preventDefault(); event.stopPropagation();
      if (tool === "freehand") finishFreehand();
      else finishReshape(editorPoint(event.clientX, event.clientY));
    }
    if (gesture.points.size >= 2) beginPinch();
    else pinchRef.current = null;
    if (!gesture.points.size) touchSnapshot.current = null;
  }

  async function runSam(prompts: SamPrompt[]) {
    const requestId = ++samRequestRef.current;
    setSamLoading(true);
    try {
      const preview = await requestSamMask({ endpoint: samEndpoint, asset, prompts, copy });
      if (requestId === samRequestRef.current) setSamPreview(preview);
    } catch (error) {
      if (requestId === samRequestRef.current) showToast(error instanceof Error ? error.message : copy.toastSamFailed);
    } finally {
      if (requestId === samRequestRef.current) setSamLoading(false);
    }
  }

  function canvasPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button === 1 || (tool === "pan" && event.button === 0)) {
      event.preventDefault();
      const scroller = scrollRef.current;
      if (scroller) {
        setPanStart({ x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop });
        capture(event.pointerId);
      }
      return;
    }
    if (event.button !== 0) return;
    const rawPoint = editorPoint(event.clientX, event.clientY);
    const point = snapping && ["polygon", "line", "freehand", "split", "reshape", "point"].includes(tool)
      ? snapPointToPolygons(rawPoint, visibleAnnotations, "")
      : rawPoint;
    if (tool === "select") {
      const marquee: SelectionMarquee = {
        startX: point.x, startY: point.y, currentX: point.x, currentY: point.y,
        additiveIds: (event.shiftKey || addToSelection) ? [...multiSelected] : [],
      };
      selectionMarqueeRef.current = marquee; setSelectionMarquee(marquee); setSelectedVertex(null); capture(event.pointerId); return;
    }
    if (tool === "box") { setStart(point); setDraft({ ...point, w: 0, h: 0 }); capture(event.pointerId); }
    if (tool === "polygon" || tool === "ring") {
      // Closing only happens on the starting node, by right click or Enter. A proximity
      // radius here made the fourth vertex of narrow rectangles be confused with the first,
      // and the result ended up as a triangle.
      setPolygonDraft((points) => [...points, point.x, point.y]);
    }
    if (tool === "line") setLineDraft((points) => [...points, point.x, point.y]);
    if (tool === "freehand" && !freehandDrawing) { capture(event.pointerId); setFreehandDraft([point.x, point.y]); setFreehandDrawing(true); }
    if (tool === "reshape" && activeAnnotation?.type === "polygon") {
      if (event.pointerType === "touch") capture(event.pointerId);
      if (reshapeDrawing) finishReshape(point);
      else beginReshape(point, activeAnnotation.id);
    }
    if (tool === "point") {
      remember(); const id = makeId("annotation");
      setAnnotations((items) => [...items, { id, asset: current, label: activeLabel, type: "point", ...point }]);
      setSelected(id); setMultiSelected([id]);
    }
    if (tool === "sam") {
      const prompts = [...samPrompts, { ...point, label: samPromptMode }];
      setSamPrompts(prompts); void runSam(prompts);
    }
    if (tool === "split" && activeAnnotation?.type === "polygon") {
      // O primeiro clique inicia a guia; o segundo a confirma e executa o corte.
      if (splitStart) finishSplit(point);
      else { setSplitStart(point); setSplitEnd(point); }
    }
  }

  function canvasPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const point = editorPoint(event.clientX, event.clientY);
    if (coordinatesGuide) setCursorPoint(point);
    const activeMarquee = selectionMarqueeRef.current;
    if (activeMarquee) {
      const next = { ...activeMarquee, currentX: point.x, currentY: point.y };
      selectionMarqueeRef.current = next; setSelectionMarquee(next); return;
    }
    const activeVertexDrag = vertexDragRef.current ?? vertexDrag;
    if (activeVertexDrag) {
      const movedPoint = { x: point.x + (activeVertexDrag.offset?.x ?? 0), y: point.y + (activeVertexDrag.offset?.y ?? 0) };
      const target = snapping
        ? snapPointToPolygons(movedPoint, visibleAnnotations, activeVertexDrag.annotationId)
        : { ...movedPoint, snapped: false };
      setSnapGuide(target.snapped ? { x: target.x, y: target.y } : null);
      const linked = activeVertexDrag.linked ?? [activeVertexDrag];
      setAnnotations((items) => items.map((annotation) => {
        const vertex = linked.find((item) => item.annotationId === annotation.id);
        return vertex ? { ...annotation, pts: updatePolygonVertex(annotation.pts ?? [], vertex.vertexIndex, target.x, target.y) } : annotation;
      })); setSaved(false); return;
    }
    if (panStart && scrollRef.current) {
      scrollRef.current.scrollLeft = panStart.left - (event.clientX - panStart.x); scrollRef.current.scrollTop = panStart.top - (event.clientY - panStart.y); return;
    }
    if (tool === "freehand" && freehandDrawing) {
      setFreehandDraft((points) => {
        const lastX = points.at(-2) ?? point.x; const lastY = points.at(-1) ?? point.y;
        return Math.hypot(point.x - lastX, point.y - lastY) >= 4 ? [...points, point.x, point.y] : points;
      }); return;
    }
    if (tool === "reshape" && reshapeDrawing) {
      setReshapeDraft((points) => {
        const lastX = points.at(-2) ?? point.x; const lastY = points.at(-1) ?? point.y;
        return Math.hypot(point.x - lastX, point.y - lastY) >= 4 ? [...points, point.x, point.y] : points;
      }); return;
    }
    if (tool === "split" && splitStart) { setSplitEnd(point); return; }
    if (!start || tool !== "box") return;
    setDraft({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) });
  }

  function canvasPointerUp() {
    if (panStart) { setPanStart(null); return; }
    if (selectionMarqueeRef.current) { finishSelectionMarquee(); return; }
    if (vertexDragRef.current || vertexDrag) { vertexDragRef.current = null; setVertexDrag(null); setSnapGuide(null); return; }
    if (tool === "freehand") return;
    if (tool === "reshape") return;
    if (tool !== "box" || !draft || draft.w < 8 || draft.h < 8) { setStart(null); setDraft(null); return; }
    remember(); const id = makeId("annotation");
    setAnnotations((items) => [...items, { id, asset: current, label: activeLabel, type: "box", ...draft }]);
    setSelected(id); setMultiSelected([id]); setStart(null); setDraft(null);
  }

  function finishFreehand() {
    setFreehandDrawing(false);
    if (freehandDraft.length < 6) { setFreehandDraft([]); return; }
    const polygon = simplifyPolygon(freehandDraft, 2.2);
    if (!isValidPolygon(polygon)) { setFreehandDraft([]); showToast("O contorno se cruza ou não tem área. Desenhe-o novamente."); return; }
    remember(); const id = makeId("freehand");
    setAnnotations((items) => [...items, { id, asset: current, label: activeLabel, type: "polygon", pts: polygon }]);
    setFreehandDraft([]); setSelected(id); setMultiSelected([id]); showToast(copy.toastFreehandDone);
  }

  function finishDrawingWithRightClick(event: React.MouseEvent<SVGSVGElement>) {
    event.preventDefault();
    if ((tool === "polygon" || tool === "ring") && polygonDraft.length >= 6) finishPolygon();
    if (tool === "line" && lineDraft.length >= 4) finishLine();
    if (tool === "freehand" && freehandDrawing) finishFreehand();
  }

  function beginReshape(point: { x: number; y: number }, annotationId: string) {
    const annotation = annotations.find((item) => item.id === annotationId);
    if (annotation?.type !== "polygon") return;
    reshapeTargetRef.current = annotationId;
    setReshapeDraft([point.x, point.y]); setReshapeDrawing(true);
    setReshapeStartInside(pointInPolygon(point, annotation.pts ?? []));
  }

  function finishReshape(endPoint: { x: number; y: number }) {
    const targetId = reshapeTargetRef.current;
    const annotation = annotations.find((item) => item.id === targetId);
    const path = [...reshapeDraft, endPoint.x, endPoint.y];
    setReshapeDrawing(false); setReshapeDraft([]); setReshapeStartInside(null); reshapeTargetRef.current = null;
    if (annotation?.type !== "polygon" || path.length < 6) return;
    const result = reshapePolygon(annotation.pts ?? [], path);
    if (!result.points) {
      if (result.reason === "mixed") showToast(copy.toastReshapeMixed);
      else if (result.reason === "direction") showToast(result.mode === "add" ? copy.toastReshapeAddDirection : copy.toastReshapeRemoveDirection);
      else showToast(copy.toastReshapeCross);
      return;
    }
    remember();
    setAnnotations((items) => items.map((item) => item.id === annotation.id ? { ...item, pts: result.points! } : item));
    setSelectedVertex(null);
    showToast(result.mode === "add" ? copy.toastReshapeAdded : copy.toastReshapeRemoved);
  }

  function finishSelectionMarquee() {
    const marquee = selectionMarqueeRef.current;
    selectionMarqueeRef.current = null; setSelectionMarquee(null);
    if (!marquee) return;
    const rect = {
      x: Math.min(marquee.startX, marquee.currentX),
      y: Math.min(marquee.startY, marquee.currentY),
      width: Math.abs(marquee.currentX - marquee.startX),
      height: Math.abs(marquee.currentY - marquee.startY),
    };
    if (rect.width < 4 && rect.height < 4) {
      const next = marquee.additiveIds;
      setMultiSelected(next); setSelected(next.at(-1) ?? null); syncBatchLabel(next); return;
    }
    const hits = visibleAnnotations.filter((annotation) => annotationIntersectsRect(annotation, rect)).map((annotation) => annotation.id);
    const next = Array.from(new Set([...marquee.additiveIds, ...hits]));
    setMultiSelected(next); setSelected(next.at(-1) ?? null); syncBatchLabel(next);
  }

  function finishSplit(endPoint?: { x: number; y: number }) {
    const annotation = activeAnnotation;
    const finalPoint = endPoint ?? splitEnd;
    if (!annotation?.pts || !splitStart || !finalPoint) return;
    const parts = splitPolygon(annotation.pts, splitStart, finalPoint);
    setSplitStart(null); setSplitEnd(null);
    if (parts.length < 2) { showToast(copy.toastSplitNeedsCross); return; }
    remember();
    const splitId = makeId("split");
    const created = parts.map((points, index) => ({ ...annotation, id: `${splitId}-${index}`, pts: points }));
    setAnnotations((items) => [...items.filter((item) => item.id !== annotation.id), ...created]);
    setSelected(created[0].id); setMultiSelected(created.map((item) => item.id)); showToast(fill(copy.toastSplitDone, { n: created.length }));
  }

  function beginAnnotationDrag(event: React.PointerEvent<SVGElement>, annotation: Annotation) {
    if (event.button !== 0) return;
    if (tool === "reshape") {
      if (event.pointerType === "touch") capture(event.pointerId);
      event.preventDefault(); event.stopPropagation();
      const point = editorPoint(event.clientX, event.clientY);
      if (reshapeDrawing) finishReshape(point);
      else {
        setSelected(annotation.id); setMultiSelected([annotation.id]); setSelectedVertex(null);
        setBatchLabel(annotation.label);
        beginReshape(point, annotation.id);
      }
      return;
    }
    if (tool === "transform") {
      event.preventDefault(); event.stopPropagation();
      setSelected(annotation.id); setMultiSelected([annotation.id]); setSelectedVertex(null);
      setBatchLabel(annotation.label);
      return;
    }
    if (tool !== "select") return;
    event.preventDefault(); event.stopPropagation();
    if (event.shiftKey || addToSelection) { toggleMultiSelection(annotation.id); return; }
    const point = editorPoint(event.clientX, event.clientY);
    // While editing a selected polygon, a near miss on a small visual node should still
    // adjust that node instead of unexpectedly moving the whole shape.
    if ((annotation.type === "polygon" || annotation.type === "line") && selected === annotation.id && multiSelected.length <= 1) {
      const points = annotation.pts ?? [];
      const hitRadius = event.pointerType === "touch" ? touchRadius : Math.max(MIN_VERTEX_DISTANCE * 1.4, polygonHandleRadius(handleScale) * 2.2);
      let closest = -1;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < points.length; index += 2) {
        const distance = Math.hypot(points[index] - point.x, (points[index + 1] - point.y) / Math.max(markerAspect, 0.01));
        if (distance < closestDistance) { closest = index / 2; closestDistance = distance; }
      }
      if (closest >= 0 && closestDistance <= hitRadius) { beginVertexDrag(event, annotation, closest); return; }
    }
    const ids = multiSelected.includes(annotation.id) && multiSelected.length > 1 ? multiSelected : [annotation.id];
    const originals = annotations.filter((item) => ids.includes(item.id));
    const drag: AnnotationDrag = { startX: point.x, startY: point.y, originals, started: false };
    setSelected(annotation.id); setMultiSelected(ids); setSelectedVertex(null); syncBatchLabel(ids);
    annotationDragRef.current = drag; setAnnotationDrag(drag);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { capture(event.pointerId); }
  }

  function moveAnnotationPointer(event: React.PointerEvent<SVGElement>) {
    const drag = annotationDragRef.current;
    if (!drag) return;
    event.preventDefault(); event.stopPropagation();
    const point = editorPoint(event.clientX, event.clientY);
    if (!drag.started) {
      if (Math.hypot(point.x - drag.startX, point.y - drag.startY) < 4 * handleScale) return;
      drag.started = true;
      remember();
    }
    const delta = boundedAnnotationDelta(drag.originals, point.x - drag.startX, point.y - drag.startY);
    const originals = new Map(drag.originals.map((annotation) => [annotation.id, annotation]));
    setAnnotations((items) => items.map((item) => {
      const original = originals.get(item.id);
      return original ? translateAnnotation(original, delta.dx, delta.dy) : item;
    }));
    setSaved(false);
  }

  function finishAnnotationPointer(event: React.PointerEvent<SVGElement>) {
    if (!annotationDragRef.current) return;
    event.preventDefault(); event.stopPropagation();
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    annotationDragRef.current = null; setAnnotationDrag(null);
  }

  function beginTransform(event: React.PointerEvent<SVGElement>, annotation: Annotation, kind: "scale" | "rotate") {
    if (event.button !== 0 || tool !== "transform" || (annotation.type !== "polygon" && annotation.type !== "box")) return;
    event.preventDefault(); event.stopPropagation(); remember();
    const point = editorPoint(event.clientX, event.clientY);
    const center = annotation.type === "polygon"
      ? polygonCenter(annotation.pts ?? [])
      : { x: (annotation.x ?? 0) + (annotation.w ?? 0) / 2, y: (annotation.y ?? 0) + (annotation.h ?? 0) / 2 };
    const drag: TransformDrag = {
      annotationId: annotation.id,
      kind,
      center,
      startAngle: Math.atan2(point.y - center.y, point.x - center.x),
      startDistance: Math.max(1, Math.hypot(point.x - center.x, point.y - center.y)),
      original: { ...annotation, pts: annotation.pts ? [...annotation.pts] : undefined },
    };
    transformDragRef.current = drag; setTransformDrag(drag);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { capture(event.pointerId); }
  }

  function moveTransformPointer(event: React.PointerEvent<SVGElement>) {
    const drag = transformDragRef.current;
    if (!drag) return;
    event.preventDefault(); event.stopPropagation();
    const point = editorPoint(event.clientX, event.clientY);
    const angle = Math.atan2(point.y - drag.center.y, point.x - drag.center.x);
    const distance = Math.max(1, Math.hypot(point.x - drag.center.x, point.y - drag.center.y));
    const angleDelta = angle - drag.startAngle;
    const scale = Math.max(0.08, Math.min(12, distance / drag.startDistance));
    setAnnotations((items) => items.map((item) => {
      if (item.id !== drag.annotationId) return item;
      if (drag.original.type === "polygon") {
        const nextPoints = drag.kind === "rotate"
          ? transformPolygon(drag.original.pts ?? [], drag.center, 1, angleDelta)
          : transformPolygon(drag.original.pts ?? [], drag.center, scale, 0);
        return { ...item, pts: nextPoints, holes: drag.original.holes?.map((hole) =>
          transformPolygon(hole, drag.center, drag.kind === "rotate" ? 1 : scale, drag.kind === "rotate" ? angleDelta : 0)) };
      }
      if (drag.original.type === "box") {
        if (drag.kind === "rotate") return { ...item, rotation: (drag.original.rotation ?? 0) + angleDelta };
        const width = Math.max(8, (drag.original.w ?? 0) * scale);
        const height = Math.max(8, (drag.original.h ?? 0) * scale);
        return { ...item, x: drag.center.x - width / 2, y: drag.center.y - height / 2, w: width, h: height };
      }
      return item;
    }));
    setSaved(false);
  }

  function finishTransformPointer(event: React.PointerEvent<SVGElement>) {
    if (!transformDragRef.current) return;
    event.preventDefault(); event.stopPropagation();
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
    transformDragRef.current = null; setTransformDrag(null); showToast(copy.toastTransformApplied);
  }

  function captureVertexPointer(event: React.PointerEvent<SVGElement>, drag: VertexDrag) {
    vertexDragRef.current = drag;
    setVertexDrag(drag);
    try { event.currentTarget.setPointerCapture(event.pointerId); }
    catch { capture(event.pointerId); }
  }

  function moveVertexPointer(event: React.PointerEvent<SVGElement>) {
    const drag = vertexDragRef.current;
    if (!drag) return;
    event.preventDefault(); event.stopPropagation();
    const pointer = editorPoint(event.clientX, event.clientY);
    const rawPoint = { x: pointer.x + (drag.offset?.x ?? 0), y: pointer.y + (drag.offset?.y ?? 0) };
    const point = snapping
      ? snapPointToPolygons(rawPoint, visibleAnnotations, drag.annotationId)
      : { ...rawPoint, snapped: false };
    setSnapGuide(point.snapped ? { x: point.x, y: point.y } : null);
    const linked = drag.linked ?? [drag];
    setAnnotations((items) => items.map((annotation) => {
      const vertex = linked.find((item) => item.annotationId === annotation.id);
      return vertex ? { ...annotation, pts: updatePolygonVertex(annotation.pts ?? [], vertex.vertexIndex, point.x, point.y) } : annotation;
    }));
    setSaved(false);
  }

  function finishVertexPointer(event: React.PointerEvent<SVGElement>) {
    if (!vertexDragRef.current) return;
    event.preventDefault(); event.stopPropagation();
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* A captura já pode ter sido liberada pelo navegador. */ }
    vertexDragRef.current = null;
    setVertexDrag(null); setSnapGuide(null);
  }

  function beginVertexDrag(event: React.PointerEvent<SVGElement>, annotation: Annotation, vertexIndex: number) {
    if (event.button !== 0 || tool !== "select") return;
    if (addToSelection) { event.preventDefault(); event.stopPropagation(); toggleMultiSelection(annotation.id); return; }
    if (event.pointerType === "touch") {
      const point = editorPoint(event.clientX, event.clientY);
      const bounds = svgRef.current?.getBoundingClientRect();
      const nearest = bounds ? nearestTouchVertex(annotation.pts ?? [], point.x, point.y, bounds.width, bounds.height) : -1;
      if (nearest >= 0) vertexIndex = nearest;
    }
    event.preventDefault(); event.stopPropagation(); remember(); setSelected(annotation.id); setMultiSelected([annotation.id]); setSnapGuide(null);
    const x = annotation.pts?.[vertexIndex * 2] ?? 0;
    const y = annotation.pts?.[vertexIndex * 2 + 1] ?? 0;
    // Vertices from a split can land on the two sides of its infinitesimal cutter.
    // Move those near-coincident nodes together to keep the resulting border seamless.
    const linked = visibleAnnotations.flatMap((item) => (item.type === "polygon" || item.type === "line") && item.pts
      ? item.pts.flatMap((coordinate, index) => index % 2 === 0 && Math.hypot(coordinate - x, (item.pts?.[index + 1] ?? 0) - y) <= TOPOLOGY_VERTEX_TOLERANCE
        ? [{ annotationId: item.id, vertexIndex: index / 2 }] : [])
      : []);
    const pointer = editorPoint(event.clientX, event.clientY);
    const drag: VertexDrag = { annotationId: annotation.id, vertexIndex, linked, offset: event.pointerType === "touch" ? { x: x - pointer.x, y: y - pointer.y } : undefined };
    setSelectedVertex(drag); captureVertexPointer(event, drag);
  }

  function insertVertex(event: React.PointerEvent<SVGElement>, annotation: Annotation, edgeIndex: number, x: number, y: number) {
    if (event.button !== 0 || tool !== "select") return;
    if (addToSelection) { event.preventDefault(); event.stopPropagation(); toggleMultiSelection(annotation.id); return; }
    event.preventDefault(); event.stopPropagation();
    const points = annotation.pts ?? [];
    const nearbyVertex = points.findIndex((coordinate, index) =>
      index % 2 === 0 && Math.hypot(coordinate - x, points[index + 1] - y) < MIN_VERTEX_DISTANCE * 1.5,
    );
    if (nearbyVertex >= 0) {
      setSelected(annotation.id); setMultiSelected([annotation.id]);
      setSelectedVertex({ annotationId: annotation.id, vertexIndex: nearbyVertex / 2 });
      return;
    }
    remember();
    const vertexIndex = edgeIndex + 1;
    setAnnotations((items) => items.map((item) => item.id === annotation.id ? { ...item, pts: insertPolygonVertex(points, edgeIndex, x, y) } : item));
    const pointer = editorPoint(event.clientX, event.clientY);
    const drag: VertexDrag = { annotationId: annotation.id, vertexIndex, offset: event.pointerType === "touch" ? { x: x - pointer.x, y: y - pointer.y } : undefined };
    setSelected(annotation.id); setMultiSelected([annotation.id]); setSelectedVertex(drag); captureVertexPointer(event, drag);
  }

  function syncBatchLabel(ids: string[]) {
    const selectedAnnotations = annotations.filter((annotation) => ids.includes(annotation.id));
    const firstLabel = selectedAnnotations[0]?.label;
    if (firstLabel && selectedAnnotations.every((annotation) => annotation.label === firstLabel)) setBatchLabel(firstLabel);
  }

  function toggleMultiSelection(id: string) {
    const base = selected && !multiSelected.includes(selected) ? [...multiSelected, selected] : multiSelected;
    const next = base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
    setMultiSelected(next); setSelected(next.at(-1) ?? null); syncBatchLabel(next);
    setSelectedVertex(null);
  }

  function selectAnnotationFromPanel(annotation: Annotation, shiftKey: boolean, additive: boolean, toggle: boolean) {
    const anchorId = annotationSelectionAnchorRef.current;
    const anchorIndex = anchorId ? currentAnnotations.findIndex((item) => item.id === anchorId) : -1;
    const targetIndex = currentAnnotations.findIndex((item) => item.id === annotation.id);

    if (shiftKey && anchorIndex >= 0 && targetIndex >= 0) {
      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      const rangeIds = currentAnnotations.slice(start, end + 1).map((item) => item.id);
      const next = additive ? Array.from(new Set([...multiSelected, ...rangeIds])) : rangeIds;
      setSelected(annotation.id);
      setMultiSelected(next);
      syncBatchLabel(next);
    } else if (toggle || additive) {
      toggleMultiSelection(annotation.id);
      annotationSelectionAnchorRef.current = annotation.id;
    } else {
      setSelected(annotation.id);
      setMultiSelected([annotation.id]);
      setBatchLabel(annotation.label);
      annotationSelectionAnchorRef.current = annotation.id;
    }

    setSelectedVertex(null);
    setTool("select");
  }

  function updatePanelWidth(side: PanelSide, width: number) {
    setPanelLayout((currentLayout) => normalizePanelLayout({
      ...currentLayout,
      [side === "left" ? "leftPanelWidth" : "rightPanelWidth"]: width,
    }));
    setSaved(false);
  }

  function beginPanelResize(event: React.PointerEvent<HTMLButtonElement>, side: PanelSide) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startWidth = side === "left" ? panelLayout.leftPanelWidth : panelLayout.rightPanelWidth;
    panelResizeRef.current = { side, pointerId: event.pointerId, startX: event.clientX, startWidth };
    setResizingPanel(side);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePanelResize(event: React.PointerEvent<HTMLButtonElement>) {
    const resize = panelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    const direction = resize.side === "left" ? 1 : -1;
    updatePanelWidth(resize.side, resize.startWidth + (event.clientX - resize.startX) * direction);
  }

  function finishPanelResize(event: React.PointerEvent<HTMLButtonElement>) {
    const resize = panelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* A captura pode ter sido liberada pelo navegador. */ }
    panelResizeRef.current = null;
    setResizingPanel(null);
  }

  function resizePanelWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, side: PanelSide) {
    const grows = side === "left" ? event.key === "ArrowRight" : event.key === "ArrowLeft";
    const shrinks = side === "left" ? event.key === "ArrowLeft" : event.key === "ArrowRight";
    if (!grows && !shrinks) return;
    event.preventDefault();
    const currentWidth = side === "left" ? panelLayout.leftPanelWidth : panelLayout.rightPanelWidth;
    updatePanelWidth(side, currentWidth + (grows ? 16 : -16));
  }

  function toggleAnnotationVisibility(id: string) {
    const annotation = annotations.find((item) => item.id === id);
    if (annotation && hiddenLabels.includes(annotation.label)) {
      setHiddenLabels((items) => items.filter((item) => item !== annotation.label));
      setHiddenAnnotations((items) => items.filter((item) => item !== id));
      return;
    }
    const willHide = !hiddenAnnotations.includes(id);
    setHiddenAnnotations((items) => willHide ? [...items, id] : items.filter((item) => item !== id));
    if (willHide) {
      setMultiSelected((items) => items.filter((item) => item !== id));
      if (selected === id) setSelected(null);
      if (selectedVertex?.annotationId === id) setSelectedVertex(null);
    }
  }

  function toggleCurrentImageAnnotationVisibility() {
    const ids = currentAnnotations.map((annotation) => annotation.id);
    if (!ids.length) return;
    if (currentImageAnnotationsHidden) {
      setHiddenAnnotations((items) => items.filter((id) => !ids.includes(id)));
      return;
    }
    setHiddenAnnotations((items) => Array.from(new Set([...items, ...ids])));
    setSelected(null); setMultiSelected([]); setSelectedVertex(null);
  }

  function toggleLabelVisibility(id: string) {
    const willHide = !hiddenLabels.includes(id);
    setHiddenLabels((items) => willHide ? [...items, id] : items.filter((item) => item !== id));
    if (willHide) {
      const hiddenIds = currentAnnotations.filter((annotation) => annotation.label === id).map((annotation) => annotation.id);
      setMultiSelected((items) => items.filter((item) => !hiddenIds.includes(item)));
      if (selected && hiddenIds.includes(selected)) setSelected(null);
      if (selectedVertex && hiddenIds.includes(selectedVertex.annotationId)) setSelectedVertex(null);
    }
  }

  function simplifySelected() {
    if (activeAnnotation?.type !== "polygon") return;
    remember();
    setAnnotations((items) => items.map((item) => item.id === activeAnnotation.id ? { ...item, pts: simplifyPolygon(item.pts ?? [], 6) } : item));
    showToast(copy.toastSimplified);
  }

  function duplicateSelected() {
    if (activeAnnotation?.type !== "polygon") return;
    remember(); const id = makeId("copy");
    setAnnotations((items) => [...items, { ...activeAnnotation, id, pts: movePolygon(activeAnnotation.pts ?? [], 22, 22) }]);
    setSelected(id); setMultiSelected([id]); showToast(copy.toastDuplicated);
  }

  function mergeSelected() {
    if (selectedPolygons.length < 2) return;
    if (new Set(selectedPolygons.map((annotation) => annotation.label)).size > 1) { showToast(copy.toastMergeSameClass); return; }
    const result = unionPolygons(selectedPolygons.map((annotation) => annotation.pts ?? []));
    if (!result.length) { showToast(copy.toastMergeFailed); return; }
    remember();
    const source = selectedPolygons[0];
    const mergeId = makeId("merge");
    const created = result.map((points, index) => ({ ...source, id: `${mergeId}-${index}`, pts: points }));
    setAnnotations((items) => [...items.filter((item) => !multiSelected.includes(item.id)), ...created]);
    setSelected(created[0].id); setMultiSelected(created.map((item) => item.id)); showToast(copy.toastMerged);
  }

  async function files(list: FileList | null) {
    const uploadId = makeId("upload");
    const todos = Array.from(list ?? []);
    const references = new Map<File, RasterReference>();
    const supported = todos.filter(file => ehArquivoTiff(file.name, file.type) ||
      /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name) || file.type.startsWith("image/"));
    const valid: File[] = [];
    for (const file of supported) {
      try { references.set(file, await readRasterSidecars(file, todos)); valid.push(file); }
      catch { showToast(`${file.name}: ${copy.rasterInvalidReference}`); }
    }
    if (todos.some(file => !supported.includes(file) && !isRasterSidecar(file.name))) showToast(copy.rasterUnsupported);
    const geotiffs = valid.filter(file => ehArquivoTiff(file.name, file.type));
    if (geotiffs.length) {
      setCogFila(atual => [...atual, ...geotiffs.map(file => ({ file, reference: references.get(file)! }))]);
      setLeftOpen(false);
    }
    const imageFiles = valid.filter(file => !ehArquivoTiff(file.name, file.type));
    if (!imageFiles.length) return;
    const missingByName = new Map<string, Asset[]>();
    assets.filter((item) => item.missing).forEach((item) => {
      const key = item.name.toLocaleLowerCase();
      missingByName.set(key, [...(missingByName.get(key) ?? []), item]);
    });
    const replacements = new Map<string, Asset>();
    const incoming: Asset[] = [];
    const referenceById = new Map<string, RasterReference>();
    imageFiles.forEach((file, index) => {
      const src = URL.createObjectURL(file);
      projectObjectUrlsRef.current.push(src);
      const candidates = missingByName.get(file.name.toLocaleLowerCase()) ?? [];
      const target = candidates.shift();
      if (target) replacements.set(target.id, { ...target, src, local: true, missing: false, byteSize: file.size });
      else incoming.push({ id: `${uploadId}-${index}`, name: file.name, src, local: true, byteSize: file.size });
      referenceById.set(target?.id ?? `${uploadId}-${index}`, references.get(file)!);
    });
    setAssets((items) => [...incoming, ...items.map((item) => replacements.get(item.id) ?? item)]);
    // Decodes everything in the background and records the dimensions before the user navigates.
    // That way switching images does not have to wait for the selected file to load.
    const addedAssets = [...incoming, ...replacements.values()];
    void Promise.all(addedAssets.map(async (item) => ({ id: item.id, dimensions: await readImageDimensions(item.src), reference: referenceById.get(item.id) }))).then((resolved) => {
      const dimensionsById = new Map(resolved.filter((item) => item.dimensions).map((item) => [item.id, { ...item.dimensions!, reference: item.reference }]));
      if (!dimensionsById.size) return;
      setAssets((items) => items.map((item) => {
        const dimensions = dimensionsById.get(item.id);
        if (!dimensions) return item;
        const { reference, ...size } = dimensions;
        const geo = reference?.transform ? geoReference(item.name, size.width, size.height, reference) : item.geo;
        return { ...item, ...size, geo };
      }));
    });
    const nextCurrent = replacements.values().next().value?.id ?? incoming[0]?.id;
    if (nextCurrent) setCurrent(nextCurrent);
    setSaved(false); setLeftOpen(false);
    if (replacements.size) showToast(`${replacements.size} ${copy.projectImagesRestored}`);
  }

  function toggleAssetSelection(id: string) {
    setSelectedAssetIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  }

  function dragPosition(event: React.DragEvent<HTMLElement>): "before" | "after" {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  }

  function beginAssetReorder(event: React.DragEvent<HTMLButtonElement>, id: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setAssetReorder({ sourceId: id, targetId: null, position: "before" });
  }

  function moveAssetByKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const sourceIndex = assets.findIndex((item) => item.id === id);
    const targetIndex = sourceIndex + (event.key === "ArrowUp" ? -1 : 1);
    const target = assets[targetIndex];
    if (!target) return;
    setAssets((items) => reorderItems(items, id, target.id, event.key === "ArrowUp" ? "before" : "after"));
    setSaved(false);
  }

  function dropAsset(event: React.DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault(); event.stopPropagation();
    if (!assetReorder) return;
    const position = dragPosition(event);
    setAssets((items) => reorderItems(items, assetReorder.sourceId, targetId, position));
    if (assetReorder.sourceId !== targetId) setSaved(false);
    setAssetReorder(null);
  }

  function reorderCurrentAnnotations(sourceId: string, targetId: string, position: "before" | "after") {
    if (sourceId === targetId) return;
    setAnnotations((items) => {
      const reordered = reorderItems(items.filter((annotation) => annotation.asset === current), sourceId, targetId, position);
      let currentIndex = 0;
      return items.map((annotation) => annotation.asset === current ? reordered[currentIndex++] : annotation);
    });
    setSaved(false);
  }

  function beginAnnotationReorder(event: React.DragEvent<HTMLButtonElement>, id: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setAnnotationReorder({ sourceId: id, targetId: null, position: "before" });
  }

  function moveAnnotationByKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const sourceIndex = currentAnnotations.findIndex((annotation) => annotation.id === id);
    const targetIndex = sourceIndex + (event.key === "ArrowUp" ? -1 : 1);
    const target = currentAnnotations[targetIndex];
    if (!target) return;
    reorderCurrentAnnotations(id, target.id, event.key === "ArrowUp" ? "before" : "after");
  }

  function dropAnnotation(event: React.DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault(); event.stopPropagation();
    if (!annotationReorder) return;
    reorderCurrentAnnotations(annotationReorder.sourceId, targetId, dragPosition(event));
    setAnnotationReorder(null);
  }

  function deleteSelectedImages() {
    const ids = selectedAssetIds.length ? selectedAssetIds : asset ? [asset.id] : [];
    if (!ids.length) return;
    const names = assets.filter((item) => ids.includes(item.id));
    const annotationCount = annotations.filter((annotation) => ids.includes(annotation.asset)).length;
    if (!window.confirm(`${copy.confirmDelete}: ${names.length} imagem(ns)${annotationCount ? ` · ${annotationCount} ${copy.projectAnnotations}` : ""}?`)) return;
    names.forEach((item) => { if (item.src.startsWith("blob:")) URL.revokeObjectURL(item.src); });
    const remaining = assets.filter((item) => !ids.includes(item.id));
    setAssets(remaining);
    setAnnotations((items) => items.filter((annotation) => !ids.includes(annotation.asset)));
    setHiddenAnnotations((items) => items.filter((id) => !annotations.some((annotation) => annotation.id === id && ids.includes(annotation.asset))));
    setSelectedAssetIds([]); setCurrent(remaining[0]?.id ?? "");
    setSelected(null); setMultiSelected([]); setSelectedVertex(null); resetDrafts(); setSaved(false);
  }

  async function importCephalometricLandmarks(file: File, data: unknown) {
    type Landmark = { title?: unknown; symbol?: unknown; value?: { x?: unknown; y?: unknown } };
    type LandmarkDocument = { ceph_id?: unknown; landmarks?: Landmark[] };
    const document = data as LandmarkDocument;
    const cephId = document.ceph_id;
    if (typeof cephId !== "string" || !Array.isArray(document.landmarks)) throw new Error();
    const targetAsset = assets.find((item) => (selectedAssetIds.length === 0 || selectedAssetIds.includes(item.id)) && item.name.split(/[\\/]/).at(-1)!.replace(/\.[^.]+$/, "").toLocaleLowerCase() === cephId.toLocaleLowerCase());
    if (!targetAsset) {
      showToast(`A imagem ${cephId} não está carregada.`);
      return;
    }
    const dimensions = targetAsset.width && targetAsset.height
      ? { width: targetAsset.width, height: targetAsset.height }
      : await readImageDimensions(targetAsset.src);
    if (!dimensions) throw new Error();

    const nextLabels = [...labelsRef.current];
    const imported: Annotation[] = [];
    document.landmarks.forEach((landmark) => {
      const x = Number(landmark.value?.x); const y = Number(landmark.value?.y);
      const title = typeof landmark.title === "string" ? landmark.title.trim() : "";
      const symbol = typeof landmark.symbol === "string" ? landmark.symbol.trim() : "";
      if (!Number.isFinite(x) || !Number.isFinite(y) || (!symbol && !title)) return;
      const name = symbol || title;
      const existing = nextLabels.find((label) => label.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      const label = existing ?? { id: makeId("label"), name, color: nextLabelColor(nextLabels), key: "" };
      if (!existing) nextLabels.push(label);
      imported.push({
        id: makeId("landmark"), asset: targetAsset.id, label: label.id, type: "point",
        x: x / dimensions.width * 1000, y: y / dimensions.height * 650,
      });
    });
    if (!imported.length) throw new Error();
    labelsRef.current = nextLabels;
    setAssets((items) => items.map((item) => item.id === targetAsset.id ? { ...item, ...dimensions } : item));
    setLabels(nextLabels); setAnnotations((items) => [...items, ...imported]); setSaved(false);
    showToast(`${imported.length} landmarks carregados: ${file.name}`);
  }

  async function importCocoAnnotations(file: File, selectedIndexes?: number[], selectedGeometryTypes?: CocoGeometry[], skipChooser = false) {
    try {
      const data = JSON.parse(await file.text()) as { images?: CocoImage[]; categories?: CocoCategory[]; annotations?: CocoAnnotation[]; ceph_id?: unknown; landmarks?: unknown };
      if (typeof data.ceph_id === "string" && Array.isArray(data.landmarks)) {
        await importCephalometricLandmarks(file, data);
        return;
      }
      if (!Array.isArray(data.images) || !Array.isArray(data.categories) || !Array.isArray(data.annotations)) {
        showToast(cocoFormatMessage(language));
        return;
      }
      const importAssets = selectedAssetIds.length ? assets.filter((item) => selectedAssetIds.includes(item.id)) : assets;
      const assetByName = new Map(importAssets.map((item) => [item.name.split(/[\\/]/).at(-1)!.toLocaleLowerCase(), item]));
      const images = new Map(data.images.filter((item) => typeof item.id === "number" && typeof item.file_name === "string")
        .map((item) => [item.id!, { ...item, asset: assetByName.get(item.file_name!.split(/[\\/]/).at(-1)!.toLocaleLowerCase()) }]));
      // Records the real dimensions before inserting the masks. Without this, switching to
      // an image not yet visited started at the default 1000×650 aspect ratio and deformed
      // the SVG for one frame until the photo's onLoad reported its size.
      const dimensionsByAsset = new Map<string, { width: number; height: number }>();
      images.forEach((image) => {
        if (!image.asset) return;
        const width = Number(image.width); const height = Number(image.height);
        if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
          dimensionsByAsset.set(image.asset.id, { width, height });
        }
      });
      const categoryById = new Map((data.categories ?? []).filter((item) => typeof item.id === "number" && typeof item.name === "string")
        .map((item) => [item.id!, item.name!.trim()]));
      const keypointNamesByCategory = new Map((data.categories ?? []).filter((item) => typeof item.id === "number")
        .map((item) => [item.id!, keypointNames(item.keypoints)]));
      const candidates = data.annotations.flatMap((item, index) => {
        const image = typeof item.image_id === "number" ? images.get(item.image_id) : undefined;
        if (!image?.asset) return [];
        const segmentationRings = Array.isArray(item.segmentation)
          ? item.segmentation.every((value) => typeof value === "number") ? [item.segmentation] : item.segmentation.filter(Array.isArray)
          : [];
        const hasPolygon = segmentationRings.some((ring) => ring.length >= 6);
        const hasLandmarks = landmarkCoordinates(item.keypoints ?? item.landmarks).length > 0;
        const hasBox = Array.isArray(item.bbox) && item.bbox.length >= 4 && item.bbox.slice(0, 4).every((value) => Number.isFinite(Number(value)));
        if (!hasPolygon && !hasLandmarks && !hasBox) return [];
        const geometries: CocoGeometry[] = [hasBox ? "box" : null, hasLandmarks ? "point" : null, hasPolygon ? "polygon" : null].filter((type): type is CocoGeometry => type !== null);
        return [{ index, imageName: image.file_name ?? image.asset.name, labelName: typeof item.category_id === "number" ? categoryById.get(item.category_id) ?? copy.unlabeled : copy.unlabeled, geometries } satisfies CocoImportCandidate];
      });
      if (!candidates.length) { showToast("Nenhuma anotaÃ§Ã£o COCO corresponde Ã s imagens carregadas."); return; }
      if (!selectedIndexes && !skipChooser && candidates.length > 1) {
        setCocoImportPlan({ file, candidates });
        setSelectedCocoAnnotationIndexes(candidates.map((candidate) => candidate.index));
        setSelectedCocoGeometryTypes(["box", "point", "polygon"]);
        setCocoImportTab("categories");
        return;
      }
      const selectedIndexesSet = new Set(selectedIndexes ?? candidates.map((candidate) => candidate.index));
      const geometryTypes = new Set<CocoGeometry>(selectedGeometryTypes ?? ["box", "point", "polygon"]);
      const nextLabels = [...labelsRef.current];
      const labelByCategory = new Map<number, string>();
      categoryById.forEach((name, categoryId) => {
        const existing = nextLabels.find((label) => label.name.toLocaleLowerCase() === name.toLocaleLowerCase());
        const label = existing ?? { id: makeId("label"), name, color: nextLabelColor(nextLabels), key: "" };
        if (!existing) nextLabels.push(label);
        labelByCategory.set(categoryId, label.id);
      });
      const imported: Annotation[] = [];
      data.annotations.forEach((item, index) => {
        if (!selectedIndexesSet.has(index)) return;
        const image = typeof item.image_id === "number" ? images.get(item.image_id) : undefined;
        const targetAsset = image?.asset;
        if (!targetAsset) return;
        const [x, y, width, height] = Array.isArray(item.bbox) ? item.bbox.slice(0, 4).map(Number) : [NaN, NaN, NaN, NaN];
        const sourceWidth = Number(image.width) || targetAsset.width || 1000;
        const sourceHeight = Number(image.height) || targetAsset.height || 650;
        const sx = 1000 / sourceWidth; const sy = 650 / sourceHeight;
        const label = typeof item.category_id === "number" ? labelByCategory.get(item.category_id) ?? UNLABELED_ID : UNLABELED_ID;
        // COCO allows several rings in one annotation. The editor works with one ring per
        // polygon, so each valid contour becomes its own annotation — that way a main part
        // in the second ring does not disappear, as it did in 13.jpg.
        const segmentationRings = Array.isArray(item.segmentation)
          ? item.segmentation.every((value) => typeof value === "number") ? [item.segmentation] : item.segmentation.filter(Array.isArray)
          : [];
        const polygons = segmentationRings
            .map((ring) => ring.map(Number))
            .filter((ring) => ring.length >= 6 && ring.length % 2 === 0 && ring.every(Number.isFinite))
          ;
        const landmarks = landmarkPoints(item.keypoints ?? item.landmarks);
        if (!polygons.length && !landmarks.length && ![x, y, width, height].every(Number.isFinite)) return;
        if (polygons.length && geometryTypes.has("polygon")) {
          polygons.forEach((polygon) => imported.push({
            id: makeId("coco"), asset: targetAsset.id, label, type: "polygon",
            pts: polygon.map((value, index) => value * (index % 2 ? sy : sx)),
          }));
        }
        if (landmarks.length && geometryTypes.has("point")) {
          const annotationNames = keypointNames(item.keypoint_names ?? item.landmark_names);
          const categoryNames = typeof item.category_id === "number" ? keypointNamesByCategory.get(item.category_id) ?? [] : [];
          landmarks.forEach((landmark) => {
            const name = annotationNames[landmark.index] || categoryNames[landmark.index];
            const existing = name ? nextLabels.find((candidate) => candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase()) : undefined;
            const pointLabel = existing ?? (name ? { id: makeId("label"), name, color: nextLabelColor(nextLabels), key: "" } : null);
            if (pointLabel && !existing) nextLabels.push(pointLabel);
            imported.push({ id: makeId("coco"), asset: targetAsset.id, label: pointLabel?.id ?? label, type: "point", x: landmark.x * sx, y: landmark.y * sy });
          });
        }
        if ([x, y, width, height].every(Number.isFinite) && geometryTypes.has("box")) {
          imported.push({ id: makeId("coco"), asset: targetAsset.id, label, type: "box", x: x * sx, y: y * sy, w: width * sx, h: height * sy });
        }
      });
      if (!imported.length) { showToast("Nenhuma anotação COCO corresponde às imagens carregadas."); return; }
      setAssets((items) => items.map((item) => {
        const dimensions = dimensionsByAsset.get(item.id);
        return dimensions ? { ...item, ...dimensions } : item;
      }));
      labelsRef.current = nextLabels;
      setLabels(nextLabels); setAnnotations((items) => [...items, ...imported]); setSaved(false);
      showToast(`${imported.length} anotações COCO carregadas.`);
    } catch { showToast("Não foi possível ler o arquivo COCO JSON."); }
  }

  async function importAnnotationFiles(selectedFiles: File[]) {
    if (!selectedFiles.length) return;
    for (const file of selectedFiles) {
      // A batch is an explicit request to load everything. The per-file chooser remains
      // available when a single COCO file is selected.
      await importCocoAnnotations(file, undefined, undefined, true);
    }
    if (selectedAssetIds.length) showToast(`Importação concluída apenas para as ${selectedAssetIds.length} imagens selecionadas.`);
  }

  // The crop enters as a regular image: that is what makes every existing tool, SAM
  // included, work over a COG with no change to them.
  function recorteVirouAsset(recorte: Recorte, nomeOrigem: string) {
    const src = URL.createObjectURL(recorte.blob);
    projectObjectUrlsRef.current.push(src);
    const base = nomeOrigem.split(/[\\/]/).pop() ?? nomeOrigem;
    const semExtensao = base.replace(/\.[^.]+$/, "");
    const janela = recorte.window;
    const asset: Asset = {
      id: makeId("cog"),
      name: `${semExtensao}-${Math.round(janela.x)}-${Math.round(janela.y)}.png`,
      src,
      local: true,
      byteSize: recorte.blob.size,
      width: recorte.largura,
      height: recorte.altura,
      geo: recorte.geo,
    };
    setAssets((items) => [asset, ...items]);
    setCurrent(asset.id);
    setSaved(false);
    setCogFila((atual) => atual.slice(1));
    showToast(copy.cogCropAdded);
  }

  function addClass() {
    const name = newLabel.trim();
    if (!name) return;
    const existing = labels.find((label) => label.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) {
      setActiveLabel(existing.id); setBatchLabel(existing.id); setNewLabel("");
      showToast(fill(copy.toastClassExists, { name: existing.name }));
      requestAnimationFrame(() => labelInputRef.current?.focus());
      return;
    }
    const id = makeId("label");
    const key = Array.from({ length: 9 }, (_, index) => String(index + 1)).find((candidate) => !labels.some((label) => label.key === candidate)) ?? "";
    const created: Label = { id, name, color: newLabelColor, key };
    setLabels((items) => [...items, created]);
    setActiveLabel(id); setBatchLabel(id); setNewLabel(""); setSaved(false);
    // Leaves the next class with an unused colour already; the user can still change it by hand.
    setNewLabelColor(nextLabelColor([...labels, created]));
    showToast(fill(copy.toastClassCreated, { name }));
    requestAnimationFrame(() => labelInputRef.current?.focus());
  }

  function requestClassDeletion(classIds: string[]) {
    const validIds = classIds.filter((id, index) => id !== UNLABELED_ID && classIds.indexOf(id) === index && labels.some((label) => label.id === id));
    if (validIds.length) setPendingDeleteClassIds(validIds);
  }

  function beginLabelRename(label: Label) {
    if (label.id === UNLABELED_ID) return;
    setEditingLabelId(label.id);
    setEditingLabelName(label.name);
  }

  function cancelLabelRename() {
    setEditingLabelId(null);
    setEditingLabelName("");
  }

  function saveLabelRename(labelId: string) {
    const label = labels.find((item) => item.id === labelId);
    const name = editingLabelName.trim();
    if (!label || label.id === UNLABELED_ID) { cancelLabelRename(); return; }
    if (!name) {
      showToast(copy.classNameRequired);
      return;
    }
    const duplicate = labels.find((item) => item.id !== labelId && item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) {
      showToast(fill(copy.toastClassExists, { name: duplicate.name }));
      return;
    }
    if (name !== label.name) {
      const affected = annotations.filter((annotation) => annotation.label === labelId).length;
      setLabels((items) => items.map((item) => item.id === labelId ? { ...item, name } : item));
      setSaved(false);
      showToast(fill(copy.toastClassRenamed, { name, n: affected }));
    }
    cancelLabelRename();
  }

  function deletePendingAnnotations() {
    const ids = pendingDeleteAnnotationIds.filter((id, index) => pendingDeleteAnnotationIds.indexOf(id) === index && annotations.some((annotation) => annotation.id === id));
    if (!ids.length) { setPendingDeleteAnnotationIds([]); return; }
    remember();
    setAnnotations((items) => items.filter((annotation) => !ids.includes(annotation.id)));
    setHiddenAnnotations((items) => items.filter((id) => !ids.includes(id)));
    setSelected(null); setMultiSelected([]); setSelectedVertex(null); setPendingDeleteAnnotationIds([]); setSaved(false);
    showToast(`${ids.length} ${copy.annotationsDeleted}`);
  }

  function requestDeleteAllAnnotations() {
    const scoped = selectedAssetIds.length
      ? annotations.filter((annotation) => selectedAssetIds.includes(annotation.asset))
      : annotations;
    if (!scoped.length) {
      showToast(selectedAssetIds.length ? "As imagens selecionadas não têm anotações para excluir." : "Não há anotações para excluir.");
      return;
    }
    setPendingDeleteAnnotationIds(scoped.map((annotation) => annotation.id));
  }

  function deletePendingClasses() {
    const ids = pendingDeleteClassIds.filter((id) => id !== UNLABELED_ID && labels.some((label) => label.id === id));
    if (!ids.length) { setPendingDeleteClassIds([]); return; }
    const deletedIds = new Set(ids);
    const deletedLabels = labels.filter((label) => deletedIds.has(label.id));
    const reassignedCount = annotations.filter((annotation) => deletedIds.has(annotation.label)).length;
    const remainingLabels = labels.filter((item) => !deletedIds.has(item.id));
    const needsUnlabeled = reassignedCount > 0 || remainingLabels.length === 0;
    const fallback = remainingLabels.find((item) => item.id === UNLABELED_ID)
      ?? (needsUnlabeled ? unlabeledLabel(copy.unlabeled) : remainingLabels[0])
      ?? unlabeledLabel(copy.unlabeled);
    if (reassignedCount) remember();
    setLabels(needsUnlabeled && !remainingLabels.some((item) => item.id === UNLABELED_ID)
      ? [...remainingLabels, fallback]
      : remainingLabels);
    if (reassignedCount) {
      setAnnotations((items) => items.map((annotation) => deletedIds.has(annotation.label) ? { ...annotation, label: UNLABELED_ID } : annotation));
      setSaved(false);
    }
    setHiddenLabels((items) => items.filter((id) => !deletedIds.has(id) && (!reassignedCount || id !== UNLABELED_ID)));
    if (deletedIds.has(activeLabel)) setActiveLabel(fallback?.id ?? UNLABELED_ID);
    if (deletedIds.has(batchLabel)) setBatchLabel(fallback?.id ?? UNLABELED_ID);
    setSelectedClassIds((items) => items.filter((id) => !deletedIds.has(id)));
    setPendingDeleteClassIds([]); setSaved(false);
    showToast(reassignedCount
      ? fill(copy.toastClassesDeletedMoved, { n: deletedLabels.length, m: reassignedCount, label: copy.unlabeled })
      : fill(copy.toastClassesDeleted, { n: deletedLabels.length }));
  }

  function reclassifySelection() {
    if (!selectedIds.length || !resolvedBatchLabel) return;
    const label = labels.find((item) => item.id === resolvedBatchLabel);
    if (!label) return;
    remember();
    setAnnotations((items) => items.map((annotation) => selectedIds.includes(annotation.id) ? { ...annotation, label: resolvedBatchLabel } : annotation));
    setSaved(false);
    showToast(fill(copy.toastReclassified, { n: selectedIds.length, name: label.name }));
  }

  function beginProjectRename() {
    renameCancelledRef.current = false;
    setProjectNameDraft(projectName); setProjectEditing(true); setProjectOpen(false);
    requestAnimationFrame(() => { projectInputRef.current?.focus(); projectInputRef.current?.select(); });
  }

  // Esc gives up the edit. The ref flag exists because leaving edit mode unmounts the field
  // and can fire blur, which also saves — without it, Esc would end up confirming.
  function cancelProjectRename() {
    renameCancelledRef.current = true;
    setProjectEditing(false);
  }

  function saveProjectName() {
    if (renameCancelledRef.current) { renameCancelledRef.current = false; return; }
    const name = projectNameDraft.trim();
    setProjectEditing(false); setProjectOpen(false);
    if (!name || name === projectName) return;
    setProjectName(name); setSaved(false);
    showToast(copy.toastProjectRenamed);
  }

  function requestOpenProject() {
    if (!saved && !window.confirm(copy.replaceUnsavedProject)) return;
    const picker = openProjectInputRef.current;
    if (!picker) return;
    setProjectOpen(false);
    picker.value = "";
    try {
      if (typeof picker.showPicker === "function") picker.showPicker();
      else picker.click();
    } catch { picker.click(); }
  }

  function requestNewProject() {
    if (projectBusy) return;
    const hasProjectContent = assets.length > 0 || annotations.length > 0 || labels.some((label) => label.id !== UNLABELED_ID) || !saved;
    if (hasProjectContent && !window.confirm(copy.replaceUnsavedWithNewProject)) return;
    projectObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    projectObjectUrlsRef.current = [];
    if (input.current) input.current.value = "";
    if (openProjectInputRef.current) openProjectInputRef.current.value = "";
    idCounter.current = 0;
    setProjectName(copy.newProject); setProjectNameDraft("");
    setAssets([]); setCurrent(""); setAnnotations([]); setLabels([unlabeledLabel(copy.unlabeled)]);
    setActiveLabel(UNLABELED_ID); setBatchLabel(UNLABELED_ID); setHistory([]); setRedoHistory([]); setNewLabelColor(colors[0]);
    annotationSelectionAnchorRef.current = null;
    setSelected(null); setMultiSelected([]); setSelectedVertex(null); setSelectedClassIds([]); setSelectedAssetIds([]);
    setPendingDeleteAnnotationIds([]); setPendingDeleteClassIds([]); setHiddenAnnotations([]); setHiddenLabels([]);
    setSearch(""); setQuality(false); setTool("select"); setZoom(92); resetDrafts();
    setPanelLayout(defaultPanelLayout());
    setProjectOpen(false); setProjectEditing(false); setProjectSaveOpen(false);
    setClassManagerOpen(false); setLeftOpen(false); setRightOpen(false); setSaved(true);
    showToast(copy.newProjectReady);
  }

  function requestHomeNavigation() {
    setProjectOpen(false);
    const hasProjectContent = assets.length > 0 || annotations.length > 0 || labels.some((label) => label.id !== UNLABELED_ID) || !saved;
    if (hasProjectContent && !window.confirm(copy.confirmLeaveHome)) return;
    window.location.assign("/");
  }

  async function loadProjectFile(file: File) {
    setProjectBusy(true);
    try {
      const loaded = await openPoligomeProject(file, copy);
      projectObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      projectObjectUrlsRef.current = loaded.objectUrls;
      const firstLabel = loaded.labels.find((label) => label.id !== UNLABELED_ID) ?? loaded.labels[0];
      setProjectName(loaded.projectName); setAssets(loaded.assets); setAnnotations(loaded.annotations); setLabels(loaded.labels);
      setCurrent(loaded.assets[0].id); setActiveLabel(firstLabel.id); setBatchLabel(firstLabel.id);
      setPanelLayout(normalizePanelLayout(loaded.layout));
      setNewLabelColor(nextLabelColor(loaded.labels));
      setHistory([]); setRedoHistory([]); setSelected(null); setMultiSelected([]); setSelectedVertex(null); setHiddenAnnotations([]); setHiddenLabels([]);
      setSearch(""); setTool("select"); resetDrafts(); setProjectOpen(false); setLeftOpen(loaded.missingImages > 0); setSaved(true);
      showToast(loaded.missingImages
        ? `${copy.projectOpened}. ${loaded.missingImages} ${copy.projectImagesNeedReload}`
        : `${copy.projectOpened}: ${file.name}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.projectOpenError);
    } finally { setProjectBusy(false); }
  }

  function openSaveProjectDialog() {
    if (!assets.length) {
      setLeftOpen(true);
      showToast(copy.emptyProjectHint);
      return;
    }
    setProjectSaveMode(missingProjectImages ? "annotations" : "complete");
    setProjectOpen(false); setProjectSaveOpen(true);
  }

  async function savePortableProject(mode: ProjectSaveMode) {
    if (mode === "complete" && missingProjectImages) return;
    setProjectBusy(true);
    try {
      const fileName = await savePoligomeProject(projectName, assets, labels, annotations, mode, copy, panelLayout);
      setSaved(true); setProjectOpen(false); setProjectSaveOpen(false);
      showToast(`${copy.projectSaved}: ${fileName}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : copy.projectSaveError);
    } finally { setProjectBusy(false); }
  }

  async function exportData(kind: "coco" | "yolo" | "geojson" | "project") {
    if (!assets.length) { setProjectOpen(false); setLeftOpen(true); showToast(copy.emptyProjectHint); return; }
    if (kind === "project") { openSaveProjectDialog(); return; }
    setExporting(true);
    try {
      if (kind === "coco") exportCoco(assets, labels, annotations);
      if (kind === "yolo") await exportYoloZip(assets, labels, annotations, copy.yoloReadme);
      if (kind === "geojson") {
        // With no COG crop there is no origin and no scale, and a GeoJSON in pixel
        // coordinates would be worse than none: it looks georeferenced and is not.
        const semGeo = !assets.some((asset) => asset.geo);
        if (semGeo) { setExporting(false); showToast(copy.errGeoJsonNoGeo); return; }
        exportGeoJson(assets, labels, annotations);
      }
      setProjectOpen(false);
      showToast(kind === "yolo" ? copy.toastExportYolo
        : kind === "geojson" ? copy.toastExportGeoJson : copy.toastExportFile);
    } catch (error) { const key = error instanceof Error ? error.message : ""; showToast(copy[key as keyof TranslationCopy] ?? copy.toastExportFailed); }
    finally { setExporting(false); }
  }

  async function probeSam(endpoint: string) {
    setSamConnectionState("checking");
    try {
      const url = new URL(endpoint);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
        setSamConnectionState("offline"); return false;
      }
      const healthUrl = `${url.origin}${url.pathname.replace(/\/predict\/?$/, "")}/health`;
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(6_000) });
      if (!response.ok) throw new Error();
      const health = await response.json() as { status?: string; device?: string; model_type?: string };
      if (health.status !== "ready") {
        setSamConnectionState("loading");
        setSamRuntime(health.model_type ? `${health.model_type} · ${health.device ?? copy.samLoadingDevice}` : "");
        return false;
      }
      setSamConnectionState("ready");
      setSamRuntime([health.model_type, health.device].filter(Boolean).join(" · "));
      return true;
    } catch {
      setSamConnectionState("offline"); setSamRuntime(""); return false;
    }
  }
  function openSamSettings() {
    const endpoint = samEndpoint || "http://127.0.0.1:7860/predict";
    setSamEndpointDraft(endpoint); setSamOpen(true);
    void probeSam(endpoint);
  }
  async function connectSam() {
    const endpoint = samEndpointDraft.trim();
    if (!await probeSam(endpoint)) {
      showToast(copy.toastSamNotReady);
      return;
    }
    setSamEndpoint(endpoint); localStorage.setItem("poligome-sam-endpoint", endpoint);
    clearSam(); setSamPromptMode(1); setSamOpen(false); setTool("sam"); showToast(copy.toastSamConnected);
  }
  function activateSam() {
    if (tool === "sam") {
      clearSam(); setTool("select"); showToast(copy.samToolDisabled); return;
    }
    if (!samEndpoint) { openSamSettings(); return; }
    clearSam(); setSamPromptMode(1); setTool("sam"); showToast(copy.samToolEnabled);
  }
  function acceptSamMask() {
    if (samPreview.length < 6) return;
    remember(); const id = makeId("sam");
    setAnnotations((items) => [...items, { id, asset: current, label: activeLabel, type: "polygon", pts: [...samPreview] }]);
    setSelected(id); setMultiSelected([id]); setSelectedVertex(null); setBatchLabel(activeLabel);
    // The tool stays active for the next object; only the prompts are cleared.
    clearSam(); setSamPromptMode(1); showToast(copy.samSavedToolActive);
  }
  function clearSam() { samRequestRef.current += 1; setSamPrompts([]); setSamPreview([]); setSamLoading(false); }
  function restartSam() { clearSam(); setSamPromptMode(1); showToast(copy.samRestarted); }
  function chooseImage(id: string) {
    const target = assets.find((item) => item.id === id);
    if (!target) return;
    const index = assets.findIndex((item) => item.id === id);
    assets.slice(Math.max(0, index - 2), index + 3).forEach((item) => { if (!item.missing) warmImage(item.src); });
    if (target.width && target.height) setZoom(zoomToFit(target));
    annotationSelectionAnchorRef.current = null;
    setCurrent(id); setSelected(null); setMultiSelected([]); setSelectedVertex(null); resetDrafts(); setLeftOpen(false);
  }
  function go(direction: number) {
    if (!assets.length) return;
    const index = Math.max(0, assets.findIndex((item) => item.id === current));
    chooseImage(assets[Math.max(0, Math.min(assets.length - 1, index + direction))].id);
  }

  const editorHint = tool === "polygon" && polygonDraft.length > 0
    ? copy.polygonFinish
    : tool === "line"
      ? lineDraft.length ? copy.lineFinish : copy.lineStart
      : tool === "freehand"
        ? freehandDrawing ? copy.freehandFinish : copy.freehandStart
        : tool === "split"
          ? copy.splitTip
          : tool === "transform"
            ? copy.transformTip
            : tool === "reshape"
              ? reshapeDrawing ? (reshapeStartInside ? copy.reshapeAdd : copy.reshapeDelete) : copy.reshapeStart
              : activeAnnotation?.type === "polygon" && tool === "select"
                ? `${copy.middlePan} · ${copy.polygonTipDetail}`
                : null;
  const statusMessage = toast
    ?? (annotationDrag ? `${copy.moving} (${annotationDrag.originals.length})`
      : selectionMarquee ? copy.selecting
        : transformDrag ? copy.transforming
          : reshapeDrawing ? copy.reshaping
            : selectedVertex ? fill(copy.statusVertexSelected, { status: snapping ? copy.snapStateOn : copy.snapStateOff })
              : editorHint
                ?? (polygonDraft.length || lineDraft.length ? fill(copy.statusDraftPoints, { n: (polygonDraft.length + lineDraft.length) / 2 })
                  : multiSelected.length > 1 ? `${multiSelected.length} ${copy.selectedObjects}`
                    : currentAnnotations.length ? `${currentAnnotations.length} ${copy.imageAnnotations}`
                      : asset ? copy.ready : copy.emptyProjectTitle));

  if (!mounted) return <main className="shell app-loading" aria-busy="true"><div className="loading-card"><BrandLockup height={34} /></div></main>;

  return <main className="shell">
    <header className="topbar">
      <input hidden ref={openProjectInputRef} type="file" accept=".plgm,application/zip,application/vnd.poligome.project+zip" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void loadProjectFile(file); }} />
      <div className="topbar-main">
      <div className="brand-side">
        <button className="mobile" onClick={() => setLeftOpen(true)} aria-label={copy.openImages}><Menu size={19} /></button>
        <span className="brand-static"><BrandLockup height={28} /></span><i />
        <button className="home-return" title={copy.homeHint} aria-label={copy.home} onClick={requestHomeNavigation}><House size={15} /><span>{copy.home}</span></button>
        {projectEditing
          ? <input className="project-name-input" ref={projectInputRef} value={projectNameDraft}
              aria-label={copy.renameProject} maxLength={80}
              onChange={(event) => setProjectNameDraft(event.target.value)}
              onBlur={saveProjectName}
              onKeyDown={(event) => { if (event.key === "Enter") saveProjectName(); if (event.key === "Escape") cancelProjectRename(); }} />
          : <button className="project-name" title={copy.renameProject} onClick={beginProjectRename}><em /><span>{projectName}</span><Pencil size={13} /></button>}
      </div>
      {/* Abrir, salvar, exportar e preferências vivem no menu Arquivo; aqui ficam apenas o
          estado da sessão, a conexão do SAM e o selo de execução local. */}
      <div className="head-actions"><button className="new-project-main" disabled={projectBusy} title={copy.newProjectHint} onClick={requestNewProject}><Plus size={15} /><span>{copy.newProject}</span></button><span className={`save ${saved ? "done" : ""}`}>{projectBusy ? <LoaderCircle className="spin" size={14} /> : <HardDriveDownload size={14} />}{saved ? copy.saved : copy.saving}</span><button className={`sam-connection ${samEndpoint ? "connected" : ""}`} onClick={openSamSettings}><Link2 size={14} />{samEndpoint ? copy.samActive : copy.activateSam}</button><span className="local-mode" title={copy.localOnlyHint}><ShieldCheck size={14} />{copy.localOnly}</span><a className="source-link" href={SOURCE_URL} target="_blank" rel="noreferrer" title={copy.sourceCode}><CodeXml size={14} /><span>{copy.sourceCode}</span></a><button className="mobile" onClick={() => setRightOpen(true)} aria-label={copy.classes}><MoreHorizontal size={19} /></button></div>
      </div>
      <nav className="menubar" aria-label={copy.fileMenu}>
        <div className="menu" ref={projectSwitcherRef}>
          <button className={`menu-trigger ${projectOpen ? "open" : ""}`} aria-haspopup="menu" aria-expanded={projectOpen} onClick={() => { setProjectOpen((value) => !value); setProjectEditing(false); }}>{copy.fileMenu}<ChevronDown size={13} /></button>
          {projectOpen && <div className="project-pop menu-pop" role="menu" aria-label={copy.fileMenu}>
            <div className="project-summary"><span><em />{projectName}</span><small>{assets.length} {copy.projectImages} · {annotations.length} {copy.projectAnnotations}</small></div>
              <button role="menuitem" disabled={projectBusy} onClick={requestNewProject}><Plus size={14} /><span><b>{copy.newProject}</b><small>{copy.newProjectHint}</small></span></button>
              <button role="menuitem" disabled={projectBusy} onClick={requestOpenProject}><FolderUp size={14} /><span><b>{copy.openProject}</b><small>{copy.openProjectHint}</small></span></button>
              <button role="menuitem" disabled={projectBusy} onClick={openSaveProjectDialog}><Save size={14} /><span><b>{copy.saveProject}</b><small>{copy.saveProjectHint}</small></span></button>
              <button role="menuitem" onClick={beginProjectRename}><Pencil size={14} /><span><b>{copy.renameProject}</b><small>{projectName}</small></span></button>
              <i className="menu-separator" />
              <p>{copy.exportFormat}</p>
              <button role="menuitem" disabled={exporting || projectBusy} onClick={() => void exportData("coco")}><FileText size={14} /><span><b>COCO JSON</b><small>{copy.cocoDesc}</small></span></button>
              <button role="menuitem" disabled={exporting || projectBusy} onClick={() => void exportData("yolo")}><HardDriveDownload size={14} /><span><b>YOLO ZIP</b><small>{copy.yoloDesc}</small></span></button>
              <button role="menuitem" disabled={exporting || projectBusy} onClick={() => void exportData("geojson")}><Globe size={14} /><span><b>GeoJSON</b><small>{copy.geojsonDesc}</small></span></button>
              <button role="menuitem" disabled={exporting || projectBusy} onClick={() => void exportData("project")}><Download size={14} /><span><b>Poligome</b><small>{copy.projectBackup}</small></span></button>
              <i className="menu-separator" />
              <button role="menuitem" onClick={() => { setProjectOpen(false); setPreferencesOpen(true); }}><Settings2 size={14} /><span><b>{copy.preferences}</b><small>{copy.appearance} · {copy.language}</small></span></button>
          </div>}
        </div>
      </nav>
    </header>

    <div className={`workspace ${resizingPanel ? "resizing-panels" : ""}`} style={{ gridTemplateColumns: `${leftPanelCollapsed ? 34 : panelLayout.leftPanelWidth}px minmax(0,1fr) ${rightPanelCollapsed ? 34 : panelLayout.rightPanelWidth}px` }}>
      <aside className={`assets ${leftOpen ? "open" : ""} ${leftPanelCollapsed ? "collapsed" : ""}`}>
        <button className="sidebar-restore sidebar-restore-left" title={copy.showImagesPanel} aria-label={copy.showImagesPanel} onClick={() => setLeftPanelCollapsed(false)}><PanelLeftOpen size={17} /></button>
        <div className="drawer-head"><b>{copy.images}</b><button onClick={() => setLeftOpen(false)}><X size={19} /></button></div>
        <button type="button" className="panel-resizer panel-resizer-left" aria-label={copy.resizeImagesPanel} title={copy.resizeImagesPanel} onPointerDown={(event) => beginPanelResize(event, "left")} onPointerMove={movePanelResize} onPointerUp={finishPanelResize} onPointerCancel={finishPanelResize} onKeyDown={(event) => resizePanelWithKeyboard(event, "left")} />
        <div className="aside-title"><span>{copy.images} <b>{assets.length}</b></span><div><button title={copy.importImages} aria-label={copy.importImages} onClick={() => input.current?.click()}><Plus size={16} /></button><button title="Selecionar todas as imagens" aria-label="Selecionar todas as imagens" disabled={!assets.length} onClick={() => { const ids = assets.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).map((item) => item.id); setSelectedAssetIds((items) => ids.every((id) => items.includes(id)) ? items.filter((id) => !ids.includes(id)) : Array.from(new Set([...items, ...ids]))); }}><Check size={16} /></button><button title="Carregar anotações COCO ou landmarks" aria-label="Carregar anotações COCO ou landmarks" disabled={!assets.length} onClick={() => cocoInputRef.current?.click()}><FileText size={16} /></button><button title="Excluir imagens selecionadas" aria-label="Excluir imagens selecionadas" disabled={!asset && !selectedAssetIds.length} onClick={deleteSelectedImages}><Trash2 size={16} /></button></div></div>
        <button className="panel-collapse panel-collapse-left" title={copy.hideImagesPanel} aria-label={copy.hideImagesPanel} onClick={() => { setLeftPanelCollapsed(true); setLeftOpen(false); }}><PanelLeftClose size={16} /></button>
        <input hidden ref={input} type="file" accept="image/*,.tif,.tiff,.geotif,.geotiff,.btf,.tf8,.btf8,.tfw,.tifw,.jgw,.jpgw,.jpegw,.pgw,.pngw,.bpw,.bmpw,.gfw,.gifw,.wld,.prj,.aux.xml" multiple onChange={(event) => { const selected = event.currentTarget.files; void files(selected); event.currentTarget.value = ""; }} />
        <input hidden ref={cocoInputRef} type="file" accept="application/json,.json" multiple onChange={(event) => { const annotationFiles = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void importAnnotationFiles(annotationFiles); }} />
        <button className="import" title={copy.rasterImportHint} onClick={() => input.current?.click()}><ImagePlus size={16} /> {copy.importImages}</button>
        <small style={{ display: "block", padding: "0 12px 8px", opacity: 0.7 }}>{copy.rasterImportHint}</small>
        <label className="search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchImage} /></label>
        <div className="progress"><div><span>{copy.progress}</span><b>{completed} {copy.of} {assets.length}</b></div><i><em style={{ width: `${assets.length ? completed / assets.length * 100 : 0}%` }} /></i></div>
        <div className="asset-list">{assets.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).map((item, index) => {
          const count = annotations.filter((annotation) => annotation.asset === item.id).length;
          const isChecked = selectedAssetIds.includes(item.id);
          const details = item.missing ? copy.imageNotLoaded : item.width && item.height ? `${item.width} × ${item.height}` : copy.localImage;
          const dropClass = assetReorder?.targetId === item.id ? `drop-${assetReorder.position}` : "";
          return <div key={item.id} className={`asset-row ${current === item.id ? "active" : ""} ${item.missing ? "missing" : ""} ${assetReorder?.sourceId === item.id ? "dragging" : ""} ${dropClass}`} onDragOver={(event) => { if (!assetReorder) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; const position = dragPosition(event); if (assetReorder.targetId !== item.id || assetReorder.position !== position) setAssetReorder({ ...assetReorder, targetId: item.id, position }); }} onDrop={(event) => dropAsset(event, item.id)}>
            <button className="reorder-handle" draggable aria-label={`${copy.reorderImage}: ${item.name}`} title={copy.reorderImage} onDragStart={(event) => beginAssetReorder(event, item.id)} onDragEnd={() => setAssetReorder(null)} onKeyDown={(event) => moveAssetByKeyboard(event, item.id)}><GripVertical size={14} /></button>
            <button className={`asset-selector ${isChecked ? "selected" : ""}`} aria-label={`Selecionar imagem: ${item.name}`} aria-pressed={isChecked} onClick={() => toggleAssetSelection(item.id)}>{isChecked && <Check size={11} />}</button>
            <button className="asset-main" onClick={() => chooseImage(item.id)}>
              <div className="thumb" style={{ backgroundImage: item.src ? `url(${item.src})` : "none" }}><span>{String(index + 1).padStart(2, "0")}</span></div>
              <div><strong>{item.name}</strong><small>{details}{count > 0 ? ` · ${count} ${copy.projectAnnotations}` : ""}</small></div>
              <i className={count ? "checked" : ""}>{count ? "✓" : ""}</i>
            </button>
          </div>;
        })}</div>
        <div className="privacy"><ShieldCheck size={14} /> {copy.privacy}</div>
      </aside>

      <section className={`editor ${touchMode ? "touch-editor" : ""}`}>
        <div className="editor-controls">
        <div className="tools">
          <div><ToolButton title={copy.select} keyHint="V" disabled={!canEditImage} active={tool === "select"} onClick={() => changeTool("select")}><MousePointer2 size={18} /></ToolButton><ToolButton title={`${copy.pan} · ${copy.middlePan}`} keyHint="H" disabled={!canEditImage} active={tool === "pan"} onClick={() => changeTool("pan")}><Hand size={18} /></ToolButton><ToolButton title="Guias de coordenadas X/Y" disabled={!canEditImage} active={coordinatesGuide} onClick={() => { setCoordinatesGuide((value) => !value); setCursorPoint(null); }}><Crosshair size={18} /></ToolButton></div><i />
          <div><ToolButton title={copy.box} keyHint="B" disabled={!canEditImage} active={tool === "box"} onClick={() => changeTool("box")}><Square size={18} /></ToolButton><ToolButton title={copy.polygon} keyHint="P" disabled={!canEditImage} active={tool === "polygon"} onClick={() => changeTool("polygon")}><Pentagon size={18} /></ToolButton><ToolButton title={copy.freehand} keyHint="F" disabled={!canEditImage} active={tool === "freehand"} onClick={() => changeTool("freehand")}><PenLine size={18} /></ToolButton><ToolButton title={copy.line} keyHint="L" disabled={!canEditImage} active={tool === "line"} onClick={() => changeTool("line")}><Spline size={18} /></ToolButton><ToolButton title={copy.point} keyHint="K" disabled={!canEditImage} active={tool === "point"} onClick={() => changeTool("point")}><span className="point-icon" /></ToolButton><ToolButton title={tool === "sam" ? copy.samDeactivate : copy.sam} keyHint="S" disabled={!canEditImage} active={tool === "sam"} onClick={activateSam}><WandSparkles size={18} /></ToolButton></div><i />
          <div className="edit-tools"><ToolButton title={copy.simplify} disabled={!canEditImage || activeAnnotation?.type !== "polygon"} onClick={simplifySelected}><ListRestart size={18} /></ToolButton><ToolButton title={copy.duplicate} disabled={!canEditImage || activeAnnotation?.type !== "polygon"} onClick={duplicateSelected}><Copy size={17} /></ToolButton><ToolButton title={copy.merge} disabled={!canEditImage || selectedPolygons.length < 2} onClick={mergeSelected}><Combine size={18} /></ToolButton><ToolButton title="Adicionar buraco ao polígono (O)" keyHint="O" disabled={!canEditImage || activeAnnotation?.type !== "polygon"} active={tool === "ring"} onClick={() => changeTool("ring")}><CircleMinus size={17} /></ToolButton><ToolButton title={copy.split} disabled={!canEditImage || activeAnnotation?.type !== "polygon"} active={tool === "split"} onClick={() => changeTool("split")}><Scissors size={17} /></ToolButton><ToolButton title={copy.transform} keyHint="T" disabled={!canEditImage || (activeAnnotation?.type !== "polygon" && activeAnnotation?.type !== "box")} active={tool === "transform"} onClick={() => changeTool("transform")}><Maximize2 size={17} /></ToolButton><ToolButton title={copy.reshape} keyHint="R" disabled={!canEditImage || activeAnnotation?.type !== "polygon"} active={tool === "reshape"} onClick={() => changeTool("reshape")}><PenTool size={17} /></ToolButton><ToolButton title={snapping ? copy.snapOn : copy.snapOff} disabled={!canEditImage} active={snapping} onClick={() => { setSnapping((value) => !value); setSnapGuide(null); }}><Magnet size={17} /></ToolButton></div><i />
          <div><ToolButton title={copy.undo} disabled={!canEditImage || !history.length} onClick={undo}><Undo2 size={18} /></ToolButton><ToolButton title={copy.redo} disabled={!canEditImage || !redoHistory.length} onClick={redo}><Redo2 size={18} /></ToolButton><ToolButton title={selectedVertex ? copy.deleteVertexTitle : polygonDraft.length ? copy.removeLastPointTitle : copy.deleteShape} disabled={!canEditImage || (!selected && !polygonDraft.length && !lineDraft.length)} onClick={deleteSelection}><Trash2 size={18} /></ToolButton></div><span className="spacer" />
          <label className={`stroke-control ${!canEditImage ? "disabled" : ""}`} title={copy.lineThickness}><PenLine size={14} /><input aria-label={copy.lineThickness} disabled={!canEditImage} type="range" min="1" max="10" step="1" value={lineThickness} onChange={(event) => setLineThickness(Number(event.target.value))} /><output>{lineThickness}px</output></label><div className="zoom" title={copy.shiftZoom}><button aria-label={copy.zoomOut} disabled={!canEditImage} onClick={() => applyZoom(zoom - 10)}><ZoomOut size={15} /></button><span>{zoom}%</span><button aria-label={copy.zoomIn} disabled={!canEditImage} onClick={() => applyZoom(zoom + 10)}><ZoomIn size={15} /></button></div><ToolButton title={copy.fitImage} disabled={!canEditImage} onClick={fitImageToViewport}><Focus size={16} /></ToolButton><ToolButton title={copy.removeLoadedAnnotations} disabled={!annotations.length} className="clear-annotations-control" onClick={requestDeleteAllAnnotations}><Trash2 size={16} /></ToolButton>
        </div>
        {canEditImage && <div className="drawing-actions">
          <span className="touch-instructions">{tool === "select" ? copy.touchEdit : tool === "freehand" || tool === "reshape" ? copy.touchTrace : copy.touchDraw}</span>
          {(tool === "polygon" || tool === "ring" || tool === "line") && <>
            <button disabled={(tool === "line" ? lineDraft.length : polygonDraft.length) < (tool === "line" ? 4 : 6)} onClick={tool === "line" ? finishLine : finishPolygon}><Check size={16} />{copy.finishDrawing}</button>
            <button disabled={!(polygonDraft.length || lineDraft.length)} onClick={deleteSelection}><Undo2 size={16} />{copy.removeLastPointTitle}</button>
          </>}
          {["polygon", "ring", "line", "freehand", "reshape", "split"].includes(tool) && <button disabled={!(polygonDraft.length || lineDraft.length || freehandDrawing || reshapeDrawing || splitStart)} onClick={resetDrafts}><X size={16} />{copy.cancel}</button>}
          {tool === "select" && <>
            <button aria-pressed={addToSelection} onClick={() => { setAddToSelection((value) => !value); setSelectedVertex(null); }}><Combine size={16} />{copy.multipleSelection}</button>
            <button disabled={!selected} onClick={deleteSelection}><Trash2 size={16} />{selectedVertex ? copy.deleteVertexTitle : copy.deleteSelectedAnnotations}</button>
          </>}
        </div>}
        </div>

        <div className={`stage ${tool} ${panStart ? "panning" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const projectFile = Array.from(event.dataTransfer.files).find((file) => file.name.toLowerCase().endsWith(".plgm")); if (projectFile) { if (saved || window.confirm(copy.replaceUnsavedProject)) void loadProjectFile(projectFile); } else files(event.dataTransfer.files); }}><div className="scroll" ref={scrollRef} onPointerDownCapture={touchPointerDown} onPointerMoveCapture={touchPointerMove} onPointerUpCapture={(event) => touchPointerEnd(event)} onPointerCancelCapture={(event) => touchPointerEnd(event, true)} onPointerMove={(event) => { zoomAnchorRef.current = { x: event.clientX, y: event.clientY }; }} onPointerLeave={() => { zoomAnchorRef.current = null; setCursorPoint(null); }}>{asset ? <div className="canvas" style={{ width: `${zoom}%`, aspectRatio: `${asset.width ?? 1000}/${asset.height ?? 650}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {asset.missing ? <div className="missing-image"><Images size={34} /><b>{asset.name}</b><p>{copy.imageMissingHint}</p><button onClick={() => input.current?.click()}><FolderOpen size={15} />{copy.reloadProjectImages}</button></div> : imageWindow.map((item) => <img key={item.id} className={item.id === asset.id && readyImageIds.includes(item.id) ? "image-current" : "image-preload"} crossOrigin="anonymous" src={item.src} alt={item.id === asset.id ? fill(copy.annotationImageAlt, { name: item.name }) : ""} aria-hidden={item.id === asset.id ? undefined : true} draggable={false} onLoad={(event) => { const image = event.currentTarget; if (item.width !== image.naturalWidth || item.height !== image.naturalHeight) setAssets((items) => items.map((candidate) => candidate.id === item.id ? { ...candidate, width: image.naturalWidth, height: image.naturalHeight } : candidate)); void image.decode().then(() => setReadyImageIds((ids) => ids.includes(item.id) ? ids : [...ids, item.id]), () => setReadyImageIds((ids) => ids.includes(item.id) ? ids : [...ids, item.id])); }} />)}
          {!asset.missing && imageIsReady && <svg ref={svgRef} viewBox="0 0 1000 650" preserveAspectRatio="none" onPointerDown={canvasPointerDown} onPointerMove={canvasPointerMove} onPointerUp={canvasPointerUp} onPointerCancel={clearPointerDrafts} onAuxClick={(event) => event.preventDefault()} onContextMenu={finishDrawingWithRightClick} onDoubleClick={() => { if (touchMode) return; if (tool === "polygon" || tool === "ring") finishPolygon(); if (tool === "line") finishLine(); }}>
            {coordinatesGuide && cursorPoint && <g className={`coordinate-guide ${cursorOverCoordinateLabel ? "obscured" : ""}`} pointerEvents="none">
              <line x1={cursorPoint.x} y1="0" x2={cursorPoint.x} y2="650" />
              <line x1="0" y1={cursorPoint.y} x2="1000" y2={cursorPoint.y} />
              <g transform={`translate(${coordinateLabelX},${coordinateLabelY}) scale(${handleScale})`}>
                <rect width="116" height="22" rx="4" />
                <text x="7" y="15">X {Math.round(cursorPoint.x / 1000 * (asset.width ?? 1000))} · Y {Math.round(cursorPoint.y / 650 * (asset.height ?? 650))}</text>
              </g>
            </g>}
            {visibleAnnotations.map((annotation) => {
              const label = getLabel(annotation.label);
              const isSelected = multiSelected.includes(annotation.id);
              if (annotation.type === "box") {
                const x = annotation.x ?? 0; const y = annotation.y ?? 0; const width = annotation.w ?? 0; const height = annotation.h ?? 0;
                const centerX = x + width / 2; const centerY = y + height / 2; const degrees = (annotation.rotation ?? 0) * 180 / Math.PI;
                return <g className={tool === "select" ? "movable-annotation" : ""} key={annotation.id} onPointerDown={(event) => beginAnnotationDrag(event, annotation)} onPointerMove={moveAnnotationPointer} onPointerUp={finishAnnotationPointer} onPointerCancel={clearPointerDrafts}>
                  <g transform={`rotate(${degrees} ${centerX} ${centerY})`}>
                    <rect x={x} y={y} width={width} height={height} fill={`${label.color}28`} stroke={label.color} strokeWidth={(isSelected ? lineThickness + 2 : lineThickness) * handleScale} />
                  </g>
                </g>;
              }
              if (annotation.type === "polygon") return <g key={annotation.id}><path fillRule="evenodd" className={`${tool === "select" ? "movable-annotation" : ""} ${tool === "reshape" && annotation.id === selected ? "reshape-target" : ""}`.trim()} onPointerDown={(event) => beginAnnotationDrag(event, annotation)} onPointerMove={moveAnnotationPointer} onPointerUp={finishAnnotationPointer} onPointerCancel={clearPointerDrafts} d={polygonPath(annotation.pts ?? [], annotation.holes ?? [])} fill={`${label.color}30`} stroke={label.color} strokeWidth={(isSelected ? lineThickness + 2 : lineThickness) * handleScale} />{tool === "select" && isSelected && annotation.id === selected && multiSelected.length === 1 && edgeMidpoints(annotation.pts ?? []).map((midpoint) => <g key={`edge-${midpoint.edgeIndex}`}>{touchMode && <ellipse className="touch-handle-hit" onPointerDown={(event) => insertVertex(event, annotation, midpoint.edgeIndex, midpoint.x, midpoint.y)} onPointerMove={moveVertexPointer} onPointerUp={finishVertexPointer} onPointerCancel={clearPointerDrafts} cx={midpoint.x} cy={midpoint.y} rx={touchRadius} ry={touchRadius * markerAspect} strokeWidth={0} fill="transparent" />}<ellipse className="edge-handle" onPointerDown={(event) => insertVertex(event, annotation, midpoint.edgeIndex, midpoint.x, midpoint.y)} onPointerMove={moveVertexPointer} onPointerUp={finishVertexPointer} onPointerCancel={clearPointerDrafts} cx={midpoint.x} cy={midpoint.y} rx={markerRadius * .5} ry={markerRadius * .5 * markerAspect} strokeWidth={markerRadius * .22} /></g>)}{tool === "select" && isSelected && annotation.id === selected && multiSelected.length === 1 && (annotation.pts ?? []).map((coordinate, index, points) => index % 2 === 0 ? <g key={index}>{touchMode && <ellipse className="touch-handle-hit" onPointerDown={(event) => beginVertexDrag(event, annotation, index / 2)} onPointerMove={moveVertexPointer} onPointerUp={finishVertexPointer} onPointerCancel={clearPointerDrafts} cx={coordinate} cy={points[index + 1]} rx={touchRadius} ry={touchRadius * markerAspect} strokeWidth={0} fill="transparent" />}<ellipse className={`vertex-handle ${selectedVertex?.annotationId === annotation.id && selectedVertex.vertexIndex === index / 2 ? "selected" : ""}`} onPointerDown={(event) => beginVertexDrag(event, annotation, index / 2)} onPointerMove={moveVertexPointer} onPointerUp={finishVertexPointer} onPointerCancel={clearPointerDrafts} cx={coordinate} cy={points[index + 1]} rx={polygonHandleRadius(handleScale)} ry={polygonHandleRadius(handleScale) * markerAspect} fill="#fff" stroke={label.color} strokeWidth={polygonHandleRadius(handleScale) * .42} /></g> : null)}</g>;
              if (annotation.type === "line") return <g key={annotation.id}>
                {/* Traço invisível e largo: uma linha fina é alvo pequeno demais para o clique. */}
                <polyline className={`line-hit ${tool === "select" ? "movable-annotation" : ""}`} onPointerDown={(event) => beginAnnotationDrag(event, annotation)} onPointerMove={moveAnnotationPointer} onPointerUp={finishAnnotationPointer} onPointerCancel={clearPointerDrafts} points={pointsToSvg(annotation.pts)} strokeWidth={Math.max(14, lineThickness + 12)} />
                <polyline className="line-shape" points={pointsToSvg(annotation.pts)} stroke={label.color} strokeWidth={(isSelected ? lineThickness + 2 : lineThickness) * handleScale} />
                {tool === "select" && isSelected && annotation.id === selected && multiSelected.length === 1 && edgeMidpoints(annotation.pts ?? [], true).map((midpoint) => <g key={`edge-${midpoint.edgeIndex}`}>{touchMode && <ellipse className="touch-handle-hit" onPointerDown={(event) => insertVertex(event, annotation, midpoint.edgeIndex, midpoint.x, midpoint.y)} onPointerMove={moveVertexPointer} onPointerUp={finishVertexPointer} onPointerCancel={clearPointerDrafts} cx={midpoint.x} cy={midpoint.y} rx={touchRadius} ry={touchRadius * markerAspect} strokeWidth={0} fill="transparent" />}<ellipse className="edge-handle" onPointerDown={(event) => insertVertex(event, annotation, midpoint.edgeIndex, midpoint.x, midpoint.y)} onPointerMove={moveVertexPointer} onPointerUp={finishVertexPointer} onPointerCancel={clearPointerDrafts} cx={midpoint.x} cy={midpoint.y} rx={markerRadius * .5} ry={markerRadius * .5 * markerAspect} strokeWidth={markerRadius * .22} /></g>)}
                {tool === "select" && isSelected && annotation.id === selected && multiSelected.length === 1 && (annotation.pts ?? []).map((coordinate, index, points) => index % 2 === 0 ? <g key={index}>{touchMode && <ellipse className="touch-handle-hit" onPointerDown={(event) => beginVertexDrag(event, annotation, index / 2)} onPointerMove={moveVertexPointer} onPointerUp={finishVertexPointer} onPointerCancel={clearPointerDrafts} cx={coordinate} cy={points[index + 1]} rx={touchRadius} ry={touchRadius * markerAspect} strokeWidth={0} fill="transparent" />}<ellipse className={`vertex-handle ${selectedVertex?.annotationId === annotation.id && selectedVertex.vertexIndex === index / 2 ? "selected" : ""}`} onPointerDown={(event) => beginVertexDrag(event, annotation, index / 2)} onPointerMove={moveVertexPointer} onPointerUp={finishVertexPointer} onPointerCancel={clearPointerDrafts} cx={coordinate} cy={points[index + 1]} rx={polygonHandleRadius(handleScale)} ry={polygonHandleRadius(handleScale) * markerAspect} fill="#fff" stroke={label.color} strokeWidth={polygonHandleRadius(handleScale) * .42} /></g> : null)}
              </g>;
              const pointRadius = markerRadius * (isSelected ? 1.32 : 1);
              return <g className={tool === "select" ? "movable-annotation" : ""} key={annotation.id} onPointerDown={(event) => beginAnnotationDrag(event, annotation)} onPointerMove={moveAnnotationPointer} onPointerUp={finishAnnotationPointer} onPointerCancel={clearPointerDrafts}><ellipse cx={annotation.x} cy={annotation.y} rx={pointRadius} ry={pointRadius * markerAspect} fill="#fff" stroke={label.color} strokeWidth={pointRadius * .42} /><ellipse cx={annotation.x} cy={annotation.y} rx={pointRadius * .34} ry={pointRadius * .34 * markerAspect} fill={label.color} /></g>;
            })}
            {selectionMarquee && <rect className="selection-marquee" x={Math.min(selectionMarquee.startX, selectionMarquee.currentX)} y={Math.min(selectionMarquee.startY, selectionMarquee.currentY)} width={Math.abs(selectionMarquee.currentX - selectionMarquee.startX)} height={Math.abs(selectionMarquee.currentY - selectionMarquee.startY)} />}
            {tool === "transform" && (activeAnnotation?.type === "polygon" || activeAnnotation?.type === "box") && activeTransformBounds && activeTransformCenter && <g className="transform-overlay" transform={activeAnnotation.type === "box" ? `rotate(${(activeAnnotation.rotation ?? 0) * 180 / Math.PI} ${activeTransformCenter.x} ${activeTransformCenter.y})` : undefined}>
              <rect x={activeTransformBounds.x} y={activeTransformBounds.y} width={activeTransformBounds.width} height={activeTransformBounds.height} />
              <line x1={activeTransformCenter.x} y1={transformRotationAnchorY} x2={activeTransformCenter.x} y2={transformRotationY} />
              <g>{touchMode && <ellipse className="touch-handle-hit" cx={activeTransformCenter.x} cy={transformRotationY} rx={touchRadius} ry={touchRadius * markerAspect} strokeWidth={0} onPointerDown={(event) => beginTransform(event, activeAnnotation, "rotate")} onPointerMove={moveTransformPointer} onPointerUp={finishTransformPointer} onPointerCancel={clearPointerDrafts} fill="transparent" />}<ellipse className="transform-handle rotate-handle" cx={activeTransformCenter.x} cy={transformRotationY} rx={markerRadius * 1.8} ry={markerRadius * 1.8 * markerAspect} strokeWidth={markerRadius * .42} onPointerDown={(event) => beginTransform(event, activeAnnotation, "rotate")} onPointerMove={moveTransformPointer} onPointerUp={finishTransformPointer} onPointerCancel={clearPointerDrafts} /></g>
              <g>{touchMode && <ellipse className="touch-handle-hit" cx={activeTransformBounds.x + activeTransformBounds.width} cy={activeTransformBounds.y + activeTransformBounds.height} rx={touchRadius} ry={touchRadius * markerAspect} strokeWidth={0} onPointerDown={(event) => beginTransform(event, activeAnnotation, "scale")} onPointerMove={moveTransformPointer} onPointerUp={finishTransformPointer} onPointerCancel={clearPointerDrafts} fill="transparent" />}<ellipse className="transform-handle scale-handle" cx={activeTransformBounds.x + activeTransformBounds.width} cy={activeTransformBounds.y + activeTransformBounds.height} rx={markerRadius * 1.8} ry={markerRadius * 1.8 * markerAspect} strokeWidth={markerRadius * .42} onPointerDown={(event) => beginTransform(event, activeAnnotation, "scale")} onPointerMove={moveTransformPointer} onPointerUp={finishTransformPointer} onPointerCancel={clearPointerDrafts} /></g>
              <ellipse className="transform-center" cx={activeTransformCenter.x} cy={activeTransformCenter.y} rx={markerRadius * .9} ry={markerRadius * .9 * markerAspect} strokeWidth={markerRadius * .22} />
            </g>}
            {draft && <rect className="draft-shape" x={draft.x} y={draft.y} width={draft.w} height={draft.h} fill={`${getLabel(activeLabel).color}25`} stroke={getLabel(activeLabel).color} strokeWidth={visualLineWidth} strokeDasharray="9 7" />}
            {polygonDraft.length > 1 && <g><polyline className="draft-shape" points={pointsToSvg(polygonDraft)} fill={`${getLabel(activeLabel).color}20`} stroke={getLabel(activeLabel).color} strokeWidth={visualLineWidth} strokeDasharray="9 7" />{polygonDraft.map((coordinate, index, points) => index % 2 === 0 ? <ellipse className={index === 0 && polygonDraft.length >= 6 ? "polygon-close-point draft-vertex" : "draft-vertex"} onPointerDown={(event) => { if (index === 0 && polygonDraft.length >= 6) { event.stopPropagation(); finishPolygon(); } }} key={index} cx={coordinate} cy={points[index + 1]} rx={markerRadius * (index === 0 && polygonDraft.length >= 6 ? 1.35 : 1)} ry={markerRadius * (index === 0 && polygonDraft.length >= 6 ? 1.35 : 1) * markerAspect} fill={getLabel(activeLabel).color} stroke="#fff" strokeWidth={markerRadius * .32} /> : null)}</g>}
            {lineDraft.length > 0 && <g>{lineDraft.length > 2 && <polyline className="line-shape" points={pointsToSvg(lineDraft)} stroke={getLabel(activeLabel).color} strokeWidth={visualLineWidth} strokeDasharray="9 7" />}{lineDraft.map((coordinate, index, points) => index % 2 === 0 ? <ellipse className="draft-vertex" key={index} cx={coordinate} cy={points[index + 1]} rx={markerRadius} ry={markerRadius * markerAspect} fill={getLabel(activeLabel).color} stroke="#fff" strokeWidth={markerRadius * .32} /> : null)}</g>}
            {freehandDraft.length > 1 && <polyline className="freehand-line draft-shape" points={pointsToSvg(freehandDraft)} fill={`${getLabel(activeLabel).color}22`} stroke={getLabel(activeLabel).color} strokeWidth={visualLineWidth} />}
            {reshapeDraft.length > 1 && <g><polyline className="reshape-line" points={pointsToSvg(reshapeDraft)} />{reshapeDraft.length >= 4 && <><ellipse className="reshape-endpoint" cx={reshapeDraft[0]} cy={reshapeDraft[1]} rx={markerRadius * 1.25} ry={markerRadius * 1.25 * markerAspect} strokeWidth={markerRadius * .42} /><ellipse className="reshape-endpoint" cx={reshapeDraft.at(-2)} cy={reshapeDraft.at(-1)} rx={markerRadius * 1.25} ry={markerRadius * 1.25 * markerAspect} strokeWidth={markerRadius * .42} /></>}</g>}
            {splitStart && splitEnd && <line className="split-line" x1={splitStart.x} y1={splitStart.y} x2={splitEnd.x} y2={splitEnd.y} />}
            {snapGuide && <g className="snap-guide"><circle cx={snapGuide.x} cy={snapGuide.y} r={markerRadius * 2.2} strokeWidth={markerRadius * .3} /><line x1={snapGuide.x - markerRadius * 1.3} y1={snapGuide.y} x2={snapGuide.x + markerRadius * 1.3} y2={snapGuide.y} strokeWidth={markerRadius * .26} /><line x1={snapGuide.x} y1={snapGuide.y - markerRadius * 1.3} x2={snapGuide.x} y2={snapGuide.y + markerRadius * 1.3} strokeWidth={markerRadius * .26} /></g>}
            {tool === "sam" && samPreview.length >= 6 && <polygon className="sam-mask-preview" points={pointsToSvg(samPreview)} fill={`${getLabel(activeLabel).color}52`} stroke={getLabel(activeLabel).color} strokeWidth={lineThickness} strokeDasharray="10 6" />}
            {tool === "sam" && samPrompts.map((prompt, index) => { const arm = markerRadius * .5; const bar = markerRadius * .34; return <g key={index} className={`sam-prompt ${prompt.label ? "positive" : "negative"}`}><circle cx={prompt.x} cy={prompt.y} r={markerRadius} strokeWidth={markerRadius * .4} /><line x1={prompt.x - arm} y1={prompt.y} x2={prompt.x + arm} y2={prompt.y} strokeWidth={bar} />{prompt.label === 1 && <line x1={prompt.x} y1={prompt.y - arm} x2={prompt.x} y2={prompt.y + arm} strokeWidth={bar} />}</g>; })}
          </svg>}
          {tool === "sam" && <div className="sam-controls"><div><button className={samPromptMode === 1 ? "active positive" : ""} onClick={() => setSamPromptMode(1)}><CirclePlus size={15} />{copy.samInclude}</button><button className={samPromptMode === 0 ? "active negative" : ""} onClick={() => setSamPromptMode(0)}><CircleMinus size={15} />{copy.samExclude}</button></div><span>{samLoading ? <><LoaderCircle className="spin" size={14} />{copy.samSegmenting}</> : `${samPrompts.length} ${copy.samPoints}`}</span><div><button disabled={!samPrompts.length && !samPreview.length && !samLoading} onClick={restartSam}><ListRestart size={14} />{copy.samRestart}</button><button className="accept" disabled={samPreview.length < 6 || samLoading} onClick={acceptSamMask}><Check size={14} />{copy.samSaveEdit}</button><button aria-label={copy.samConfigure} onClick={openSamSettings}><Settings2 size={15} /></button></div></div>}
        </div> : <div className="empty-project"><span><Images size={30} /></span><h2>{copy.emptyProjectTitle}</h2><p>{copy.emptyProjectHint}</p><div><button className="primary" disabled={demoLoading} onClick={() => void loadDemoProject()}>{demoLoading ? <LoaderCircle className="spin" size={16} /> : <WandSparkles size={16} />}{copy.tryDemo}</button><button disabled={demoLoading} onClick={() => input.current?.click()}><ImagePlus size={16} />{copy.importImages}</button><button disabled={demoLoading} onClick={requestOpenProject}><FolderUp size={16} />{copy.openProject}</button></div><small>{copy.privacy}</small></div>}</div></div>
        <div className="status"><div><button onClick={() => go(-1)} disabled={!asset || assets[0]?.id === current}><ChevronLeft size={16} /></button><span><b>{asset ? assets.findIndex((item) => item.id === current) + 1 : 0}</b> / {assets.length}</span><button onClick={() => go(1)} disabled={!asset || assets.at(-1)?.id === current}><ChevronRight size={16} /></button></div><p className={toast ? "notice" : ""} role="status" aria-live="polite">{toast ? <Check size={14} /> : <Sparkles size={14} />}<span>{statusMessage}</span></p><button><Keyboard size={15} /> {copy.shortcuts}</button></div>
      </section>

      <aside className={`labels ${rightOpen ? "open" : ""} ${rightPanelCollapsed ? "collapsed" : ""}`}>
        <button className="sidebar-restore sidebar-restore-right" title={copy.showAnnotationsPanel} aria-label={copy.showAnnotationsPanel} onClick={() => setRightPanelCollapsed(false)}><PanelRightOpen size={17} /></button>
        <button className="panel-collapse panel-collapse-right" title={copy.hideAnnotationsPanel} aria-label={copy.hideAnnotationsPanel} onClick={() => { setRightPanelCollapsed(true); setRightOpen(false); }}><PanelRightClose size={16} /></button>
        <div className="drawer-head"><b>{copy.annotations}</b><button onClick={() => setRightOpen(false)}><X size={19} /></button></div>
        <button type="button" className="panel-resizer panel-resizer-right" aria-label={copy.resizeAnnotationsPanel} title={copy.resizeAnnotationsPanel} onPointerDown={(event) => beginPanelResize(event, "right")} onPointerMove={movePanelResize} onPointerUp={finishPanelResize} onPointerCancel={finishPanelResize} onKeyDown={(event) => resizePanelWithKeyboard(event, "right")} />
        <div className="tabs"><button className={!quality ? "active" : ""} onClick={() => setQuality(false)}>{copy.annotations}</button><button className={quality ? "active" : ""} onClick={() => setQuality(true)}>{copy.quality} <b>{currentAnnotations.length ? 1 : 0}</b></button></div>
        {!quality ? <div className="annotation-editor"><section className="annotation-panel-head"><div><b>{copy.annotations} · {currentAnnotations.length}</b><span>{copy.annotationPanelHint}</span></div><div className="annotation-panel-actions"><button disabled={!currentAnnotations.length} title={currentImageAnnotationsHidden ? copy.showAllAnnotations : copy.hideAllAnnotations} onClick={toggleCurrentImageAnnotationVisibility}>{currentImageAnnotationsHidden ? <EyeOff size={14} /> : <Eye size={14} />}{currentImageAnnotationsHidden ? copy.showAllAnnotations : copy.hideAllAnnotations}</button><button onClick={() => { setSelectedClassIds([]); cancelLabelRename(); setNewLabelColor(nextLabelColor(labels)); setClassManagerOpen(true); }}><Palette size={14} />{copy.manageClasses}</button></div></section>
          {selectedIds.length > 0 && <section className="batch-class"><div><Tags size={14} /><span><b>{selectedIds.length} {copy.batchSelection}</b><small>{copy.changeClass}</small></span></div><div><select aria-label={copy.changeClass} value={resolvedBatchLabel} onChange={(event) => setBatchLabel(event.target.value)}>{labels.map((label) => <option key={label.id} value={label.id}>{label.id === UNLABELED_ID ? copy.unlabeled : label.name}</option>)}</select><button onClick={reclassifySelection}>{copy.applyClass}</button><button className="batch-delete" onClick={() => setPendingDeleteAnnotationIds(selectedIds)}><Trash2 size={13} />{copy.deleteSelectedAnnotations}</button></div></section>}
          <div className="instances">{currentAnnotations.map((annotation, index) => {
            const label = getLabel(annotation.label);
            const isHidden = hiddenAnnotations.includes(annotation.id) || hiddenLabels.includes(annotation.label);
            const isChecked = multiSelected.includes(annotation.id);
            const dropClass = annotationReorder?.targetId === annotation.id ? `drop-${annotationReorder.position}` : "";
            return <div key={annotation.id} className={`instance-row ${isChecked ? "active" : ""} ${isHidden ? "hidden" : ""} ${annotationReorder?.sourceId === annotation.id ? "dragging" : ""} ${dropClass}`} onDragOver={(event) => { if (!annotationReorder) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; const position = dragPosition(event); if (annotationReorder.targetId !== annotation.id || annotationReorder.position !== position) setAnnotationReorder({ ...annotationReorder, targetId: annotation.id, position }); }} onDrop={(event) => dropAnnotation(event, annotation.id)}>
              <button className="reorder-handle" draggable aria-label={`${copy.reorderAnnotation}: ${label.name} #${index + 1}`} title={copy.reorderAnnotation} onDragStart={(event) => beginAnnotationReorder(event, annotation.id)} onDragEnd={() => setAnnotationReorder(null)} onKeyDown={(event) => moveAnnotationByKeyboard(event, annotation.id)}><GripVertical size={14} /></button>
              <button className={`annotation-selector ${isChecked ? "selected" : ""}`} aria-label={`${copy.selectAnnotation}: ${annotation.label === UNLABELED_ID ? copy.unlabeled : label.name} #${index + 1}`} aria-pressed={isChecked} onClick={(event) => selectAnnotationFromPanel(annotation, event.shiftKey, event.ctrlKey || event.metaKey, true)}>{isChecked && <Check size={11} />}</button>
              <button className="instance-main" onClick={(event) => selectAnnotationFromPanel(annotation, event.shiftKey, event.ctrlKey || event.metaKey, false)}><i style={{ borderColor: label.color }}>{annotation.type === "point" ? "•" : annotation.type === "line" ? "╱" : ""}</i><span>{annotation.label === UNLABELED_ID ? copy.unlabeled : label.name} <small>#{index + 1}</small></span></button>
              <button className="visibility-toggle" title={isHidden ? copy.showAnnotation : copy.hideAnnotation} aria-label={`${isHidden ? copy.showAnnotation : copy.hideAnnotation}: ${label.name} #${index + 1}`} onClick={() => toggleAnnotationVisibility(annotation.id)}>{isHidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              <button className="delete-annotation" title={copy.deleteShape} aria-label={`${copy.deleteShape}: ${label.name} #${index + 1}`} onClick={() => setPendingDeleteAnnotationIds([annotation.id])}><Trash2 size={13} /></button>
            </div>;
          })}</div>
        </div> : <div className="quality"><div className="score"><strong>92<small>/100</small></strong><span>{copy.goodConsistency}</span></div><article className="warn"><b>!</b><div><strong>{copy.possibleOverlap}</strong><p>{copy.overlapText}</p></div></article><article><b>✓</b><div><strong>{copy.validClasses}</strong><p>{copy.validClassesText}</p></div></article><article><b>✓</b><div><strong>{copy.noEmpty}</strong><p>{copy.noEmptyText}</p></div></article><button onClick={() => { setQuality(false); setSelected(visibleAnnotations[0]?.id ?? null); setMultiSelected(visibleAnnotations[0] ? [visibleAnnotations[0].id] : []); }}>{copy.review}</button></div>}
        <div className="hint"><b>{activeAnnotation?.type === "polygon" ? copy.vectorEditing : copy.quickTip}</b><p>{activeAnnotation?.type === "polygon" ? copy.vectorHint : copy.shortcutHint}</p></div>
      </aside>
    </div>

    {cogFila.length > 0 && <CogRecorte
      key={`${cogFila[0].file.name}-${cogFila[0].file.size}-${cogFila.length}`}
      origem={cogFila[0].file}
      reference={cogFila[0].reference}
      nome={cogFila[0].file.name}
      copy={copy}
      onCancelar={() => setCogFila((atual) => atual.slice(1))}
      onPronto={recorteVirouAsset}
    />}

    {classManagerOpen && <div className="modal-backdrop class-manager-backdrop"><section className="class-manager-page" role="dialog" aria-modal="true" aria-labelledby="class-manager-title"><header><div><span><Palette size={20} /></span><div><h2 id="class-manager-title">{copy.classManagerTitle}</h2><p>{copy.classManagerHint}</p></div></div><button onClick={() => { setClassManagerOpen(false); setSelectedClassIds([]); }} aria-label={copy.close}><X size={21} /></button></header><div className="class-manager-body"><div className="class-manager-sidebar"><section className="label-creator"><div><Palette size={14} /><span><b>{copy.labelStudio}</b><small>{copy.labelStudioHint}</small></span></div><div className="label-create-row"><input ref={labelInputRef} aria-label={copy.className} placeholder={copy.className} value={newLabel} onChange={(event) => setNewLabel(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addClass()} /><input className="label-color" type="color" aria-label={copy.labelColor} title={copy.labelColor} value={newLabelColor} onChange={(event) => setNewLabelColor(event.target.value)} /><button aria-label={copy.createLabel} title={copy.createLabel} disabled={!newLabel.trim()} onClick={addClass}><Plus size={15} /></button></div></section><section className="class-manager-active"><div><Tags size={14} /><span><b>{copy.newAnnotationClass}</b><small>{copy.newShapesClass}</small></span></div><select aria-label={copy.newAnnotationClass} value={activeLabel} onChange={(event) => setActiveLabel(event.target.value)}>{labels.map((label) => <option key={label.id} value={label.id}>{label.id === UNLABELED_ID ? copy.unlabeled : label.name}</option>)}</select></section></div><section className="class-manager-classes"><div className="class-manager-list-head"><div><b>{copy.classList}</b><span>{labels.length} {copy.classes.toLocaleLowerCase()}</span></div>{selectableClasses.length > 0 && <button onClick={() => setSelectedClassIds(selectedClassIds.length === selectableClasses.length ? [] : selectableClasses.map((label) => label.id))}>{selectedClassIds.length === selectableClasses.length ? copy.clearClassSelection : copy.selectAllClasses}</button>}</div>{selectedClassIds.length > 0 && <div className="class-selection-summary"><span>{selectedClassIds.length} {copy.classesSelected}</span><button onClick={() => requestClassDeletion(selectedClassIds)}><Trash2 size={12} />{copy.deleteSelectedClasses}</button></div>}<div className="label-list class-manager-list">{labels.map((label) => { const isHidden = hiddenLabels.includes(label.id); const isUnlabeled = label.id === UNLABELED_ID; const isChecked = selectedClassIds.includes(label.id); const isEditing = editingLabelId === label.id; return <div key={label.id} className={`label-row ${isHidden ? "hidden" : ""} ${isChecked ? "checked" : ""}`}>{isUnlabeled ? <span className="label-selector-spacer" /> : <button className={`label-selector ${isChecked ? "selected" : ""}`} aria-label={`${copy.selectClass}: ${label.name}`} aria-pressed={isChecked} onClick={() => setSelectedClassIds((items) => items.includes(label.id) ? items.filter((id) => id !== label.id) : [...items, label.id])}>{isChecked && <Check size={11} />}</button>}<div className={`label-main ${isEditing ? "editing" : ""}`}><i style={{ background: label.color }} />{isEditing ? <input autoFocus aria-label={copy.renameClass} value={editingLabelName} onChange={(event) => setEditingLabelName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveLabelRename(label.id); if (event.key === "Escape") cancelLabelRename(); }} /> : <span>{isUnlabeled ? copy.unlabeled : label.name}</span>}<em>{annotations.filter((annotation) => annotation.label === label.id).length}</em>{label.key ? <kbd>{label.key}</kbd> : <span />}</div><button className="rename-label" disabled={isUnlabeled} title={isUnlabeled ? copy.unlabeledProtected : isEditing ? copy.saveClassName : copy.renameClass} aria-label={`${isEditing ? copy.saveClassName : copy.renameClass}: ${label.name}`} onClick={() => isEditing ? saveLabelRename(label.id) : beginLabelRename(label)}>{isEditing ? <Check size={13} /> : <Pencil size={13} />}</button><button className="visibility-toggle" title={isHidden ? copy.showClass : copy.hideClass} aria-label={`${isHidden ? copy.showClass : copy.hideClass}: ${label.name}`} onClick={() => toggleLabelVisibility(label.id)}>{isHidden ? <EyeOff size={14} /> : <Eye size={14} />}</button><button className="delete-label" disabled={isUnlabeled} title={isUnlabeled ? copy.unlabeledProtected : copy.deleteClass} aria-label={`${copy.deleteClass}: ${label.name}`} onClick={() => requestClassDeletion([label.id])}><Trash2 size={13} /></button></div>; })}</div></section></div><footer><button onClick={() => { setClassManagerOpen(false); setSelectedClassIds([]); }}><Check size={14} />{copy.close}</button></footer></section></div>}
    {projectSaveOpen && <div className="modal-backdrop"><section className="sam-modal project-save-modal" role="dialog" aria-modal="true" aria-labelledby="project-save-title"><header><div><span><Save size={18} /></span><div><h2 id="project-save-title">{copy.saveProjectTitle}</h2><p>{copy.saveProjectDescription}</p></div></div><button onClick={() => setProjectSaveOpen(false)} aria-label={copy.close}><X size={19} /></button></header><div className="project-save-options" role="radiogroup" aria-label={copy.saveProjectTitle}><button className={projectSaveMode === "annotations" ? "active" : ""} role="radio" aria-checked={projectSaveMode === "annotations"} onClick={() => setProjectSaveMode("annotations")}><span><FileText size={20} /></span><div><b>{copy.annotationsOnly}</b><p>{copy.annotationsOnlyHint}</p><small>{formatBytes(annotationProjectBytes)} · {assets.length} {copy.imageReferences}</small></div><Check size={16} /></button><button className={projectSaveMode === "complete" ? "active" : ""} role="radio" aria-checked={projectSaveMode === "complete"} disabled={missingProjectImages > 0} onClick={() => setProjectSaveMode("complete")}><span><Images size={20} /></span><div><b>{copy.imagesAndAnnotations}</b><p>{copy.imagesAndAnnotationsHint}</p><small>{knownProjectImageBytes ? `${formatBytes(knownProjectImageBytes)} + ${formatBytes(annotationProjectBytes)}` : copy.sizeCalculatedOnSave}</small>{missingProjectImages > 0 && <em>{missingProjectImages} {copy.projectImagesNeedReload}</em>}</div><Check size={16} /></button></div><div className="project-save-privacy"><ShieldCheck size={16} /><div><b>{copy.localOnly}</b><p>{copy.projectSavePrivacy}</p></div></div><footer><button onClick={() => setProjectSaveOpen(false)}>{copy.cancel}</button><button className="connect" disabled={projectBusy || (projectSaveMode === "complete" && missingProjectImages > 0)} onClick={() => void savePortableProject(projectSaveMode)}>{projectBusy ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}{copy.generateProjectFile}</button></footer></section></div>}
    {pendingDeleteAnnotations.length > 0 && <div className="modal-backdrop"><section className="sam-modal delete-class-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-annotations-title" aria-describedby="delete-annotations-description"><header><div><span><Trash2 size={18} /></span><div><h2 id="delete-annotations-title">{copy.confirmDeleteAnnotations}</h2><p>{pendingDeleteAnnotations.length} {copy.annotationsToDelete}</p></div></div><button onClick={() => setPendingDeleteAnnotationIds([])} aria-label={copy.close}><X size={19} /></button></header><p id="delete-annotations-description" className="delete-class-warning">{copy.deleteAnnotationsWarning}</p><div className="delete-class-impact"><span>{copy.annotationsToDelete}</span><b>{pendingDeleteAnnotations.length}</b></div><footer><button onClick={() => setPendingDeleteAnnotationIds([])}>{copy.cancel}</button><button className="danger" onClick={deletePendingAnnotations}><Trash2 size={14} />{copy.confirmDelete}</button></footer></section></div>}
    {cocoImportPlan && <CocoImportDialog plan={cocoImportPlan} copy={copy} selectedIndexes={selectedCocoAnnotationIndexes} selectedGeometryTypes={selectedCocoGeometryTypes} tab={cocoImportTab} onClose={() => setCocoImportPlan(null)} onIndexesChange={setSelectedCocoAnnotationIndexes} onGeometryTypesChange={setSelectedCocoGeometryTypes} onTabChange={setCocoImportTab} onImport={() => { void importCocoAnnotations(cocoImportPlan.file, selectedCocoAnnotationIndexes, selectedCocoGeometryTypes); setCocoImportPlan(null); }} />}
    {pendingDeleteClasses.length > 0 && <div className="modal-backdrop"><section className="sam-modal delete-class-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-class-title" aria-describedby="delete-class-description"><header><div><span><Trash2 size={18} /></span><div><h2 id="delete-class-title">{pendingDeleteClasses.length === 1 ? copy.confirmDeleteClass : copy.confirmDeleteClasses}</h2><p>{pendingDeleteClasses.map((label) => label.name).join(", ")}</p></div></div><button onClick={() => setPendingDeleteClassIds([])} aria-label={copy.close}><X size={19} /></button></header><p id="delete-class-description" className="delete-class-warning">{copy.deleteClassWarning} <strong>{copy.unlabeled}</strong>.</p><div className="delete-class-impact"><span>{copy.affectedAnnotations}</span><b>{pendingAffectedAnnotations}</b></div><footer><button onClick={() => setPendingDeleteClassIds([])}>{copy.cancel}</button><button className="danger" onClick={deletePendingClasses}><Trash2 size={14} />{copy.confirmDelete}</button></footer></section></div>}
    {preferencesOpen && <div className="modal-backdrop"><section className="sam-modal preferences-modal" role="dialog" aria-modal="true" aria-labelledby="preferences-title"><header><div><span><Settings2 size={18} /></span><div><h2 id="preferences-title">{copy.preferences}</h2><p>poligome.com</p></div></div><button onClick={() => setPreferencesOpen(false)} aria-label={copy.close}><X size={19} /></button></header><div className="preferences-tabs"><button className={preferencesTab === "appearance" ? "active" : ""} onClick={() => setPreferencesTab("appearance")}><Sun size={14} />{copy.appearance}</button><button className={preferencesTab === "language" ? "active" : ""} onClick={() => setPreferencesTab("language")}><Languages size={14} />{copy.language}</button></div>{preferencesTab === "appearance" ? <div className="preference-options"><button className={themeMode === "system" ? "active" : ""} onClick={() => setThemeMode("system")}><Monitor size={20} /><b>{copy.system}</b></button><button className={themeMode === "light" ? "active" : ""} onClick={() => setThemeMode("light")}><Sun size={20} /><b>{copy.light}</b></button><button className={themeMode === "dark" ? "active" : ""} onClick={() => setThemeMode("dark")}><Moon size={20} /><b>{copy.dark}</b></button></div> : <div className="language-options"><button className={language === "pt" ? "active" : ""} onClick={() => setLanguage("pt")}><b>Português</b><span>PT-BR</span></button><button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}><b>English</b><span>EN</span></button><button className={language === "fr" ? "active" : ""} onClick={() => setLanguage("fr")}><b>Français</b><span>FR</span></button><button className={language === "es" ? "active" : ""} onClick={() => setLanguage("es")}><b>Español</b><span>ES</span></button></div>}<footer><button className="connect" onClick={() => setPreferencesOpen(false)}><Check size={15} /> {copy.close}</button></footer></section></div>}
    {samOpen && <div className="modal-backdrop"><section className="sam-modal sam-local-modal" role="dialog" aria-modal="true" aria-labelledby="sam-title"><header><div><span><WandSparkles size={18} /></span><div><h2 id="sam-title">{copy.samTitle}</h2><p>{copy.samSubtitle}</p></div></div><button onClick={() => setSamOpen(false)} aria-label={copy.close}><X size={19} /></button></header><div className="hardware-warning"><b>{copy.beforeRun}</b><p><strong>{copy.samHardwareRecommended}</strong> {copy.samHardwareDetail}</p><p>{copy.samInstallerDetail}</p></div><div className="sam-oneclick"><b>{copy.oneClickSetup}</b><p>{copy.oneClickHint}</p><div><a className="primary" href="/poligome-sam-windows.bat" download><Download size={15} /><span><strong>{copy.windowsInstaller}</strong><small>Windows 10/11</small></span></a><a href="/poligome-sam-macos-linux.sh" download><Download size={15} /><span><strong>{copy.unixInstaller}</strong><small>macOS · Linux</small></span></a></div><small>{copy.autoDownloadModel}</small></div><div className="sam-relaunch"><div><b>{copy.installedAlready}</b><p>{copy.restartServerHint}</p></div><div><a className="windows" href="/poligome-sam-start-windows.bat" download><Power size={14} />{copy.restartWindows}</a><a href="/poligome-sam-start-macos-linux.sh" download><Power size={14} />{copy.restartUnix}</a></div></div><div className={`sam-status ${samConnectionState}`}><span /> <b>{samConnectionState === "ready" ? copy.samReady : samConnectionState === "loading" ? copy.samLoadingModel : samConnectionState === "checking" ? copy.samChecking : copy.samOffline}</b>{samRuntime && <small>{samRuntime}</small>}</div><details className="sam-advanced"><summary>{copy.advancedSetup}</summary><div className="sam-setup"><b>{copy.manualSetup}</b><ol><li><a href="https://github.com/facebookresearch/segment-anything#model-checkpoints" target="_blank" rel="noreferrer"><Download size={13} /> {copy.checkpointPage}</a></li><li><a href="/poligome-sam-local.py" download><Download size={13} /> {copy.connectorDownload}</a></li><li>{copy.samManualStep} <code>.pth</code>.</li></ol><pre>python poligome-sam-local.py --checkpoint sam_vit_b_01ec64.pth</pre></div><label>{copy.localAddress}<input type="url" placeholder="http://127.0.0.1:7860/predict" value={samEndpointDraft} onChange={(event) => setSamEndpointDraft(event.target.value)} /></label></details><div className="sam-contract"><b>{copy.noUpload}</b><p>{copy.samPrivacyIntro} <code>localhost</code>{copy.samPrivacyDetail}</p></div><footer><button onClick={() => setSamOpen(false)}>{copy.cancel}</button><button className="connect" disabled={samConnectionState === "checking"} onClick={() => void connectSam()}>{samConnectionState === "checking" ? <LoaderCircle className="spin" size={15} /> : <Link2 size={15} />} {copy.verifyUse}</button></footer></section></div>}
    {(leftOpen || rightOpen) && <button className="backdrop" onClick={() => { setLeftOpen(false); setRightOpen(false); }} aria-label={copy.closePanel} />}
  </main>;
}
