# Editor pre-merge audit

Audit date: 2026-09-12

Target branch: `refactor/editor-architecture`

Base branch: `main`

## Decision

**GO — the editor-architecture branch satisfies the agreed merge criterion.**

The canonical source-pixel architecture is stable, the five product blockers found by the first audit have canonical implementations with regression tests, and the implementation head containing those fixes passed the complete `Editor Refactor` workflow. The branch remains intentionally independent from the SAM integration branch.

SAM is not a merge blocker. Its canonical UI will arrive from its dedicated branch. Cephalometric-landmark import is explicitly out of scope for Poligome.

## Resolved during the audit

- COCO `info.version` is externally compatible with `main` (`1.0`) and is no longer coupled to the internal `.plgm` V4 schema number.
- The cross-branch export gate checks COCO metadata version directly rather than carrying a D8 exception.
- The protected `unlabeled` class is rendered through the active locale instead of leaking the stored Portuguese name into EN/FR/ES management controls.
- Selective COCO import was inspected and **does preserve existing annotations**: the import control concatenates current annotations with newly imported annotations before handing the aggregate set to the workbench.
- The i18n debt allowlist continues to be a shrinking regression gate, not a merge-readiness proxy.

## Former merge blockers — resolved

### 1. Re-link images for annotations-only projects — resolved

V4 annotations-only projects deliberately persist assets as `missing: true`. The canonical editor now exposes a re-link workflow that reconnects supplied local files to the persisted asset rather than creating unrelated asset IDs.

The re-link implementation:

- matches missing assets by case-insensitive persisted basename;
- preserves the original asset ID, so existing annotations remain attached;
- refuses ordinary images whose dimensions do not match the persisted asset dimensions;
- refuses ambiguous duplicate-basename groups instead of guessing;
- restores ordinary browser images and tiled raster/COG runtime sources;
- reports restored and unresolved files;
- is covered by `tests/project-image-relink.test.mjs`.

### 2. New-project lifecycle — resolved

The canonical workbench now exposes New Project and project rename.

New Project revokes prior object URLs, resets assets, labels, annotations, selection, viewport, transient visibility, save mode, project name and saved/dirty state. Replacing an existing project or demo while work is dirty is protected by an explicit confirmation. Project rename marks the session dirty. Regression coverage lives in `tests/project-lifecycle-parity.test.mjs`.

### 3. Duplicate polygon — resolved

Polygon duplication is restored on the canonical toolbar. A copy receives a fresh annotation ID plus fresh stable IDs for outer-ring and hole vertices, is offset in source-image coordinates using a screen-derived offset, becomes selected, and enters editor history as one undoable add operation.

### 4. Polygon transform — resolved

Polygon scale/rotation is implemented directly in source-image pixels. It does not revive the deleted `1000×650` geometry space.

The transform tool:

- uses the polygon source-pixel bounds center;
- transforms the outer ring and holes together;
- preserves stable vertex IDs;
- clamps scale to the same safe range used by the previous product interaction;
- treats the complete pointer interaction as one editor gesture, producing one undo entry;
- is available from the vector toolbar and shortcut `T`;
- is covered by `tests/polygon-transform.test.mjs` and the shortcut suite.

Box resize/rotation remains on its existing canonical path and was not duplicated.

### 5. Destructive-action safety — resolved

Management-panel deletion now requires explicit confirmation for actions initiated from destructive UI controls:

- image deletion, including a warning when annotations belong to that image;
- single or batch annotation deletion from the management panel;
- class deletion/reclassification.

The keyboard Delete path for selected annotations remains fast and undoable through `EditorState`; management operations whose lifecycle cannot be reconstructed completely by annotation undo are protected before mutation. Regression coverage lives in `tests/destructive-panel-confirmations.test.mjs`.

## Non-blocking UX differences

The following legacy-interface affordances are not required by the agreed merge criterion and remain eligible for later product polish without reintroducing legacy geometry or state coupling:

- panel collapse/restore and user-resizable side panels;
- show/hide-all annotations shortcut for the active image;
- configurable visual line thickness;
- coordinate X/Y guide;
- legacy tutorial/help and guided-demo presentation details;
- class multi-selection/batch class deletion;
- editor-local appearance chooser (the landing page owns and persists light/dark/system and the editor honors it);
- editor-local Home/source-code affordances;
- status/help copy that exists only because of the legacy interaction layout.

The flat `tests/fixtures/editor-i18n-debt-allowlist.json` tracks those intentionally unported/deferred keys and SAM copy. It must continue to shrink when a surface is restored, but its non-zero size does not by itself block the merge.

## Explicitly deferred or excluded

### SAM

SAM is implemented/integrated on a separate branch. This refactor must keep `app/lib/sam.ts` and local connector assets available for that future merge, but SAM is not a merge blocker for the editor-architecture branch.

The dormant `app/lib/sam.ts` still references removed normalized-geometry utilities, so the incoming SAM branch must target canonical source-image geometry rather than reviving the deleted `1000×650` model.

### Cephalometric landmarks

Not part of Poligome. Do not port the legacy cephalometric special case.

## Architecture checks passed

- `/annotate` points only to `CanonicalEditorWorkbench`.
- legacy `/anotar`, `/annotate-next`, bridge and annotation adapter paths are removed.
- source-image pixels are the only annotation geometry space.
- V4 project persistence declares `coordinate_space: "image-pixels"` and rejects old normalized manifests.
- annotations-only project assets can be re-linked without changing their persisted IDs.
- COCO, YOLO and GeoJSON canonical codecs are covered by cross-branch demo goldens, with explicit justification only for intentional semantic differences.
- Quality/Review operates on source-image geometry.
- PT/EN/FR/ES active canonical surfaces are protected by the i18n parity-debt gate.
- mobile pan/pinch and source-pixel hit geometry are tested.
- native tiled COG planning is viewport-bounded and uses a bounded LRU cache.
- advanced vector editing includes snapping, simplify, merge, holes, split, reshape, duplication and canonical polygon transform.
- management operations that cannot be fully reconstructed by annotation undo are confirmation-protected.

## Validation evidence

Implementation head `e9ef0f157b64d1c6d0bb09a1f1916f1572f0d138` passed workflow run `34711865459` completely:

- verified Vinext production build;
- complete Node test suite;
- editor i18n parity-debt gate;
- cross-branch COCO/YOLO/GeoJSON/semantic `.plgm` goldens;
- `/annotate?demo=1` smoke test;
- COG tile benchmark.

At the second audit the branch is also `0` commits behind `main`, so there is no unreviewed base-branch drift hidden by the parity work.

## Known non-blocking technical risks

- no manual browser run with a genuinely huge production COG has been recorded in this refactor audit;
- remote COG requires CORS plus HTTP Range `206` support;
- complete projects containing a local giant COG bundle the original raster and can therefore produce very large `.plgm` files;
- COG tile reads have a bounded decoded cache but still lack explicit in-flight read de-duplication/concurrency scheduling;
- SAM branch integration can conflict semantically with the removed normalized geometry even if Git reports a clean textual merge.

## Merge criterion

The original criterion was: move this audit from **HOLD** to **GO** only when every confirmed merge blocker is either implemented with tests or explicitly retired by a recorded product decision and the exact implementation head passes the complete `Editor Refactor` workflow.

That criterion is satisfied. Merge is therefore **recommended from the editor-architecture audit perspective**, subject to the normal repository merge action and any independent manual product acceptance the maintainer chooses to perform.
