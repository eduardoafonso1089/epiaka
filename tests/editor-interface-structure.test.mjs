import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(new URL(path, import.meta.url), 'utf8');

test('annotate route owns the canonical editor inside the restored responsive frame', async () => {
  const [page, css, drawerCss] = await Promise.all([
    read('../app/annotate/page.tsx'),
    read('../app/annotate/annotate-interface.module.css'),
    read('../app/annotate/annotate-drawer-state.module.css'),
  ]);
  assert.match(page, /annotate-interface\.module\.css/);
  assert.match(page, /annotate-drawer-state\.module\.css/);
  assert.match(page, /styles\.routeRoot/);
  assert.match(page, /drawer\.routeRoot/);
  assert.match(css, /\.routeRoot/);
  assert.match(css, /@media \(max-width: 860px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /var\(--paper\)/);
  assert.match(css, /var\(--surface\)/);
  assert.match(drawerCss, /data-open="true"/);
});

test('management, vector and review surfaces use the canonical editor interface module', async () => {
  const [panels, vector, review, css] = await Promise.all([
    read('../app/editor/panels/editor-management-panels.tsx'),
    read('../app/editor/vector/vector-toolbar.tsx'),
    read('../app/editor/review/quality-review-panel.tsx'),
    read('../app/editor/editor-interface.module.css'),
  ]);
  for (const source of [panels, vector, review]) assert.match(source, /editor-interface\.module\.css/);
  assert.doesNotMatch(panels, /const panelStyle|const listStyle|const rowStyle/);
  assert.doesNotMatch(vector, /style=\{\{/);
  assert.match(css, /\.managementGrid/);
  assert.match(css, /\.vectorBar/);
  assert.match(css, /\.reviewPanel/);
});

test('documentation calls this an interface structure and records SAM as a separate-branch integration', async () => {
  const [architecture, readme] = await Promise.all([
    read('../docs/EDITOR_ARCHITECTURE.md'),
    read('../README.md'),
  ]);
  assert.match(architecture, /## Interface structure/);
  assert.doesNotMatch(architecture, /canonical shell|editor shell/i);
  assert.match(architecture, /SAM is not a merge blocker/);
  assert.match(architecture, /integrated from a separate branch/);
  assert.match(readme, /local SAM UI is intentionally not part of this\s+> branch's merge target/i);
  assert.match(readme, /canonical editor uses the same global visual tokens/);
});
