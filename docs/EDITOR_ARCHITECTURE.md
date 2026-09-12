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

## Validation

`.github/workflows/editor-refactor.yml` runs Node 22.13, the verified Vinext build and the complete test suite for this branch.

## Migration status

1. Canonical `EditorAnnotation` + stable `Vertex[]`. **Done.**
2. Canonical state, selection and gesture transactions. **Done.**
3. Canonical rendering and drawing. **Done.**
4. Canonical COCO/YOLO/GeoJSON I/O. **Done.**
5. Mobile pan and pinch navigation. **Done.**
6. Native source-image pixel geometry. **Done.**
7. Strict V4 project persistence. **Done.**
8. Replace `/annotate` with the canonical editor. **Done.**
9. Delete duplicate/legacy routes, bridge and annotation adapters. **Done.**
10. Remove any remaining orphaned legacy utility modules after CI confirms they have no consumers. **Next.**
