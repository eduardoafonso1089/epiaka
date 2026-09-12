# Editor pre-merge audit

Audit date: 2026-09-12

Target branch: `refactor/editor-architecture`

Base branch: `main`

## Decision

**HOLD — do not merge into `main` yet.**

The canonical source-pixel architecture is stable and the automated validation suite is green, but several non-SAM product workflows present in `main` still have no equivalent in the canonical editor. D1 remains in force: merge only after the agreed application surface is recovered or an explicit product decision retires a feature.

SAM is not part of this hold. Its canonical UI will arrive from its dedicated branch. Cephalometric-landmark import is explicitly out of scope for Poligome.

## Resolved during this audit

- COCO `info.version` is externally compatible with `main` (`1.0`) and is no longer coupled to the internal `.plgm` V4 schema number.
- The cross-branch export gate now checks COCO metadata version directly rather than carrying a D8 exception.
- The protected `unlabeled` class is rendered through the active locale instead of leaking the stored Portuguese name into EN/FR/ES management controls.
- Selective COCO import was inspected and **does preserve existing annotations**: the import control concatenates the current annotations with newly imported annotations before handing the aggregate set to the workbench.

## Merge blockers

### 1. Re-link images for annotations-only projects

V4 annotations-only projects deliberately persist assets as `missing: true`. `openPoligomeProjectV4()` preserves the original asset IDs, which is correct because annotations reference those IDs.

The canonical UI currently has no re-link workflow. Importing the same image through ordinary image import creates a new asset ID, so existing annotations remain attached to the missing asset.

Required before merge:

- select one or more local images for missing project assets;
- match by the persisted image identity/name with explicit handling of ambiguity;
- preserve the existing asset ID while replacing runtime image source and dimensions;
- keep annotations attached to the same asset;
- report restored and unresolved images;
- test save → annotations-only open → re-link → edit/export.

### 2. New-project lifecycle

`main` exposes a real New Project operation with unsaved-work protection. The canonical workbench currently supports demo/open/import/save, but has no equivalent reset workflow.

Required before merge:

- create/reset to an empty project;
- revoke old object URLs;
- reset labels, annotations, selection, viewport and transient visibility;
- protect dirty work with an explicit confirmation;
- establish a fresh project name and saved/dirty state.

Project rename should be restored with the same lifecycle work; the canonical state already carries `projectName`, but the active UI does not expose rename.

### 3. Duplicate polygon

`main` can duplicate the active polygon and offset the copy. The canonical editor has no equivalent command. This is a real editing capability rather than a presentation difference.

The canonical implementation must generate a fresh annotation ID and fresh vertex IDs (including hole vertex IDs), preserve the label/review semantics intentionally, translate in source-image pixels, select the copy, and create one undo step.

### 4. Polygon transform

Box resize/rotation has a canonical equivalent and is therefore not missing parity. Polygon scale/rotate does not: `main` exposes a Transform tool for polygons, while the canonical editor currently exposes drag/vertices/simplify/merge/hole/split/reshape but no polygon scale/rotation transform.

Required before merge unless explicitly retired as a product decision.

### 5. Destructive-action safety

The canonical management panels currently execute some asset/class deletion actions immediately. Removing an image or class mutates application state that is not fully restored by annotation undo.

Before merge, irreversible management operations should have an explicit confirmation or an equivalent recoverable transaction. Particular attention is required for image deletion and class deletion/reclassification.

## Release/UX parity to decide explicitly

These differences do not invalidate the source-pixel architecture, but they must not be hidden inside the i18n debt allowlist. Each should either be restored or explicitly retired before declaring full product parity:

- panel collapse/restore and user-resizable side panels;
- show/hide all annotations for the active image;
- configurable visual line thickness;
- coordinate X/Y guide;
- tutorial/help and the guided demo onboarding;
- class multi-selection/batch class deletion;
- editor-local appearance chooser (the landing page already owns and persists light/dark/system theme selection, and the editor honors it);
- editor-local Home/source-code affordances;
- additional status/help copy that exists only because of the legacy interaction surface.

The flat `tests/fixtures/editor-i18n-debt-allowlist.json` is therefore a regression gate, **not** a merge-readiness signal.

## Explicitly deferred or excluded

### SAM

SAM is implemented/integrated on a separate branch. This refactor must keep `app/lib/sam.ts` and local connector assets available for that future merge, but must not block the editor-architecture merge solely because the canonical SAM UI is absent here.

The current dormant `app/lib/sam.ts` still references removed normalized-geometry utilities, so the incoming SAM branch must target canonical source-image geometry rather than reviving the deleted `1000×650` model.

### Cephalometric landmarks

Not part of Poligome. Do not port the legacy cephalometric special case.

## Architecture checks passed

- `/annotate` points only to `CanonicalEditorWorkbench`.
- legacy `/anotar`, `/annotate-next`, bridge and annotation adapter paths are removed.
- source-image pixels are the only annotation geometry space.
- V4 project persistence declares `coordinate_space: "image-pixels"` and rejects old normalized manifests.
- COCO, YOLO and GeoJSON canonical codecs are covered by cross-branch demo goldens, with explicit justification only for intentional semantic differences.
- Quality/Review operates on source-image geometry.
- PT/EN/FR/ES active canonical surfaces are protected by the i18n parity-debt gate.
- mobile pan/pinch and source-pixel hit geometry are tested.
- native tiled COG planning is viewport-bounded and uses a bounded LRU cache.

## Known non-blocking technical risks

- no manual browser run with a genuinely huge production COG has been recorded in this refactor audit;
- remote COG requires CORS plus HTTP Range `206` support;
- complete projects containing a local giant COG bundle the original raster and can therefore produce very large `.plgm` files;
- COG tile reads have a bounded decoded cache but still lack explicit in-flight read de-duplication/concurrency scheduling;
- SAM branch integration can conflict semantically with the removed normalized geometry even if Git reports a clean textual merge.

## Merge criterion

Move this audit from **HOLD** to **GO** only when all items in **Merge blockers** are either implemented with tests or explicitly retired by a recorded product decision, and the exact resulting head passes the complete `Editor Refactor` workflow.
