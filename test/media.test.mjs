import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPayload, extractUrls, runMedia, DEFAULT_MODELS } from "../lib/media.mjs";

test("flux image payload uses image_size, not aspect_ratio", () => {
  const p = buildPayload({ provider: "fal", model: "fal-ai/flux/dev", kind: "image", prompt: "x", aspect: "16:9" });
  assert.equal(p.image_size, "landscape_16_9");
  assert.equal("aspect_ratio" in p, false);
});

test("non-flux fal image model uses aspect_ratio", () => {
  const p = buildPayload({ provider: "fal", model: "fal-ai/recraft/v3", kind: "image", prompt: "x", aspect: "1:1" });
  assert.equal(p.aspect_ratio, "1:1");
  assert.equal("image_size" in p, false);
});

test("fal video payload attaches the init image when given", () => {
  const p = buildPayload({ provider: "fal", model: "fal-ai/seedance", kind: "video", prompt: "x", initImageDataUri: "data:image/png;base64,AAAA" });
  assert.equal(p.image_url, "data:image/png;base64,AAAA");
});

test("openrouter image payload is a chat-completions body with image modality", () => {
  const p = buildPayload({ provider: "openrouter", model: "google/gemini-2.5-flash-image", kind: "image", prompt: "hi" });
  assert.deepEqual(p.modalities, ["image", "text"]);
  assert.equal(p.messages[0].content, "hi");
});

test("openrouter video is a clear error, not a silent fallback", () => {
  assert.throws(
    () => buildPayload({ provider: "openrouter", model: "x", kind: "video", prompt: "x" }),
    /does not serve video/
  );
});

test("extractUrls handles fal and openrouter shapes", () => {
  assert.deepEqual(extractUrls("fal", { images: [{ url: "a" }] }), ["a"]);
  assert.deepEqual(extractUrls("fal", { video: { url: "v" } }), ["v"]);
  assert.deepEqual(
    extractUrls("openrouter", { choices: [{ message: { images: [{ image_url: { url: "b" } }] } }] }),
    ["b"]
  );
});

test("runMedia writes a provenance manifest with no secrets, fetch stubbed", async () => {
  const out = mkdtempSync(join(tmpdir(), "hs-media-"));
  process.env.FAL_KEY = "secret-should-not-appear";
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://fal.run/")) {
      return { ok: true, json: async () => ({ images: [{ url: "https://cdn/img.png" }] }) };
    }
    return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
  const res = await runMedia(["image", "a cat", "--out", out, "--stamp", "2026-08-10T00-00-00"], { fetchImpl });
  assert.equal(res.exitCode, 0);
  const manifest = readFileSync(join(out, "manifest.jsonl"), "utf8");
  assert.match(manifest, /"prompt":"a cat"/);
  assert.match(manifest, /"model":"fal-ai\/flux\/dev"/);
  assert.equal(manifest.includes("secret-should-not-appear"), false);
  assert.ok(existsSync(join(out, "image-2026-08-10T00-00-00-01-01.png")));
  delete process.env.FAL_KEY;
  rmSync(out, { recursive: true, force: true });
});

test("runMedia keeps other items when one fails (per-item failure)", async () => {
  const out = mkdtempSync(join(tmpdir(), "hs-media-"));
  process.env.FAL_KEY = "k";
  let call = 0;
  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://fal.run/")) {
      call++;
      if (call === 1) return { ok: false, status: 500, text: async () => "boom" };
      return { ok: true, json: async () => ({ images: [{ url: "https://cdn/ok.png" }] }) };
    }
    return { ok: true, arrayBuffer: async () => new Uint8Array([9]).buffer };
  };
  const res = await runMedia(["image", "x", "--n", "2", "--out", out, "--stamp", "s"], { fetchImpl });
  assert.equal(res.exitCode, 0); // one succeeded
  const entry = JSON.parse(readFileSync(join(out, "manifest.jsonl"), "utf8").trim());
  assert.equal(entry.files.length, 1);
  assert.equal(entry.failures.length, 1);
  assert.match(entry.failures[0].error, /fal 500/);
  delete process.env.FAL_KEY;
  rmSync(out, { recursive: true, force: true });
});

test("runMedia rejects an unknown kind", async () => {
  const res = await runMedia(["hologram", "x"]);
  assert.equal(res.exitCode, 2);
});

test("DEFAULT_MODELS: openrouter has no video default", () => {
  assert.equal(DEFAULT_MODELS.openrouter.video, null);
});
