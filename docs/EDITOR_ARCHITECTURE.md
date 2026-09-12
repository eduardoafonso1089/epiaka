# Editor architecture

This document describes the incremental editor refactor introduced on `refactor/editor-architecture`.

## Goals

- Use source-image pixels as the single canonical geometry space.
- Centralize screen/image conversion instead of repeating DOM/zoom math in tools.
- Keep viewport changes, pan and zoom completely separate from annotation geometry.
- Make pointer interactions mutually exclusive and explicit.
- Make vertex identity part of the canonical annotation model rather than reconstructing it from flat coordinate offsets.
- Remove backward-compatibility requirements for previous `.plgm` manifests.
- Keep the implementation independent. CVAT and Label Studio were architectural references only; no third-party source code was copied.

## Coordinate spaces

The canonical editor has two relevant coordinate spaces:

1. browser screen pixels;
2. native source-image pixels.

`EditorAnnotation` geometry is always stored in native source-image pixels. A 4032×3024 image therefore uses coordinates in the ranges `x=[0,4032]`, `y=[0,3024]`.

Viewport size, zoom, scroll and device dimensions never rewrite annotation coordinates. `app/editor/viewport/svg-image-space.ts` converts browser client coordinates into source-image coordinates by inverting the SVG screen CTM, following the same architectural principle used by CVAT. A bounding-rectangle fallback exists for DOM/test environments without SVG CTM support.

The former `1000×650` annotation convention is not part of the canonical editor anymore. It remains only inside the legacy route and its transitional bridge until `legacy-page.tsx` is deleted.

Handle radii, hit targets and strokes are specified conceptually in screen pixels and converted into image units at render time, keeping them visually stable across zoom and image resolution.

## Canonical annotation model

`app/editor/models/annotation-model.ts` defines the editor representation. Polygon and polyline geometry is vertex-based:

```ts
type Vertex = { id: string; x: number; y: number };

type PolygonAnnotation = {
  type: "polygon";
  vertices: Vertex[];
  holes: Vertex[][];
};
```

Boxes use explicit `width`/`height`, points use explicit `x`/`y`, and all geometry values are source-image pixels.

`app/editor/models/legacy-annotation-adapter.ts` is only a temporary boundary for `legacy-page.tsx` and must not be used by canonical editor code.

## Project format V4

The canonical `.plgm` project manifest is strictly **version 4** and declares:

```json
{
  "version": 4,
  "coordinate_space": "image-pixels"
}
```

V4 stores `EditorAnnotation[]` directly: stable vertex IDs, holes as vertex arrays, boxes with `width`/`height`, and geometry in native image pixels. Canonical V4 loading does not migrate V3 or older manifests.

The canonical API is `savePoligomeProjectV4()` / `openPoligomeProjectV4()`.

A temporary V3 path still exists only so the old `/annotate` implementation can remain operational during the route replacement. It is not a compatibility requirement and will be deleted with the legacy route.

## Viewport and touch navigation

`app/editor/viewport/viewport-controller.ts` owns viewport dimensions, image dimensions, zoom and scroll. Its canonical transform uses image space as annotation space.

`app/editor/viewport/use-editor-viewport.ts` adapts this pure model to the DOM. `app/editor/viewport/use-touch-navigation.ts` arbitrates mobile gestures:

- one-finger pan in the Hand tool;
- two-finger pinch + pan in any tool;
- a second finger cancels active drawing/editing before navigation owns the gesture;
- discrete touch drawing commits on pointer-up, preventing stray vertices when pinch begins.

Pan and pinch mutate only viewport state, never `EditorAnnotation` geometry.

## Interactions

`app/editor/interactions/interaction-controller.ts` provides explicit pointer ownership for editor gestures. Supported modes are `idle`, `select`, `draw`, `edit`, `pan`, `resize`, `rotate` and `model`.

`app/editor/interactions/use-canvas-interactions.ts` owns canonical pointer callbacks for annotation drag, vertex drag/insertion, box resize/rotation and marquee selection. It converts client coordinates directly to source-image pixels.

Continuous gestures use editor-state transactions so a complete drag/resize/rotation creates a single undo entry.

## Canonical geometry

`app/editor/geometry/annotation-geometry.ts` owns geometry operations over `EditorAnnotation`:

- bounds;
- translation;
- rotated box resizing;
- vertex insertion/update/deletion by ID;
- edge midpoint generation.

It no longer clamps canonical geometry to a fixed `1000×650` editor rectangle.

`app/lib/geometry.ts` remains legacy-only until `legacy-page.tsx` is removed.

## Canonical state

`app/editor/state/editor-state.ts` centralizes:

- `EditorAnnotation[]`;
- undo/redo history;
- single/multiple selection;
- selected vertex by `vertexId`;
- saved/dirty state;
- active gesture snapshot.

`use-editor-state.ts` exposes the reducer through a small React API.

## Rendering

Rendering lives under `app/editor/layers` and consumes canonical annotation types. `app/editor/canvas/editor-canvas.tsx` receives the current image size and uses a dynamic SVG `viewBox="0 0 imageWidth imageHeight"`.

The rendering stack has no dependency on legacy `pts`, `vertexIndex`, or `w/h` box fields.

## Import/export boundaries

Internal geometry remains in source-image pixels.

- COCO import/export uses image pixels directly. If a COCO document declares dimensions different from the loaded image, import performs only the required source-image-to-target-image scaling.
- YOLO normalization occurs only when producing YOLO rows, using the actual asset width/height.
- GeoJSON projects source-image pixels through raster/georeference metadata.
- Flat coordinate arrays are allowed only at external format boundaries.

`app/editor/session/editor-session-io.ts` is the canonical V4 project/demo/import/export boundary and does not use the legacy annotation adapter.

## Route split

```text
/annotate
  layout.tsx -> EditorArchitectureBridge
  page.tsx   -> legacy-page.tsx

/annotate-next
  CanonicalEditorWorkbench
  -> source-image pixels
  -> EditorState
  -> EditorCanvas
  -> ViewportController
```

`/annotate-next` is the integration surface for the canonical editor while functional parity is completed. New editor functionality belongs under `app/editor`, not in `legacy-page.tsx`.

## Validation

`.github/workflows/editor-refactor.yml` runs Node 22.13, the verified Vinext build and the complete test suite on pushes to the refactor branch.

The last fully validated touch/pan/pinch baseline passed build and tests. The source-image/V4 migration is being validated incrementally; do not call a commit green until its own workflow run succeeds.

## Migration status

1. Centralize viewport transforms. **Done.**
2. Introduce `ViewportController`. **Done.**
3. Introduce explicit interaction ownership. **Done.**
4. Introduce stable `Vertex[]` geometry. **Done.**
5. Split the legacy route. **Done.**
6. Extract canonical rendering layers. **Done.**
7. Extract canonical selection/state/history. **Done.**
8. Add gesture transactions. **Done.**
9. Add `AnnotationLayer` + `EditorCanvas`. **Done.**
10. Add canonical drawing/demo/COCO/model producers. **Done.**
11. Add canonical COCO/YOLO/GeoJSON outputs. **Done.**
12. Add canonical session IO. **Done.**
13. Add mobile one-finger pan and two-finger pinch+pan. **Done.**
14. Replace fixed `1000×650` canonical geometry with native source-image pixels. **Done.**
15. Move canonical project persistence to strict V4 `image-pixels`. **Done.**
16. Validate source-image/V4 migration and remove obsolete normalized-coordinate tests. **In progress.**
17. Complete remaining feature parity (SAM/COG/panels) in `/annotate-next`.
18. Replace `/annotate` with the canonical route.
19. Delete V3 transitional project path, `legacy-annotation-adapter.ts`, `app/lib/geometry.ts` legacy APIs and `legacy-page.tsx`.
