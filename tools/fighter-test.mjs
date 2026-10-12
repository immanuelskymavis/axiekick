/* AXIE FIGHTER checks: determinism, motion inputs, combos, blocking, and the
   CPU finishing every pairing. Run: node tools/fighter-test.mjs */
import { G } from "./harness.mjs";

const { IN_LEFT: L, IN_RIGHT: R, IN_UP: U, IN_DOWN: D, IN_LP: LP, IN_HP: HP, IN_LK: LK, IN_HK: HK } = G;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL  " + msg); } else console.log("ok    " + msg); };

function fight(c0, c1, opt) {
  const s = G.newMatch(c0, c1, opt && opt.cpu !== undefined ? opt.cpu : null, 3, Object.assign({ rules: "fighter", win: 5 }, opt));
  s.phase = "fight"; s.pt = 0;
  return s;
}
function hash(s) {
  return JSON.stringify([s.tick, s.timer, s.score, s.proj, s.p.map(p => [p.x, p.y, p.vx, p.vy, p.st, p.t, p.mv, p.mf, p.hp, p.meter, p.stun, p.combo, p.hist, p.buf])]);
}
/* hold a mask for n frames */
function hold(s, n, a, b) { for (let i = 0; i < n; i++) G.step(s, a || 0, b || 0); }
/* type a sequence of [mask, frames] for P1 while P2 holds `b` */
function seq(s, list, b) { for (const [m, n] of list) hold(s, n, m, b); }
/* P1 faces right, so forward is RIGHT */
const QCF = (btn) => [[D, 2], [D | R, 2], [R | btn, 1], [0, 1]];
const QCB = (btn) => [[D, 2], [D | L, 2], [L | btn, 1], [0, 1]];
const DP = (btn) => [[R, 2], [D, 2], [D | R | btn, 1], [0, 1]];
const SUPER = (btn) => [[D, 2], [D | R, 2], [R, 2], [D, 2], [D | R, 2], [R | btn, 1], [0, 1]];

/* --- determinism -------------------------------------------------------- */
{
  const run = () => {
    const s = G.newMatch(2, 4, null, 9, { rules: "fighter", win: 9 });
    let seed = 11;
    const r = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const bits = [L, R, U, D, LP, HP, LK, HK];
    let a = 0, b = 0, mid = null, midHash = null, tail = [];
    for (let t = 0; t < 3600; t++) {
      if (r() < 0.2) a = bits.filter(() => r() < 0.25).reduce((x, y) => x | y, 0);
      if (r() < 0.2) b = bits.filter(() => r() < 0.25).reduce((x, y) => x | y, 0);
      if (t === 1800) { mid = structuredClone(s); midHash = hash(s); }
      if (t >= 1800) tail.push([a, b]);
      G.step(s, a, b);
    }
    return { end: hash(s), mid, midHash, tail };
  };
  const x = run(), y = run();
  ok(x.end === y.end, "two runs of the same inputs end in the same state");
  const s = x.mid;
  for (const [a, b] of x.tail) G.step(s, a, b);
  ok(hash(s) === x.end, "a cloned mid-match snapshot replays to the same state");
}

/* --- motions ------------------------------------------------------------ */
{
  const p = { facing: 1, hist: [] };
  const type = (dirs) => { p.hist = dirs.flatMap(([m, n]) => Array(n).fill(m)); };
  type([[D, 2], [D | R, 2], [R, 1]]);
  ok(G.sfMotion(p, [[2], [3], [6]], 14), "236 reads as a quarter circle forward");
  p.facing = -1;
  ok(!G.sfMotion(p, [[2], [3], [6]], 14), "the same stick facing left is not 236");
  type([[D, 2], [D | L, 2], [L, 1]]);
  ok(G.sfMotion(p, [[2], [3], [6]], 14), "facing left, down-left-left is 236");
  p.facing = 1;
  type([[D, 2], [D | R, 2], [0, 20], [R, 1]]);
  ok(!G.sfMotion(p, [[2], [3], [6]], 14), "a quarter circle spread over 25 frames does not count");
}

/* --- specials come out, and 6236 is an uppercut ------------------------- */
for (let ch = 0; ch < 6; ch++) {
  let s = fight(ch, 1);
  seq(s, QCF(LP));
  hold(s, 20);
  ok(s.proj.length === 1 || s.p[0].mv === "fbL", G.CHARS[ch].name + ": 236+LP throws a projectile");
  s = fight(ch, 1);
  seq(s, [[R, 2], [D, 2], [D | R, 2], [R | HP, 1], [0, 1]]);
  ok(s.p[0].mv === "dpH", G.CHARS[ch].name + ": 6236+HP is the uppercut, not a fireball");
  s = fight(ch, 1);
  s.p[0].meter = G.SF_METER;
  seq(s, SUPER(LP));
  ok(s.p[0].mv === "sup" && s.p[0].meter === 0, G.CHARS[ch].name + ": 236236+P spends the meter on the super");
}

/* --- combos ------------------------------------------------------------- */
/* start them touching, so the first jab connects */
function close(s) { s.p[0].x = 470; s.p[1].x = 470 + (s.p[0].c.rx + s.p[1].c.rx) * 0.9; }
function maxCombo(s, list) {
  let best = 0, dmg = 0;
  for (const [m, n] of list) for (let i = 0; i < n; i++) {
    G.step(s, m, 0);
    if (s.p[1].combo > best) { best = s.p[1].combo; dmg = s.p[1].cdmg; }
  }
  for (let i = 0; i < 90; i++) { G.step(s, 0, 0); if (s.p[1].combo > best) { best = s.p[1].combo; dmg = s.p[1].cdmg; } }
  return [best, dmg];
}
let worst = 0;
for (let ch = 0; ch < 6; ch++) {
  for (let foe = 0; foe < 6; foe++) {
    const s = fight(ch, foe);
    close(s);
    const [n, dmg] = maxCombo(s, [
      [D | LK, 1], [D, 9], [D | LK, 1], [D, 8], [D | R, 2], [R | LP, 1], [0, 1]
    ]);
    ok(n >= 3, `${G.CHARS[ch].name} vs ${G.CHARS[foe].name}: 2LK 2LK 236LP is a ${n}-hit combo (${dmg})`);
    worst = Math.max(worst, dmg / s.p[1].hpMax);
  }
  /* target combos */
  for (const [from, btn, to] of G.SF_MOVES[ch].tc) {
    const s = fight(ch, 1);
    close(s);
    const bit = { lp: LP, hp: HP, lk: LK, hk: HK }[btn];
    const first = { "5LP": LP, "5HP": HP, "5LK": LK, "5HK": HK, "2LP": D | LP, "2LK": D | LK, "jLK": LK }[from];
    let list = [[first, 1], [first & D, 9], [(first & D) | bit, 1], [0, 1]];
    if (from[0] === "j") {
      /* jump in from just outside and kick on the way down */
      s.p[0].x = s.p[1].x - 150;
      G.step(s, U | R, 0);
      for (let i = 0; i < 80 && !(s.p[0].vy < 0 && s.p[0].y < 130); i++) G.step(s, 0, 0);
      list = [[LK, 1], [0, 6], [HK, 1], [0, 1]];
    }
    const [n] = maxCombo(s, list);
    ok(n >= 2, `${G.CHARS[ch].name}: target combo ${from} > ${to} connects (${n} hits)`);
  }
}
ok(worst <= 0.45, `no meterless combo above deals more than 45% (worst ${(worst * 100).toFixed(0)}%)`);

/* --- blocking ----------------------------------------------------------- */
{
  /* P2 faces left, so holding RIGHT is back */
  let s = fight(1, 0); close(s);
  seq(s, [[D | LK, 1], [D, 12]], R);
  ok(s.p[1].hp < s.p[1].hpMax, "2LK hits an opponent blocking standing");
  s = fight(1, 0); close(s);
  seq(s, [[D | LK, 1], [D, 12]], R | D);
  ok(s.p[1].hp === s.p[1].hpMax && s.p[1].st === "block", "2LK is blocked crouching");
  s = fight(1, 0); close(s);
  seq(s, [[R | HP, 1], [0, 30]], R | D);
  ok(s.p[1].hp < s.p[1].hpMax, "the 6HP overhead hits a crouching block");
  s = fight(1, 0); close(s);
  seq(s, [[R | HP, 1], [0, 30]], R);
  ok(s.p[1].hp === s.p[1].hpMax, "the 6HP overhead is blocked standing");
  s = fight(0, 1); close(s);
  seq(s, [[D, 2], [D | R, 2], [R | LP, 1], [0, 60]], R);
  ok(s.p[1].hp < s.p[1].hpMax && s.p[1].hp > s.p[1].hpMax - 30, "a blocked fireball chips");
}

/* --- throws ------------------------------------------------------------- */
{
  let s = fight(0, 1); close(s);
  seq(s, [[LP | LK, 1], [0, 60]]);
  ok(s.p[1].hp < s.p[1].hpMax, "LP+LK up close throws");
  s = fight(0, 1); close(s);
  for (let i = 0; i < 20 && s.p[1].st !== "thrown"; i++) G.step(s, LP | LK, 0);
  hold(s, 2, 0, 0); hold(s, 1, 0, LP | LK); hold(s, 60, 0, 0);
  ok(s.p[1].hp === s.p[1].hpMax, "LP+LK straight back techs the throw");
}

if (!process.argv.includes("--no-cpu")) {
  /* --- CPU ---------------------------------------------------------------- */
  let stalls = 0, games = 0, wins = [0, 0, 0, 0];
  for (let tier = 0; tier < 4; tier++) {
    for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) {
      const s = G.newMatch(a, b, tier, a * 7 + b, { rules: "fighter" });
      /* P1 is the same CPU at the tier below, so there is someone to fight */
      const mirror = G.newMatch(b, a, Math.max(0, tier - 1), b + 101, { rules: "fighter" });
      let t = 0;
      for (; t < 3 * (99 * 60 + 400) && s.phase !== "matchend"; t++) {
        mirror.p = [s.p[1], s.p[0]]; mirror.proj = s.proj; mirror.phase = s.phase; mirror.tick = s.tick;
        const in0 = G.sfCpuInput(mirror);
        G.step(s, in0, G.cpuInput(s));
      }
      games++;
      if (s.phase !== "matchend") {
        stalls++;
        console.log(`      stalled: ${G.CHARS[a].name} v ${G.CHARS[b].name} tier ${tier} round ${s.round} score ${s.score} hp ${s.p.map(p => p.hp)}`);
      }
      else if (s.score[1] > s.score[0]) wins[tier]++;
    }
  }
  ok(stalls === 0, `CPU: all ${games} pairings x tiers finish (${stalls} stalled)`);
  console.log("      CPU beat the tier below it: " + wins.map((w, i) => G.DIFFS[i].name + " " + w + "/36").join(", "));
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
