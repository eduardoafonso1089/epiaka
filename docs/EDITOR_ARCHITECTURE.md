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
  // ...annotation metadata
};
```

Boxes use explicit `width`/`height`, and points use explicit `x`/`y` coordinates.

`app/editor/models/legacy-annotation-adapter.ts` is a temporary boundary only for `legacy-page.tsx`. It is not part of the persisted V3 format. It will disappear when the route component is fully migrated.

## Project format V3

The current `.plgm` container remains a ZIP-based Poligome project, but the manifest is now strictly **version 3**.

V3 changes:

- polygon/polyline geometry is stored as `vertices` with stable IDs;
- polygon holes are stored as arrays of vertices;
- boxes use `width` and `height` rather than the legacy `w`/`h` naming;
- flat `pts` arrays are not stored in the manifest;
- V2 manifests are rejected rather than silently migrated.

The `.plgm` extension therefore identifies the current Poligome project container, not a promise of backward compatibility with earlier manifest versions.

## Viewport

`app/editor/viewport/viewport-controller.ts` contains the pure viewport state model. The live `/annotate` route is wrapped by `EditorArchitectureBridge`, which mirrors viewport size, source-image size, scroll and zoom into this controller while the legacy editor is progressively extracted.

## Interactions

`app/editor/interactions/interaction-controller.ts` provides explicit pointer ownership for editor gestures. Supported modes are `idle`, `select`, `draw`, `edit`, `pan`, `resize`, `rotate` and `model`.

`app/editor/interactions/vertex-interactions.ts` contains pure hit-testing and topology helpers used to migrate vertex gestures out of the route component.

## Editable vertices

`Vertex[]` is no longer treated as an optional transient representation. It is the target geometry model for polygon/polyline annotations and the persisted V3 project format.

`app/lib/geometry.ts` currently still exposes flat-array functions because `legacy-page.tsx` calls them. Those functions internally route insert/update/delete and edge-midpoint operations through `Vertex[]`. They are transitional APIs and should be deleted with the legacy route.

## Extracted rendering layers

Rendering extraction lives under `app/editor/layers`:

- `vertex-handles.tsx` — shared vertex and edge-insertion controls for polygons and polylines;
- `polygon-layer.tsx` — presentational polygon path + vertex controls;
- `polyline-layer.tsx` — presentational polyline + shared vertex controls;
- `box-layer.tsx` — box geometry and resize/rotation controls;
- `point-layer.tsx` — point annotation rendering.

These components are stateless and receive editor state and callbacks rather than importing global project state.

## Selection

Selection extraction lives under `app/editor/selection`:

- `selection-model.ts` — marquee normalization, single selection, toggle selection, range selection and additive marquee selection;
- `selection-layer.tsx` — stateless SVG marquee rendering.

The existing route still owns the React state, but selection semantics can migrate to these pure functions without duplicating policy inside pointer handlers.

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
11. Wire extracted annotation layers and selection into the route. **Next.**
12. Replace legacy selection and vertex pointer handlers with the extracted interaction modules.
13. Move route state from legacy `Annotation` to `EditorAnnotation` and delete `legacy-annotation-adapter.ts`.
14. Route zoom/pan/fit writes through `ViewportController` rather than only mirroring them.
15. Remove `legacy-page.tsx` once all rendering and interactions have moved.

## Tests

The branch adds regression/contract coverage for viewport transforms, resolution-independent pointer deltas, vertex serialization and geometry compatibility, interaction ownership, annotation layer contracts, vertex hit-testing/topology, selection semantics, and the strict V3 project manifest. V3 tests explicitly verify vertex IDs in persisted projects and rejection of V2 manifests.
