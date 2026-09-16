/* Does rollback land on the same state a perfect-information run would?
 *
 * Ground truth: simulate N frames with both input streams known up front.
 * Under test: drive the same N frames through netTick(), feeding the remote
 * stream in late and out of order the way a real connection does, so the
 * client mispredicts and has to rewind.
 *
 * If the two disagree on the state hash at any checkpoint, rollback is wrong.
 *
 *   node tools/rollback-test.mjs
 */
import { G } from "./harness.mjs";

const { newMatch, step, net, netTick, IN_DIVE, IN_KICK, app } = G;
const FRAMES = 1800;
const SEED = 0x2f6e2b1;

/* one deterministic stream of button presses per player */
function stream(n, salt) {
  let s = (SEED ^ (salt * 2654435761)) >>> 0;
  const out = [];
  let held = 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    if ((s >>> 9) % 7 === 0) held ^= IN_DIVE;
    if ((s >>> 13) % 11 === 0) held ^= IN_KICK;
    out.push(held);
  }
  return out;
}

function hash(s) {
  let h = 2166136261;
  const mix = n => { h = (Math.imul(h ^ (n | 0), 16777619)) >>> 0; };
  mix(s.tick); mix(s.round); mix(s.timer); mix(s.score[0]); mix(s.score[1]);
  mix(s.phase.length * 31 + s.phase.charCodeAt(0));
  for (const p of s.p) {
    mix(Math.round(p.x * 64)); mix(Math.round(p.y * 64));
    mix(Math.round(p.vx * 64)); mix(Math.round(p.vy * 64));
    mix(p.st.charCodeAt(0) * 7 + p.st.length); mix(p.t);
    mix(p.meter); mix(p.jumps); mix(p.hang); mix(p.floatUsed); mix(p.ward);
  }
  return h >>> 0;
}

const a = stream(FRAMES + 64, 1);
const b = stream(FRAMES + 64, 2);

/* ---- ground truth ---- */
const truth = [];
{
  const s = newMatch(1, 4, null, 99, { win: 9 });
  for (let f = 0; f < FRAMES; f++) {
    step(s, a[f], b[f]);
    truth.push(hash(s));
  }
}

/* ---- under test: the same match, driven through netTick ---- */
function run(label, jitter) {
  app.m = newMatch(1, 4, null, 99, { win: 9 });
  net.on = true;
  net.role = "host";
  net.frame = 0;
  net.delay = 2;
  net.local = []; net.remote = []; net.used = []; net.predict = 0;
  net.snaps.clear();
  net.rollbacks = 0; net.worstRollback = 0; net.rbLost = 0;
  net.stall = 0; net.stalls = 0; net.worstStall = 0;
  net.ch = null;            /* netSendInputs and pings no-op without a channel */
  for (let f = 0; f < net.delay; f++) { net.local[f] = a[f]; net.remote[f] = b[f]; }

  let ran = 0, mispredicted = 0;
  let rs = 0x9e3779b9;
  const rnd = () => { rs = (Math.imul(rs, 1103515245) + 12345) & 0x7fffffff; return rs / 0x7fffffff; };

  while (net.frame < FRAMES) {
    const f = net.frame;

    /* the opponent's inputs turn up late, in bursts, sometimes out of order */
    for (let k = 0; k < 3; k++) {
      const lag = jitter(rnd);
      const at = f - lag;
      if (at >= 0 && at < b.length && net.remote[at] === undefined) net.remote[at] = b[at];
    }

    const predicted = net.remote[f] === undefined;
    const pair = netTick(a[f + net.delay] === undefined ? 0 : a[f + net.delay]);
    if (!pair) {                       /* stalled: let the backlog catch up */
      for (let at = Math.max(0, f - 40); at <= f; at++) {
        if (at < b.length && net.remote[at] === undefined) net.remote[at] = b[at];
      }
      continue;
    }
    if (predicted) mispredicted++;
    for (const e of step(app.m, pair[0], pair[1])) void e;
    ran++;

  }

  /* everything has arrived; force one last resync so any outstanding
     correction is applied, then compare the final state */
  for (let at = 0; at < FRAMES; at++) if (net.remote[at] === undefined) net.remote[at] = b[at];
  G.netResync();

  const got = hash(app.m);
  const want = truth[FRAMES - 1];
  const ok = got === want;
  console.log(
    `${label.padEnd(22)} frames=${ran} mispredicted=${mispredicted} ` +
    `rollbacks=${net.rollbacks} worst=${net.worstRollback} lostSnaps=${net.rbLost} ` +
    `stalls=${net.stalls} -> ${ok ? "MATCH" : "DIVERGED"}`);
  if (!ok) console.log(`   want ${want}  got ${got}`);
  return ok;
}

let pass = true;
pass &= run("perfect delivery", () => 0);
pass &= run("2-4 frames late", rnd => 2 + Math.floor(rnd() * 3));
pass &= run("6-10 frames late", rnd => 6 + Math.floor(rnd() * 5));
pass &= run("bursty 0-11", rnd => Math.floor(rnd() * 12));
pass &= run("mostly 9, spiky", rnd => (rnd() < 0.15 ? 11 : 9));

console.log(pass ? "\nrollback matches perfect information" : "\nROLLBACK IS WRONG");
process.exit(pass ? 0 : 1);
