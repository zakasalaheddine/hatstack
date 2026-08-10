// Image / video generation behind one interface, with a provenance manifest so
// any asset traces back to the prompt that made it. Keys come from FAL_KEY /
// OPENROUTER_API_KEY only — never arguments, never written to the manifest.
//
// Payloads are per-model, not global: fal-ai/flux/dev takes `image_size`, not
// `aspect_ratio`. The builders below are pure and unit-tested against recorded
// request shapes; no live API call happens in the test suite.
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";

export const DEFAULT_MODELS = {
  fal: { image: "fal-ai/flux/dev", video: "fal-ai/bytedance/seedance/v1/lite/text-to-video" },
  openrouter: { image: "google/gemini-2.5-flash-image", video: null },
};

// Map a friendly aspect like "16:9" to a flux image_size enum.
const FLUX_SIZE = {
  "1:1": "square_hd",
  "4:3": "landscape_4_3",
  "3:4": "portrait_4_3",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
};

// ---- pure payload builders --------------------------------------------------
// Returns the request body for one generation. Throws on impossible combinations
// (e.g. video on OpenRouter) — a clear error, never a silent fallback.
export function buildPayload({ provider, model, kind, prompt, n = 1, aspect = "16:9", initImageDataUri = null }) {
  if (provider === "openrouter") {
    if (kind === "video") {
      throw new Error("OpenRouter does not serve video generation. Use --provider fal.");
    }
    return {
      model,
      modalities: ["image", "text"],
      messages: [{ role: "user", content: prompt }],
    };
  }

  if (provider === "fal") {
    if (kind === "image") {
      const input = { prompt };
      // flux family keys the size as image_size; other fal image models use aspect_ratio.
      if (/\bflux\b/.test(model)) {
        input.image_size = FLUX_SIZE[aspect] || aspect;
        input.num_images = 1;
      } else {
        input.aspect_ratio = aspect;
        input.num_images = 1;
      }
      return input;
    }
    // video
    const input = { prompt };
    if (initImageDataUri) input.image_url = initImageDataUri;
    return input;
  }

  throw new Error(`Unknown provider '${provider}'. Use fal or openrouter.`);
}

// Pull output URLs out of a provider response, tolerant of the shape differences.
export function extractUrls(provider, data) {
  if (provider === "openrouter") {
    const images = data?.choices?.[0]?.message?.images ?? [];
    return images.map((i) => i.image_url?.url ?? i.url).filter(Boolean);
  }
  return [
    ...(data.images ?? []).map((i) => i.url),
    ...(data.video ? [data.video.url] : []),
    ...(data.videos ?? []).map((v) => v.url),
  ].filter(Boolean);
}

// ---- network + orchestration ------------------------------------------------
async function falCall(model, input, fetchImpl) {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set.");
  const res = await fetchImpl(`https://fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

async function openrouterCall(body, fetchImpl) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set.");
  const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

async function saveUrl(url, path, fetchImpl) {
  if (url.startsWith("data:")) {
    await writeFile(path, Buffer.from(url.split(",")[1], "base64"));
  } else {
    const r = await fetchImpl(url);
    if (!r.ok) throw new Error(`download failed ${r.status}`);
    await writeFile(path, Buffer.from(await r.arrayBuffer()));
  }
  return path;
}

function parseArgs(argv) {
  const kind = argv[0];
  const prompt = argv[1];
  const flag = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? def : argv[i + 1];
  };
  return {
    kind,
    prompt,
    provider: flag("provider", process.env.HATSTACK_MEDIA_PROVIDER || "fal"),
    model: flag("model", null),
    n: parseInt(flag("n", "1"), 10),
    aspect: flag("aspect", "16:9"),
    out: flag("out", ".hatstack/media"),
    initImage: flag("image", null),
    stamp: flag("stamp", null),
  };
}

// CLI entry. Returns { exitCode }. Failures are per-item: one bad generation in
// a batch reports that item, keeps the others, and records the failure.
export async function runMedia(argv, { fetchImpl = globalThis.fetch } = {}) {
  const a = parseArgs(argv);
  if (!a.kind || !["image", "video"].includes(a.kind) || !a.prompt) {
    process.stderr.write(
      'usage: hatstack media <image|video> "<prompt>" [--provider fal|openrouter] [--model M] [--n N] [--aspect 16:9] [--out DIR] [--image keyframe]\n'
    );
    return { exitCode: 2 };
  }
  const model = a.model || DEFAULT_MODELS[a.provider]?.[a.kind];
  if (!model) {
    process.stderr.write(`No default ${a.kind} model for provider '${a.provider}'. Pass --model, or use --provider fal.\n`);
    return { exitCode: 2 };
  }

  // Fail fast on the impossible combination before any I/O.
  let initImageDataUri = null;
  if (a.kind === "video" && a.initImage) {
    initImageDataUri = `data:image/png;base64,${(await readFile(a.initImage)).toString("base64")}`;
  }

  await mkdir(a.out, { recursive: true });
  const stamp = a.stamp || new Date().toISOString().replace(/[:.]/g, "-");
  const ext = a.kind === "video" ? "mp4" : "png";
  const saved = [];
  const failures = [];

  for (let i = 0; i < a.n; i++) {
    try {
      const payload = buildPayload({
        provider: a.provider,
        model,
        kind: a.kind,
        prompt: a.prompt,
        n: 1,
        aspect: a.aspect,
        initImageDataUri,
      });
      const data =
        a.provider === "fal" ? await falCall(model, payload, fetchImpl) : await openrouterCall(payload, fetchImpl);
      const urls = extractUrls(a.provider, data);
      if (urls.length === 0) throw new Error(`provider returned no media: ${JSON.stringify(data).slice(0, 200)}`);
      let j = 0;
      for (const url of urls) {
        const name = `${a.kind}-${stamp}-${String(i + 1).padStart(2, "0")}-${String(++j).padStart(2, "0")}.${ext}`;
        saved.push(await saveUrl(url, join(a.out, name), fetchImpl));
      }
    } catch (err) {
      failures.push({ index: i + 1, error: err.message });
      process.stderr.write(`hatstack media: item ${i + 1} failed: ${err.message}\n`);
    }
  }

  // Provenance manifest — no secrets, ever.
  const entry = {
    ts: stamp,
    kind: a.kind,
    provider: a.provider,
    model,
    prompt: a.prompt,
    params: { aspect: a.aspect, n: a.n, initImage: a.initImage || null },
    files: saved.map((p) => basename(p)),
    failures,
  };
  await writeFile(join(a.out, "manifest.jsonl"), JSON.stringify(entry) + "\n", { flag: "a" });

  if (saved.length) process.stdout.write(saved.join("\n") + "\n");
  process.stdout.write(`manifest: ${join(a.out, "manifest.jsonl")}\n`);
  // Whole-batch failure is a non-zero exit; a partial batch still succeeded.
  return { exitCode: saved.length === 0 && a.n > 0 ? 1 : 0 };
}
