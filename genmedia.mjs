#!/usr/bin/env node
/**
 * genmedia — image and video generation behind one interface.
 *
 *   genmedia image "a stick figure explaining the fall of Carthage" \
 *     --provider fal --model fal-ai/flux/dev --out .hatstack/media --n 3
 *
 *   genmedia video "camera pushes in on the map" \
 *     --provider fal --model fal-ai/bytedance/seedance/v1/lite/text-to-video \
 *     --image .hatstack/media/frame-01.png
 *
 * Keys come from FAL_KEY / OPENROUTER_API_KEY. Never passed as arguments,
 * never written to the manifest.
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";

const argv = process.argv.slice(2);
const kind = argv[0];
const prompt = argv[1];

if (!kind || !["image", "video"].includes(kind) || !prompt) {
  console.error("usage: genmedia <image|video> \"<prompt>\" [--provider fal|openrouter] [--model M] [--out DIR] [--n N] [--image PATH] [--aspect 16:9]");
  process.exit(1);
}

const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const provider = flag("provider", process.env.HATSTACK_MEDIA_PROVIDER || "fal");
const outDir = flag("out", ".hatstack/media");
const n = parseInt(flag("n", "1"), 10);
const aspect = flag("aspect", "16:9");
const initImage = flag("image", null);

const DEFAULTS = {
  fal: { image: "fal-ai/flux/dev", video: "fal-ai/bytedance/seedance/v1/lite/text-to-video" },
  openrouter: { image: "google/gemini-2.5-flash-image", video: null },
};
const model = flag("model", DEFAULTS[provider]?.[kind]);

if (!model) {
  console.error(`No default ${kind} model for provider '${provider}'. Pass --model, or use --provider fal.`);
  process.exit(1);
}

async function falSubmit(input) {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set.");
  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const urls = [
    ...(data.images ?? []).map((i) => i.url),
    ...(data.video ? [data.video.url] : []),
    ...(data.videos ?? []).map((v) => v.url),
  ].filter(Boolean);
  if (!urls.length) throw new Error(`fal returned no media: ${JSON.stringify(data).slice(0, 300)}`);
  return urls;
}

async function openrouterImage() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set.");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, modalities: ["image", "text"], messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const images = data.choices?.[0]?.message?.images ?? [];
  if (!images.length) throw new Error("openrouter returned no image. Confirm the model supports image output.");
  return images.map((i) => i.image_url?.url ?? i.url);
}

async function save(url, name) {
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, name);
  if (url.startsWith("data:")) {
    await writeFile(path, Buffer.from(url.split(",")[1], "base64"));
  } else {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download failed ${r.status}`);
    await writeFile(path, Buffer.from(await r.arrayBuffer()));
  }
  return path;
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const ext = kind === "video" ? "mp4" : "png";
const saved = [];

try {
  for (let i = 0; i < n; i++) {
    let urls;
    if (provider === "fal") {
      const input = { prompt };
      if (kind === "image") Object.assign(input, { num_images: 1, aspect_ratio: aspect });
      if (initImage) {
        const b64 = (await readFile(initImage)).toString("base64");
        input.image_url = `data:image/png;base64,${b64}`;
      }
      urls = await falSubmit(input);
    } else {
      if (kind === "video") throw new Error("OpenRouter does not serve video generation. Use --provider fal.");
      urls = await openrouterImage();
    }
    for (const url of urls) {
      saved.push(await save(url, `${kind}-${stamp}-${String(i + 1).padStart(2, "0")}.${ext}`));
    }
  }
} catch (err) {
  console.error(`generation failed: ${err.message}`);
  process.exit(1);
}

// Manifest so a reviewer can trace any asset back to the prompt that made it.
const manifestPath = join(outDir, "manifest.jsonl");
const entry = { ts: stamp, kind, provider, model, prompt, aspect, initImage, files: saved.map(basename) };
await writeFile(manifestPath, JSON.stringify(entry) + "\n", { flag: "a" });

console.log(saved.join("\n"));
console.log(`\nmanifest: ${manifestPath}`);
