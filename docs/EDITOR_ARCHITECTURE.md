# Editor architecture

The editor refactor on `refactor/editor-architecture` now uses the canonical stack directly at `/annotate`. The previous legacy route, bridge and annotation adapters have been removed.

## Core rules

- Native source-image pixels are the single canonical geometry space.
- Viewport size, zoom, pan, pinch and device dimensions never rewrite annotation geometry.
- `EditorAnnotation[]` is the only editor annotation model.
- Polygon/polyline vertices have stable IDs.
- Project persistence is V4 only and declares `coordinate_space: "image-pixels"`.
- Previous `.plgm` manifests are not migrated.
- CVAT and Label Studio were architectural references only; no third-party source code was copied.

## Coordinate spaces

The active editor uses two relevant spaces:

1. browser screen pixels;
2. source-image pixels.

`app/editor/viewport/svg-image-space.ts` converts client coordinates into image pixels by inverting the SVG screen CTM, with a bounding-rectangle fallback for environments without SVG CTM support.

`EditorCanvas` uses the current image dimensions as its SVG viewBox. There is no fixed `1000×650` annotation space in the canonical editor.

Screen-space controls such as handles and touch targets are converted into image units at render time so they keep a stable visual size across zoom levels and image resolutions.

## Annotation model

`app/editor/models/annotation-model.ts` defines the only active editor representation:

```ts
type Vertex = { id: string; x: number; y: number };

type PolygonAnnotation = {
  type: "polygon";
  vertices: Vertex[];
  holes: Vertex[][];
};
```

Boxes use `x`, `y`, `width`, `height` and optional rotation. Points use `x` and `y`. Every coordinate is expressed in source-image pixels.

There is no legacy annotation adapter in the active codebase.

## Project format V4

The `.plgm` manifest is strictly V4:

```json
{
  "version": 4,
  "coordinate_space": "image-pixels"
}
```

The canonical APIs are:

- `savePoligomeProjectV4()`
- `openPoligomeProjectV4()`

V3 and older manifests are rejected instead of migrated.

## Viewport and touch

`app/editor/viewport/viewport-controller.ts` owns viewport size, image size, zoom and scroll.

`app/editor/viewport/use-editor-viewport.ts` connects the pure viewport model to the DOM. `app/editor/viewport/use-touch-navigation.ts` arbitrates mobile gestures:

- one-finger pan in the Hand tool;
- two-finger pinch + pan in any tool;
- second touch cancels an active edit/draw gesture before navigation owns it;
- discrete touch drawing commits on pointer-up, preventing stray points when pinch starts.

Pan and pinch mutate viewport state only.

## State and interactions

`app/editor/state/editor-state.ts` owns:

- `EditorAnnotation[]`;
- undo/redo history;
- single/multiple selection;
- selected vertex by ID;
- dirty/saved state;
- active gesture transaction.

It also owns canonical annotation ordering and batch reclassification. Reordering is constrained to annotations belonging to the same asset, and batch reclassification is a single undoable editor operation.

`app/editor/interactions/use-canvas-interactions.ts` handles annotation drag, vertex drag/insertion, rotated box resize/rotation and marquee selection directly in source-image pixels.

A continuous drag/resize/rotation creates one undo step.

## Rendering

Rendering is composed under `app/editor/layers` and `app/editor/canvas`:

- `annotation-layer.tsx`
- `polygon-layer.tsx`
- `polyline-layer.tsx`
- `box-layer.tsx`
- `point-layer.tsx`
- `vertex-handles.tsx`
- `editor-canvas.tsx`

The rendering stack has no dependency on flat `pts`, index-based vertex identity or legacy `w/h` box fields.

## Import/export

Internal geometry remains in image pixels.

- COCO uses image pixels directly.
- COCO import scales only when the document dimensions differ from the loaded image dimensions.
- YOLO normalization happens only at export using the actual asset width/height.
- GeoJSON projects image pixels through raster/georeference metadata.
- Flat coordinate arrays are allowed only at external format boundaries.

`app/editor/session/editor-session-io.ts` is the canonical project/demo/import/export boundary.

## Route

```text
/annotate
  CanonicalEditorWorkbench
  -> EditorState
  -> EditorCanvas
  -> ViewportController
```

`/annotate-next`, `/anotar`, `legacy-page.tsx`, `EditorArchitectureBridge` and `legacy-annotation-adapter.ts` have been removed.

## Application parity

Core migration completion does **not** mean product-surface parity with `main`. The canonical `/annotate` route still has explicit application debt that must be ported before the refactor is considered product-complete:

- advanced vector operations: snapping, reshape, simplify, union/merge, split and polygon-hole creation;
- local SAM activation/setup, include/exclude prompts and save-and-edit workflow;
- keyboard shortcuts from the previous annotator;
- selective COCO category/annotation import;
- complete i18n coverage for the canonical workbench;
- final visual-system decision for the canonical shell.

The following application surfaces have already been restored on the canonical architecture and are no longer parity debt:

- image panel: search, select, reorder and delete;
- annotation panel: hide/show, delete, asset-local reorder, select-all and Shift/Ctrl/Cmd list selection;
- class management: quick label creation, rename, color, hide/show, protected `Sem label`, delete with reclassification to `Sem label`, active class selection and batch reclassification;
- Quality/Review, including image/annotation/class scores and source-pixel dataset summaries.

Cephalometric-landmark import is **not part of Poligome parity** and must not be ported into the canonical editor.

### Product decisions recorded on 2026-09-12

- **D1 — merge strategy: option B.** Keep implementing application parity on `refactor/editor-architecture`; merge into `main` only when the canonical editor has recovered the agreed product surface. Do not restore the legacy annotator as the production `/annotate` route.
- **D2 — parity scope.** Quality/Review is retained as an important platform capability and is part of the parity target. Cephalometric landmarks are explicitly out of scope because they are unrelated to the product. Other parity items remain in scope unless separately decided otherwise.

Modules reachable only from parity-pending UI must not be treated as dead legacy solely because they have no current canonical consumer.

## Management panels

The canonical management surface lives under `app/editor/panels`.

- `panel-model.ts` contains pure operations for image ordering and class lifecycle;
- `editor-management-panels.tsx` renders the responsive image, annotation and class panels;
- hiding an annotation or class is transient UI state and never rewrites geometry;
- deleting an image deletes only annotations owned by that asset;
- deleting a class preserves its annotations by moving them to the protected `unlabeled` class;
- annotation reorder never crosses asset boundaries;
- batch class changes are recorded through `EditorState`, so one batch operation corresponds to one undo step.

## Quality and review

The canonical implementation lives under `app/editor/review`.

- `quality-review-model.ts` computes per-image instance balance, per-class instance counts and polygon/box areas directly in native source-image pixels.
- polygon holes are subtracted from segmentation area;
- points and lines contribute zero segmentation area;
- image, annotation and class review scores remain independent 1–5 values persisted by the existing V4 project model;
- `quality-review-panel.tsx` is the application panel for the quality/review surface.

Quality metrics must never reintroduce the removed `1000×650` normalization.

## Validation

`.github/workflows/editor-refactor.yml` runs Node 22.13, the verified Vinext build, the complete test suite, the i18n parity-debt gate, cross-branch export goldens, the demo-route smoke test and the COG benchmark.

The i18n debt allowlist is expected to shrink whenever a canonical UI surface starts consuming keys that were previously only used by `main`.

## Core migration status

1. Canonical `EditorAnnotation` + stable `Vertex[]`. **Done.**
2. Canonical state, selection and gesture transactions. **Done.**
3. Canonical rendering and drawing. **Done.**
4. Canonical COCO/YOLO/GeoJSON I/O. **Done.**
5. Mobile pan and pinch navigation. **Done.**
6. Native source-image pixel geometry. **Done.**
7. Strict V4 project persistence. **Done.**
8. Replace `/annotate` with the canonical editor. **Done.**
9. Delete duplicate/legacy routes, bridge and annotation adapters. **Done.**
10. Remove only utilities proven to be legacy and behaviorally superseded. A module must **not** be deleted solely because its application UI has not yet been ported. In particular, `app/lib/sam.ts` and modules reachable only from parity-pending UI are protected until the relevant product decision and port are complete. `app/lib/sam.ts` currently also needs migration away from the removed normalized-geometry helpers before it can be reactivated. **Guarded cleanup, not blanket orphan deletion.**
