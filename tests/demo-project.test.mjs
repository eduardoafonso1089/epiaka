import assert from "node:assert/strict";
import test from "node:test";
import { createDemoProject } from "../app/lib/demo.ts";

test("keeps the reviewed aerial demo geometry", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Blob(["demo-image"], { type: "image/jpeg" }), { status: 200 });

  try {
    const demo = await createDemoProject("pt");
    assert.equal(demo.annotations.length, 18);
    assert.deepEqual(demo.annotations.find((item) => item.id === "demo-a1")?.pts?.slice(-4), [
      188.59603992415, 304.7729431453254, 111.45246880007056, 303.83214980324755,
    ]);
    assert.equal(demo.annotations.find((item) => item.id === "demo-b1")?.pts?.length, 36);
    assert.equal(demo.annotations.find((item) => item.id === "demo-b4")?.rotation, 0.4132347145292916);
    assert.deepEqual(demo.annotations.find((item) => item.id === "demo-c6")?.pts?.slice(0, 4), [
      2.3225389172264768, 286.89786964584556, 106.74859251201693, 290.66104301415714,
    ]);
    demo.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
