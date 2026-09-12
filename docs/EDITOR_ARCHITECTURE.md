# Editor architecture

This document describes the incremental editor refactor introduced on `refactor/editor-architecture`.

## Goals

- Keep COCO, YOLO and GeoJSON export behavior stable while the editor internals change.
- Keep annotation coordinates in the existing `1000 x 650` editor space for now.
- Centralize coordinate conversion instead of repeating DOM/zoom math in tools.
- Make pointer interactions mutually exclusive and explicit.
- Make vertex identity part of the canonical annotation model rather than reconstructing it from flat coordinate offsets.
- Remove backward-compatibility code for old `.plgm` project manifests instead of carrying legacy format constraints through the new editor.
- Keep the implementation independent. CVAT and Label Studio were architectural references only; no third-party source code was copied into these modules.

## Coordinate spaces

The editor defines three explicit coordinate spaces: browser screen pixels, the `1000 x 650` annotation space, and native source-image pixels. `ViewportTransform` converts between them.

The `1000 x 650` space is currently retained as an editor coordinate convention, not as a compatibility requirement for old project files. It can be changed independently in a future migration because persistence is now versioned separately from the legacy route implementation.

## Canonical annotation model

`app/editor/models/annotation-model.ts` defines the target editor representation. Polygon and polyline geometry is vertex-based:

```ts
type Vertex = { id: string; x: number; y: number };

type PolygonAnnotation = {
  type: "polygon";
  vertices: Vertex[];
  holes: Vertex[][];
};
```

Boxes use explicit `width`/`height`, and points use explicit `x`/`y` coordinates.

`app/editor/models/legacy-annotation-adapter.ts` is a temporary in-memory boundary for `legacy-page.tsx`. It is not part of project persistence and does not provide backward compatibility for old project manifests.

## Project format V3

The current `.plgm` container remains a ZIP-based Poligome project, but the manifest is now strictly **version 3**.

V3 changes:

- polygon/polyline geometry is stored as `vertices` with stable IDs;
- polygon holes are stored as arrays of vertices;
- boxes use `width` and `height` rather than the legacy `w`/`h` naming;
- flat `pts` arrays are not stored in the manifest;
- V2 manifests are rejected rather than silently migrated.

The canonical project API is `savePoligomeProjectV3()` / `openPoligomeProjectV3()`, both typed with `EditorAnnotation[]`. The old function names remain only as deprecated in-memory façades for the route that has not yet migrated its React state.

The `.plgm` extension therefore identifies the current Poligome project container, not a promise of backward compatibility with earlier manifest versions.

## Viewport

`app/editor/viewport/viewport-controller.ts` contains the pure viewport state model. The live `/annotate` route is wrapped by `EditorArchitectureBridge`, which mirrors viewport size, source-image size, scroll and zoom into this controller while the legacy editor is progressively extracted.

## Interactions

`app/editor/interactions/interaction-controller.ts` provides explicit pointer ownership for editor gestures. Supported modes are `idle`, `select`, `draw`, `edit`, `pan`, `resize`, `rotate` and `model`.

`app/editor/interactions/vertex-interactions.ts` uses `EditorAnnotation[]` and stable `vertexId` references for hit-testing and linked topology. No index-based vertex identity remains in the new interaction layer.

## Canonical geometry

`app/editor/geometry/annotation-geometry.ts` owns geometry operations over the canonical model:

- bounds;
- translation;
- vertex insertion/update/deletion by ID;
- edge midpoint generation;
- editor-boundary clamping.

New editor code should use this module rather than `app/lib/geometry.ts`. The latter remains only for `legacy-page.tsx` and flat-array utilities that have not yet been deleted.

## Canonical state

`app/editor/state/editor-state.ts` centralizes editor state that used to be distributed across independent React states:

- `EditorAnnotation[]`;
- undo and redo history;
- single/multiple selection;
- selected vertex by `vertexId`;
- saved/dirty state.

All geometry mutations in the reducer target annotation IDs and stable vertex IDs. `use-editor-state.ts` exposes the reducer through a small React API and derives the selected annotation(s) without duplicating state.

This state is the intended replacement for the legacy combination of `annotations`, `history`, `redoHistory`, `selected`, `multiSelected` and `selectedVertex`.

## Rendering

Rendering extraction lives under `app/editor/layers`:

- `vertex-handles.tsx` — consumes `Vertex[]` directly and emits vertex IDs;
- `polygon-layer.tsx` — consumes `PolygonAnnotation`;
- `polyline-layer.tsx` — consumes `PolylineAnnotation`;
- `box-layer.tsx` — consumes `BoxAnnotation` with `width`/`height`;
- `point-layer.tsx` — consumes `PointAnnotation`;
- `annotation-layer.tsx` — canonical geometry dispatcher.

`app/editor/canvas/editor-canvas.tsx` composes the annotation dispatcher and selection marquee over `EditorAnnotation[]`. It is the replacement boundary for the large geometry-specific `visibleAnnotations.map(...)` block in `legacy-page.tsx`.

The new rendering stack has no dependency on the legacy `Annotation` type, flat `pts` arrays, `vertexIndex`, or `w`/`h` box fields.

## Selection

Selection extraction lives under `app/editor/selection`:

- `selection-model.ts` — marquee normalization, single selection, toggle selection, range selection and additive marquee selection over `EditorAnnotation[]`;
- `selection-layer.tsx` — stateless SVG marquee rendering.

Selection no longer imports `app/lib/types.ts` or `app/lib/geometry.ts`.

## Export boundary

`app/editor/export/annotation-export.ts` converts canonical `EditorAnnotation` geometry directly into external format payloads:

- COCO segmentation/bbox/keypoints;
- YOLO detection/segmentation rows;
- GeoJSON geometry;
- rotated box corners and export bounds.

Flat numeric coordinate arrays are allowed here because they are required by those external formats. They are no longer treated as the editor's internal geometry representation.

## Route split

```text
/annotate
  layout.tsx -> EditorArchitectureBridge
  page.tsx   -> legacy-page.tsx
```

The previous monolithic route implementation lives in `legacy-page.tsx` while functionality is extracted into focused modules. New editor code should be added under `app/editor` rather than growing `legacy-page.tsx` further.

## Migration status

1. Centralize screen/annotation/image conversion with `ViewportTransform`. **Done.**
2. Introduce `ViewportController` and mirror the live editor into it. **Done.**
3. Introduce `InteractionController` and mirror live pointer ownership. **Done.**
4. Introduce the `Vertex[]` model. **Done.**
5. Split the route from the legacy monolith. **Done.**
6. Extract polygon/polyline/vertex/box/point rendering into stateless components. **Done.**
7. Route live legacy vertex geometry through `Vertex[]`. **Done.**
8. Extract pure selection semantics and marquee rendering. **Done.**
9. Introduce the canonical `EditorAnnotation` model. **Done.**
10. Move `.plgm` persistence to strict vertex-based V3 and drop V2 compatibility. **Done.**
11. Move extracted layers to canonical annotation types and vertex IDs. **Done.**
12. Add canonical annotation geometry and ID-based vertex interactions. **Done.**
13. Move selection to canonical annotations. **Done.**
14. Introduce canonical reducer/hook for annotations, history, selection and vertex state. **Done.**
15. Add `AnnotationLayer` + `EditorCanvas` canonical rendering composition. **Done.**
16. Add canonical COCO/YOLO/GeoJSON export codecs. **Done.**
17. Migrate annotation producers (drawing tools, demo, import and model output) to `EditorAnnotation`. **Next.**
18. Replace route React state with `useEditorState` and wire `EditorCanvas` into the route.
19. Delete deprecated project façades, `legacy-annotation-adapter.ts` and obsolete flat geometry APIs.
20. Route zoom/pan/fit writes through `ViewportController` rather than only mirroring them.
21. Remove `legacy-page.tsx` once the remaining panels/tools are extracted.

## Tests

The branch adds regression/contract coverage for viewport transforms, resolution-independent pointer deltas, canonical vertex mutations, canonical annotation geometry, canonical state/undo/redo, canonical export codecs, interaction ownership, annotation/canvas layer contracts, vertex hit-testing/topology, selection semantics, and the strict V3 project manifest. V3 tests explicitly verify vertex IDs in persisted projects and rejection of V2 manifests.
