/* Load game/index.html's script in node with just enough DOM to boot, so the
   simulation can be exercised without a browser. Rendering calls fall into a
   no-op canvas; everything the sim touches is real. */
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../game/index.html", import.meta.url), "utf8");
const src = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));

const noop = () => { };
function fakeCtx() {
  const grad = { addColorStop: noop };
  return new Proxy({}, {
    get(t, k) {
      if (k === "measureText") return () => ({ width: 40 });
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad;
      if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      if (k === "canvas") return el("canvas");
      return typeof t[k] === "undefined" ? noop : t[k];
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
function el(tag) {
  const e = {
    tag, style: {}, value: "", textContent: "", width: 1000, height: 580,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 580 }),
    getContext: fakeCtx, select: noop, focus: noop, appendChild: noop
  };
  return e;
}

const store = {};
const win = {
  devicePixelRatio: 1,
  addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
  requestAnimationFrame: noop, setTimeout: noop, clearTimeout: noop,
  performance: { now: () => Date.now() },
  navigator: { getGamepads: () => [], clipboard: null },
  location: { href: "http://x/", origin: "http://x", pathname: "/", hash: "" },
  history: { replaceState: noop },
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  Image: class { constructor() { this.complete = false; this.naturalWidth = 0; } set src(v) { } },
  AudioContext: undefined, webkitAudioContext: undefined,
  RTCPeerConnection: undefined, CompressionStream: undefined,
  speechSynthesis: { speak: noop, cancel: noop, getVoices: () => [] },
  SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
  atob: s => Buffer.from(s, "base64").toString("binary"),
  btoa: s => Buffer.from(s, "binary").toString("base64"),
  TextEncoder, TextDecoder, Math, JSON, console, Date
};
win.window = win;
win.globalThis = win;
win.document = {
  getElementById: () => el("div"), createElement: el, querySelector: () => el("div"),
  addEventListener: noop, hasFocus: () => true, fonts: { ready: Promise.resolve() },
  body: el("body"), execCommand: () => true
};

/* top-level const/let live in the script's own scope, so hand them out */
const expose = `
;globalThis.__G = {
  CHARS, SPINES, DIFFS, AUGS, AUG, LADDER, MODES, run, app, net,
  IN_DIVE, IN_KICK, METER_MAX, METER_GAIN, KF_CAP, STAGE_W, STAGE_H, FLOOR_Y,
  WIN_ROUNDS, LINE_TICKS, BG_IMGS, DEG,
  newMatch, step, stepPlayer, statsFor, cpuInput, arcadeStart, arcadeSetup,
  arcadeFight, arcadeResolve, arcadeTake, arcadeOffer, runRand, endRound,
  hurtBox, hitRadius, kickAngle, spineFor, applyKickFactor,
  drawMode, drawSelect, drawStagePick, drawAugPick, drawArcCard, drawStory,
  drawLadder, drawDraft, drawRunEnd, drawPause, drawMatch, drawTitle,
  drawMeter, drawTip, drawHUD, openPause, pauseRows, showArc, rackRows,
  settingsRows, controlRows, storyLines, SETTINGS, BINDS, VS_RULES,
  save, CHALLENGES, COSTUMES, TIERS, activeChallenges, rollChallenges, track,
  trackStoryChar, buyPass, charLocked, prizePool, drawPass, drawTutorial,
  tutStart, tutorialTick, progressOf, checkChallenges, TUT_STEPS, PAIR_TALK,
  say, ANNOUNCE, claimTiers
};`;

const ctxv = vm.createContext(win);
vm.runInContext(src + expose, ctxv, { filename: "axiekick.js" });
export const G = win.__G;
