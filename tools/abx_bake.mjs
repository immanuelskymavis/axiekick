// Bake the Origins chimera rigs into sprite sheets for abominaxie/chimeras.js.
//
// The chimeras use meshes, weighted deforms and transform constraints, which
// the game's small region-only runtime does not draw. So they are rendered
// once, here, with the official spine-ts 3.8 canvas runtime in headless
// Chromium, and the game ships frames. Run tools/abx_pack.py first (it fetches
// the sources into .cache/abx).
//
//     node tools/abx_bake.mjs
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { chromium } = createRequire(import.meta.url)("playwright");
const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(HERE, ".cache", "abx");
const CHIM = path.join(CACHE, "gtk2d/Assets/AxieInfinity/AxieStandardAssets/Spines/chimeras");
const UI = path.join(CACHE, "kit/Assets/OriginsKit/BattleUI");
const OUT = path.join(HERE, "abominaxie", "chimeras.js");
const SPINE_JS = path.join(CACHE, "spine-canvas.js");
const SPINE_URL = "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/3.8/spine-ts/build/spine-canvas.js";

// id: [display height in game px, animations to bake]
const MOVE = "action/move-forward", HIT = "defense/hit-by-normal", DIE = "defense/hit-die";
const ATK = "attack/melee/normal-attack";
const BOSS = [MOVE, DIE, ATK];
const CHIMERAS = {
  "slime": [62, [MOVE, DIE]],
  "slime-attack": [66, [MOVE, DIE, "attack/ranged/eye-ball-shot"]],
  "slime-defense": [72, [MOVE, DIE]],
  "slime-support": [66, [MOVE, DIE]],
  "slime-forest-a": [66, [MOVE, DIE]],
  "slime-forest-b": [72, [MOVE, DIE]],
  "wolf-gray": [84, [MOVE, DIE]],
  "wolf-aquatic": [92, [MOVE, DIE]],
  "treant": [92, [MOVE, DIE]],
  "treant-flowering": [96, [MOVE, DIE]],
  "treant-fighter": [124, [MOVE, DIE, ATK]],
  "dryad-ranger": [124, ["action/idle/normal", DIE, "attack/ranged/cast"]],
  "dryad-mage": [134, [MOVE, DIE, "attack/ranged/cast-high"]],
  "dryad-fighter": [134, [MOVE, DIE, ATK]],
  "wolf-alpha": [176, BOSS],
  "bear-mom": [184, BOSS],
  "slime-fusion": [200, BOSS],
  "wolf-aquatic-alpha": [184, BOSS],
  "bear-dad": [220, BOSS],
  "werewolf": [270, [MOVE, DIE, "attack/melee/bite-attack"]],
};
const RES = 1.1;   // bake above display size so it stays crisp when the camera zooms
const FPS = 12, MAX_FRAMES = 14;

if (!fs.existsSync(SPINE_JS)) {
  const r = await fetch(SPINE_URL);
  fs.writeFileSync(SPINE_JS, Buffer.from(await r.arrayBuffer()));
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route("http://abx.local/**", route => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
  const file = rel.startsWith("ui/") ? path.join(UI, rel.slice(3)) : path.join(CHIM, rel);
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
  route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { "access-control-allow-origin": "*" } });
});
await page.goto("http://abx.local/index");
await page.addScriptTag({ content: fs.readFileSync(SPINE_JS, "utf8") });

const bake = async (job) => page.evaluate(async ({ job, RES, FPS, MAX_FRAMES }) => {
  const base = "http://abx.local/";
  const am = new spine.canvas.AssetManager(base);
  am.loadText(job.atlas);
  am.loadTexture(job.png);
  if (job.binary) am.loadBinary(job.skel); else am.loadText(job.skel);
  while (!am.isLoadingComplete()) {
    if (am.hasErrors()) throw new Error(JSON.stringify(am.getErrors()));
    await new Promise(r => setTimeout(r, 20));
  }
  const atlas = new spine.TextureAtlas(am.get(job.atlas), () => am.get(job.png));
  const loader = new spine.AtlasAttachmentLoader(atlas);
  const data = job.binary ? new spine.SkeletonBinary(loader).readSkeletonData(am.get(job.skel))
                          : new spine.SkeletonJson(loader).readSkeletonData(am.get(job.skel));
  const sk = new spine.Skeleton(data);
  const st = new spine.AnimationState(new spine.AnimationStateData(data));
  const off = new spine.Vector2(), size = new spine.Vector2();

  const poseAt = (anim, t) => {
    sk.setToSetupPose();
    st.clearTracks();
    st.setAnimation(0, anim, false);
    st.update(t);
    st.apply(sk);
    sk.updateWorldTransform();
  };
  const frameTimes = anim => {
    const d = data.findAnimation(anim).duration || 0.1;
    const n = Math.max(1, Math.min(MAX_FRAMES, Math.round(d * FPS)));
    return { d, ts: Array.from({ length: n }, (_, i) => (i * d) / n) };
  };
  const anims = job.anims || data.animations.map(a => a.name);
  // scale from the first animation's first frame, so the body is the size we ask for
  poseAt(anims[0], 0);
  sk.getBounds(off, size, []);
  const scale = (job.height * RES) / size.y;
  const avail = anims.filter(a => data.findAnimation(a));
  const out = { scale: 1 / RES, anims: {} };
  const pad = 2;
  for (const a of avail) {
    const { d, ts } = frameTimes(a);
    // this animation's own bounds, so a lunge does not pad every walk frame
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const t of ts) {
      poseAt(a, t);
      sk.getBounds(off, size, []);
      x0 = Math.min(x0, off.x); y0 = Math.min(y0, off.y);
      x1 = Math.max(x1, off.x + size.x); y1 = Math.max(y1, off.y + size.y);
    }
    const fw = Math.ceil((x1 - x0) * scale) + pad * 2, fh = Math.ceil((y1 - y0) * scale) + pad * 2;
    const ax = -x0 * scale + pad, ay = y1 * scale + pad;     // root (feet) in frame pixels
    const cols = Math.min(ts.length, Math.max(1, Math.floor(4096 / fw)));
    const rows = Math.ceil(ts.length / cols);
    const cv = document.createElement("canvas");
    cv.width = cols * fw; cv.height = rows * fh;
    const ctx = cv.getContext("2d");
    const r = new spine.canvas.SkeletonRenderer(ctx);
    r.triangleRendering = true;
    ts.forEach((t, i) => {
      poseAt(a, t);
      ctx.save();
      ctx.beginPath();
      ctx.rect((i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
      ctx.clip();
      ctx.translate((i % cols) * fw + ax, Math.floor(i / cols) * fh + ay);
      ctx.scale(scale, -scale);
      r.draw(sk);
      ctx.restore();
    });
    out.anims[a] = { n: ts.length, cols, dur: d, fw, fh, ax, ay, src: cv.toDataURL("image/webp", 0.72) };
  }
  return out;
}, { job, RES, FPS, MAX_FRAMES });

const result = { chimeras: {}, ui: {} };
for (const [id, [height, anims]] of Object.entries(CHIMERAS)) {
  const r = await bake({ atlas: `${id}/${id}.atlas.txt`, png: `${id}/${id}.png`, skel: `${id}/${id}.json`, height, anims });
  result.chimeras[id] = r;
  const kb = Object.values(r.anims).reduce((s, a) => s + a.src.length, 0) / 1024 | 0;
  console.log(`${id.padEnd(20)} ${Object.keys(r.anims).length} anims  ${kb} KB`);
}
// the Origins result banners, played over the run summary
for (const id of ["victory", "defeated"]) {
  const r = await bake({ atlas: `ui/${id}/${id}.atlas.txt`, png: `ui/${id}/${id}.png`,
    skel: `ui/${id}/${id}.skel.bytes`, binary: true, height: 200, anims: null }).catch(e => ({ err: String(e) }));
  if (r.err) { console.log(id, "skipped:", r.err.slice(0, 300)); continue; }
  result.ui[id] = r;
  console.log(`${id.padEnd(20)} ${Object.keys(r.anims).join(",")}`);
}
await browser.close();
fs.writeFileSync(OUT, "/* generated by tools/abx_bake.mjs - do not edit */\nwindow.ABX_CHIMERAS=" + JSON.stringify(result) + ";\n");
console.log(`\nwrote ${fs.statSync(OUT).size / 1024 | 0} KB -> ${OUT}`);
