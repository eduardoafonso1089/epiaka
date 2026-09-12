# Editor architecture

This document describes the incremental editor refactor introduced on `refactor/editor-architecture`.

## Goals

- Keep `.plgm`, COCO, YOLO and GeoJSON compatibility.
- Keep persisted annotation coordinates in the existing `1000 x 650` space.
- Centralize coordinate conversion instead of repeating DOM/zoom math in tools.
- Make pointer interactions mutually exclusive and explicit.
- Allow polygon vertices to have stable identities while editing, without changing the persisted format.
- Keep the implementation independent. CVAT and Label Studio were architectural references only; no third-party source code was copied into these modules.

## Coordinate spaces

The editor defines three explicit coordinate spaces: browser screen pixels, the historical `1000 x 650` annotation space, and native source-image pixels. `ViewportTransform` converts between them. The persisted annotation model remains unchanged, avoiding a project migration.

## Viewport

`app/editor/viewport/viewport-controller.ts` contains the pure viewport state model. The live `/annotate` route is wrapped by `EditorArchitectureBridge`, which mirrors viewport size, source-image size, scroll and zoom into this controller while the legacy editor is progressively extracted.

## Interactions

`app/editor/interactions/interaction-controller.ts` provides explicit pointer ownership for editor gestures. Supported modes are `idle`, `select`, `draw`, `edit`, `pan`, `resize`, `rotate` and `model`.

`app/editor/interactions/vertex-interactions.ts` now contains pure hit-testing and topology helpers used to migrate vertex gestures out of the route component.

## Editable vertices

Persisted polygons still use flat coordinates:

```ts
pts: [x1, y1, x2, y2, ...]
```

During editing they can be represented as:

```ts
type Vertex = { id: string; x: number; y: number };
```

`app/lib/geometry.ts` now routes the live editor's vertex insert/update/delete and edge-midpoint operations through this `Vertex[]` model, then converts back to the flat persisted representation. This means the new model is no longer only infrastructure: it participates in the current editor path without changing saved projects or exports.

## Extracted rendering layers

Rendering extraction lives under `app/editor/layers`:

- `vertex-handles.tsx` — shared vertex and edge-insertion controls for polygons and polylines;
- `polygon-layer.tsx` — presentational polygon path + vertex controls;
- `polyline-layer.tsx` — presentational polyline + shared vertex controls.

These components are stateless and receive editor state and callbacks rather than importing global project state.

## Selection

Selection extraction has started under `app/editor/selection`:

- `selection-model.ts` — marquee normalization, single selection, toggle selection, range selection and additive marquee selection;
- `selection-layer.tsx` — stateless SVG marquee rendering.

The existing route still owns the React state, but selection semantics can now migrate to these pure functions without duplicating policy inside pointer handlers.

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
4. Introduce the transient `Vertex[]` model. **Done.**
5. Split the route from the legacy monolith. **Done.**
6. Extract polygon/polyline/vertex rendering into stateless components. **Done.**
7. Route live vertex geometry through `Vertex[]`. **Done.**
8. Extract pure selection semantics and marquee rendering. **Done.**
9. Wire `PolygonLayer`, `PolylineLayer` and `SelectionLayer` into `legacy-page.tsx`. **Next.**
10. Replace legacy selection and vertex pointer handlers with the extracted interaction modules.
11. Route zoom/pan/fit writes through `ViewportController` rather than only mirroring them.
12. Remove the legacy page once all rendering and interactions have moved.

## Tests

The branch adds regression/contract coverage for viewport transforms, resolution-independent pointer deltas, vertex serialization and geometry compatibility, interaction ownership, polygon/polyline layer contracts, vertex hit-testing/topology, and selection semantics. Existing viewport tests continue to protect zoom anchoring, mobile overflow and selection framing.
