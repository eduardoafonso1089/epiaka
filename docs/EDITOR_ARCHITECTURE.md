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

The editor now defines three explicit coordinate spaces:

1. **Screen** — browser client pixels.
2. **Annotation** — the historical Poligome `1000 x 650` coordinate system.
3. **Image** — native source-image pixels.

`ViewportTransform` is the only new primitive that should convert between these spaces.

```text
screen pixels
     |
     v
ViewportTransform
     |
     +----------> annotation (1000 x 650)
     |
     +----------> image pixels
```

The persisted annotation model remains unchanged. This deliberately avoids a project migration.

## Viewport

`app/editor/viewport/viewport-controller.ts` contains the pure viewport state model. DOM components should act as adapters:

- read container/image bounds;
- pass them to the controller;
- render the returned layout/scroll state.

Zoom, pan and fit math should not be reimplemented inside individual tools.

## Interactions

`app/editor/interactions/interaction-controller.ts` provides explicit ownership for editor gestures.
Only one interaction may own a pointer at a time.

Supported modes are currently:

- idle
- select
- draw
- edit
- pan
- resize
- rotate
- model

New tools should acquire the controller before starting a gesture and release/cancel it on pointer up, pointer cancel, Escape or tool change.

## Editable vertices

Persisted polygons continue to use:

```ts
pts: [x1, y1, x2, y2, ...]
```

During editing they can be converted to:

```ts
type Vertex = {
  id: string;
  x: number;
  y: number;
};
```

using `verticesFromFlatPoints()` and returned with `flatPointsFromVertices()`.

Stable IDs are intended to make selection, linked vertices, snapping, insert/delete, holes and future topological editing independent of array offsets.

## Migration rule

The refactor is intentionally incremental. Existing behavior should be moved behind these primitives without changing output formats.

Recommended order for subsequent editor extraction:

1. Replace ad-hoc screen-to-annotation conversion with `ViewportTransform`.
2. Route zoom/pan/fit through `ViewportController`.
3. Route pointer gesture ownership through `InteractionController`.
4. Use `Vertex[]` as the transient polygon editing representation.
5. Extract select/draw/edit handlers from `app/annotate/page.tsx` into focused modules.
6. Split rendering into annotation/handle components after behavior is covered by tests.

## Tests

The branch adds regression coverage for:

- screen/annotation round trips;
- annotation/image round trips;
- coordinate clamping;
- resolution-independent pointer deltas;
- vertex serialization compatibility;
- stable vertex updates and insertion/deletion;
- exclusive interaction ownership.

Existing viewport tests continue to protect zoom anchoring, mobile overflow and selection framing.
