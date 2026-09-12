import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeCss = await readFile(new URL("../app/annotate/annotate-interface.module.css", import.meta.url), "utf8");
const drawerCss = await readFile(new URL("../app/annotate/annotate-drawer-state.module.css", import.meta.url), "utf8");
const panels = await readFile(new URL("../app/editor/panels/editor-management-panels.tsx", import.meta.url), "utf8");

test("annotate desktop keeps the pre-refactor three-column workspace", () => {
  assert.match(routeCss, /grid-template-columns:\s*256px minmax\(0, 1fr\) 288px/);
  assert.match(routeCss, /grid-template-rows:\s*96px 54px minmax\(0, 1fr\) 42px/);
  assert.match(routeCss, /grid-template-columns:\s*222px minmax\(0, 1fr\) 252px/);
});

test("annotate responsive breakpoints preserve drawer composition", () => {
  assert.match(routeCss, /@media \(max-width: 860px\)/);
  assert.match(routeCss, /width:\s*min\(310px, 86vw\)/);
  assert.match(routeCss, /transform:\s*translateX\(-105%\)/);
  assert.match(routeCss, /transform:\s*translateX\(105%\)/);
  assert.match(routeCss, /@media \(max-width: 560px\)/);
  assert.match(routeCss, /grid-template-rows:\s*88px 50px minmax\(0, 1fr\) 38px/);
});

test("mobile drawers are driven by explicit React state", () => {
  assert.match(panels, /data-panel="images" data-open=\{leftOpen/);
  assert.match(panels, /data-panel="right" data-open=\{rightOpen/);
  assert.match(panels, /data-mobile-toggle="images"/);
  assert.match(panels, /data-mobile-toggle="right"/);
  assert.match(drawerCss, /\[data-panel="images"\]\[data-open="true"\]/);
  assert.match(drawerCss, /\[data-panel="right"\]\[data-open="true"\]/);
});
