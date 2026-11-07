/* BAKBAKAN checks: determinism, knockback, platforms, hits, every signature
   mechanic, ring-outs, and CPU matches that finish. Run: node tools/bakbakan-test.mjs */
import { G } from "./harness.mjs";

const { IN_LEFT: L, IN_RIGHT: R, IN_UP: U, IN_DOWN: D, BK_ATK: A, BK_SPC: S, BK_SHD: SH, BK_JMP: J } = G;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("FAIL  " + msg); } else console.log("ok    " + msg); };
const id = name => G.BK_ROSTER.findIndex(c => c.id === name);

/* a match already past the countdown */
function match(chs, opt) {
  const s = G.bkNewMatch(chs.map(c => (typeof c === "object" ? c : { ch: c })), Object.assign({ stage: 0, seed: 5 }, opt));
  s.phase = "fight"; s.pt = 0;
  return s;
}
function place(p, x, face) { p.x = x; p.face = face; p.y = 0; p.gr = 0; }
function run(s, n, ins) { const ev = []; for (let t = 0; t < n; t++) ev.push(...G.bkStep(s, typeof ins === "function" ? ins(t) : ins || [])); return ev; }
function hash(s) {
  return JSON.stringify([s.tick, s.time, s.rng, s.proj, s.p.map(p => [p.x, p.y, p.vx, p.vy, p.kbx, p.kby, p.st, p.t, p.mk, p.mf, p.dmg, p.stocks, p.shield, p.cpu])]);
}

/* --- determinism -------------------------------------------------------- */
{
  const go = () => {
    const s = G.bkNewMatch([{ ch: 0 }, { ch: 4 }, { ch: 2, cpu: 2 }, { ch: 7, cpu: 1, parts: { horn: 1, mouth: 1, back: 0, tail: 1 } }], { stage: 1, seed: 9 });
    let seed = 13, a = 0, b = 0, mid = null, tail = [];
    const r = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const bits = [L, R, U, D, A, S, SH, J];
    for (let t = 0; t < 4000; t++) {
      if (r() < 0.2) a = bits.filter(() => r() < 0.25).reduce((x, y) => x | y, 0);
      if (r() < 0.2) b = bits.filter(() => r() < 0.25).reduce((x, y) => x | y, 0);
      if (t === 2000) mid = structuredClone(s);
      if (t >= 2000) tail.push([a, b]);
      G.bkStep(s, [a, b]);
    }
    return { end: hash(s), mid, tail };
  };
  const x = go(), y = go();
  ok(x.end === y.end, "two runs of the same inputs end in the same state");
  for (const [a, b] of x.tail) G.bkStep(x.mid, [a, b]);
  ok(hash(x.mid) === x.end, "a cloned mid-match snapshot replays to the same state");
}

/* --- knockback ---------------------------------------------------------- */
{
  const kb = [0, 50, 100, 150].map(p => G.bkKnock(p, 10, 100, 30, 100));
  ok(kb.every((v, i) => i === 0 || v > kb[i - 1]), "knockback grows with damage: " + kb.map(Math.round).join(" < "));
  ok(G.bkKnock(100, 10, 120, 30, 100) < G.bkKnock(100, 10, 80, 30, 100), "heavier fighters fly less far");

  /* the same forward tilt, at 0% and at 120% */
  const far = pct => {
    const s = match([0, 1]); place(s.p[0], -20, 1); place(s.p[1], 20, -1); s.p[1].dmg = pct;
    run(s, 1, [R | A]); let mx = 0;
    for (let t = 0; t < 120; t++) { G.bkStep(s, []); mx = Math.max(mx, s.p[1].x); }
    return mx;
  };
  ok(far(120) > far(0) + 200, "the same hit sends a fighter at 120% much further than at 0%");
}

/* --- platforms ---------------------------------------------------------- */
{
  const S0 = G.BK_STAGES[0], pl = S0.plats[0];
  const s = match([1, 0]); place(s.p[1], 250, -1);
  const p = s.p[0];
  p.x = pl.x; p.y = pl.y - 60; p.gr = -1; p.st = "air"; p.vy = 0;
  run(s, 40);
  ok(p.gr === 1 && p.y === pl.y, "falling onto a one-way platform lands on it");
  run(s, 1, [D]); run(s, 30);
  ok(p.gr === 0 && p.y === S0.main.y, "down drops through it to the stage below");
  run(s, 1, [J]); run(s, 18, [J]);
  ok(p.y < pl.y, "jumping from below passes up through it (y " + Math.round(p.y) + ")");
  run(s, 60);
  ok(p.gr === 1, "and lands on top on the way down");
}

/* --- hits --------------------------------------------------------------- */
{
  const s = match([id("pakyaw"), 1]); place(s.p[0], 0, 1); place(s.p[1], 40, -1);
  run(s, 12, t => [t === 0 ? A : 0]);
  ok(s.p[1].dmg > 0, "a jab in range hits (" + s.p[1].dmg + "%)");
  const s2 = match([id("pakyaw"), 1]); place(s2.p[0], 0, 1); place(s2.p[1], 160, -1);
  run(s2, 12, t => [t === 0 ? A : 0]);
  ok(s2.p[1].dmg === 0, "the same jab out of range misses");
  const s3 = match([id("pakyaw"), 1]); place(s3.p[0], 0, 1); place(s3.p[1], 40, -1);
  run(s3, 12, t => [t === 0 ? A : 0, SH]);
  ok(s3.p[1].dmg === 0 && s3.p[1].shield < 60, "a shield takes the hit instead of the fighter");
}

/* --- Lapu-Lapu: counter, and the kalasag ------------------------------- */
{
  const s = match([id("lapulapu"), id("rizal")]); place(s.p[0], 0, 1); place(s.p[1], 300, -1);
  /* Rizal throws Fili (his second book); Lapu-Lapu counters as it arrives */
  s.p[1].book = 1;
  run(s, 1, [0, S]);
  let ev = [];
  for (let t = 0; t < 60 && !ev.some(e => e.startsWith("counter")); t++) {
    const q = s.proj.find(z => z.kind === "fili");
    const near = q && Math.abs(q.x - s.p[0].x) < 110;
    ev.push(...G.bkStep(s, [near && s.p[0].st !== "move" ? S | D : 0, 0]));
  }
  ok(ev.some(e => e.startsWith("counter")) && s.p[0].dmg === 0, "Mactan Tide: a hit in the counter window does no damage");
  run(s, 6);
  ok(s.proj.some(q => q.kind === "tide" && q.owner === 0), "and answers with a wave");

  const s2 = match([id("lapulapu"), id("acela")]); place(s2.p[0], 0, 1); place(s2.p[1], 260, -1);
  const ev2 = run(s2, 60, t => [0, t === 0 ? S : 0]);
  ok(ev2.some(e => e.startsWith("clang")) && s2.p[0].dmg === 0, "the kalasag stops a serve that comes at his front");
  const s3 = match([id("lapulapu"), id("acela")]); place(s3.p[0], 0, -1); place(s3.p[1], 260, -1);
  run(s3, 60, t => [0, t === 0 ? S : 0]);
  ok(s3.p[0].dmg > 0, "but not one that comes at his back");
}

/* --- Rizal: books alternate -------------------------------------------- */
{
  const s = match([id("rizal"), 1]); place(s.p[0], 0, 1); place(s.p[1], 300, -1);
  const kinds = [];
  const see = () => { for (const q of s.proj) if (!kinds.includes(q.kind)) kinds.push(q.kind); };
  for (let t = 0; t < 70; t++) { G.bkStep(s, [t === 0 || t === 36 ? S : 0]); see(); }
  ok(kinds.includes("noli") && kinds.includes("fili"), "Noli then Fili: " + kinds.join(", "));
  const noli = G.BK_PROJ.noli, fili = G.BK_PROJ.fili;
  ok(noli.grav > 0 && noli.stun > 0 && fili.vx > noli.vx * 2 && !fili.grav, "Noli arcs and stuns, Fili flies fast and straight");
}

/* --- Aswang: stances, armour, the full moon ---------------------------- */
{
  const s = match([id("aswang"), 1]); place(s.p[0], 0, 1); place(s.p[1], 200, -1);
  const w0 = G.bkStats(s.p[0]).weight;
  run(s, 1, [S | D]); run(s, 24);
  ok(s.p[0].form === "beast" && G.bkStats(s.p[0]).weight > w0, "SHIFT turns the Aswang into the heavier beast");
  s.p[0].night = 100;
  run(s, 1, [S]); run(s, 30);
  ok(s.p[0].moon > 0 && s.p[0].night === 0, "a full night meter makes the neutral special the full moon");
  ok(G.bkStats(s.p[0]).walk === G.BK_ROSTER[id("aswang")].walk, "and under it the beast moves at human speed");
}

/* --- Manny Pakyaw: footwork, combos ---------------------------------------- */
{
  const s = match([id("pakyaw"), 1]); place(s.p[0], 0, 1); place(s.p[1], 300, -1);
  run(s, 1, [A]);
  let stepped = false;
  for (let t = 0; t < 14 && !stepped; t++) { G.bkStep(s, [t > 4 ? L : 0]); stepped = s.p[0].st === "step"; }
  ok(stepped, "a jab's recovery steps out with a direction");
  const t0 = match([id("pakyaw"), 1]); place(t0.p[0], 0, 1); place(t0.p[1], 40, -1); t0.p[0].combo = 0;
  const lone = G.bkKnock(80, 3, 86, 16, 26);
  ok(lone > 0 && G.BK_ROSTER[id("pakyaw")].N.jab.s <= 2, "the fastest jab in the cast (" + G.BK_ROSTER[id("pakyaw")].N.jab.s + " frames)");
  run(t0, 1, [A]);
  for (let t = 0; t < 30 && t0.p[0].st !== "idle"; t++) G.bkStep(t0, []);
  place(t0.p[1], 40, -1); t0.p[1].st = "idle";
  run(t0, 10, t => [t === 0 ? A : 0]);
  ok(t0.p[0].combo >= 2, "back-to-back hits build a combo (×" + t0.p[0].combo + ")");
}

/* --- Pepeng Bilyar: racked balls ricochet -------------------------------------- */
{
  const s = match([id("bilyar"), 1]); place(s.p[0], 0, 1); place(s.p[1], 290, -1);
  run(s, 1, [S | D]);
  let bounced = false;
  for (let t = 0; t < 120 && !bounced; t++) { const ev = G.bkStep(s, []); bounced = ev.some(e => e.startsWith("bank")); }
  ok(bounced, "a bank shot ricochets off the stage");
  const s2 = match([id("bilyar"), 1]); place(s2.p[0], 0, 1); place(s2.p[1], 300, -1);
  run(s2, 1, [S]); run(s2, 40);
  const ball = s2.proj.find(q => q.kind === "ball");
  ok(ball && !ball.shot, "neutral special racks a ball that sits on the stage");
  s2.p[0].x = ball.x - 50;
  const ev = run(s2, 30, t => [t === 0 ? R | A : 0]);
  ok(ev.some(e => e.startsWith("cue")) && ball.shot, "hitting the racked ball with the cue launches it");
}

/* --- Bruno Venus: on the beat ------------------------------------------------- */
{
  /* press the same side tilt at every frame of a beat; the ones whose first
     active frame lands on the pulse hit 40% harder */
  const res = [];
  for (let off = 0; off < G.BK_BEAT; off++) {
    const s = match([id("venus"), 1]); place(s.p[0], 0, 1); place(s.p[1], 50, -1);
    run(s, off);
    place(s.p[0], 0, 1); place(s.p[1], 50, -1);
    const ev = run(s, 20, t => [t === 0 ? R | A : 0]);
    res.push([s.p[1].dmg, ev.some(e => e.startsWith("beat"))]);
  }
  const on = res.filter(r => r[1]).map(r => r[0]), off = res.filter(r => !r[1]).map(r => r[0]);
  ok(on.length > 0 && off.length > 0, "some timings land on the beat and some do not (" + on.length + "/" + G.BK_BEAT + ")");
  ok(on.every(d => Math.abs(d - off[0] * 1.4) < 0.2), "on the beat hits 40% harder (" + on[0] + "% vs " + off[0] + "%)");
  ok(G.BK_PROJ.sound.pass, "sound waves pass through the stage and platforms");
}

/* --- Alex Ace-la: the strongest reflector -------------------------------------- */
{
  const s = match([id("acela"), id("rizal")]); place(s.p[0], 0, 1); place(s.p[1], 300, -1);
  s.p[1].book = 1;
  run(s, 1, [0, S]);
  let q = null;
  for (let t = 0; t < 60; t++) {
    q = s.proj.find(z => z.kind === "fili") || q;
    const near = q && Math.abs(q.x - s.p[0].x) < 70 && q.owner === 1;
    G.bkStep(s, [near && s.p[0].st !== "move" ? S | D : 0, 0]);
    if (q && q.owner === 0) break;
  }
  ok(q && q.owner === 0 && q.vx > 0, "Backhand Return sends a projectile back the other way");
  ok(q && Math.abs(q.vx) > G.BK_PROJ.fili.vx * 1.4 && q.d > G.BK_PROJ.fili.d * 1.4, "faster and harder (" + q.vx.toFixed(1) + " px/f, " + q.d + "%)");
  ok(G.BK_ROSTER[id("acela")].sp.d.reflect[2] > G.BK_ROSTER[id("acela")].sp.s.reflect[2], "and her down special is the stronger of her two reflectors");
}

/* --- Axie: parts are the moveset --------------------------------------- */
{
  const s = match([{ ch: G.BK_AXIE, parts: { horn: 0, mouth: 1, back: 0, tail: 0 } }, 1]);
  const a = s.p[0];
  ok(G.bkSpecial(a, "s").name === "RAM HORN" && G.bkSpecial(a, "n").name === "BIG ROAR", "the horn is the side special and the mouth the neutral");
  a.parts.horn = 1;
  ok(G.bkSpecial(a, "s").name === "SPIKE HORN", "swapping a part swaps the move");
}

/* --- ring-outs, stocks, results ---------------------------------------- */
{
  const s = match([0, 1], { stocks: 2 });
  place(s.p[0], 0, 1); s.p[1].x = 900; s.p[1].gr = -1; s.p[1].st = "air";
  const ev = run(s, 2);
  ok(ev.some(e => e.startsWith("ko:1")) && s.p[1].stocks === 1, "leaving the blast zone costs a stock");
  run(s, 80);
  ok(s.p[1].st === "spawn" && s.p[1].dmg === 0 && s.p[1].inv > 0, "and you come back on a halo, at 0%, intangible");
  s.p[1].st = "air"; s.p[1].x = -900;
  const ev2 = run(s, 3);
  ok(s.phase === "end" && s.winner === 0 && s.order.join() === "0,1" && ev2.includes("game"), "the last stock ends the match with a placing");
}

/* --- CPUs finish matches, every fighter, both stages -------------------- */
{
  let all = true, why = "";
  for (let st = 0; st < G.BK_STAGES.length; st++) {
    for (let c = 0; c < G.BK_ROSTER.length; c += 2) {
      const s = G.bkNewMatch([{ ch: c, cpu: 2 }, { ch: c + 1, cpu: 2 }, { ch: (c + 2) % 8, cpu: 1 }, { ch: (c + 5) % 8, cpu: 0 }], { stage: st, seed: c + 1 });
      for (let t = 0; t < 5 * 60 * 60 + 400 && s.phase !== "end"; t++) G.bkStep(s, []);
      const kos = s.p.reduce((n, p) => n + p.falls, 0);
      if (s.phase !== "end" || kos < 3) { all = false; why += ` stage ${st} from ${c}: ${s.phase}, ${kos} falls;`; }
    }
  }
  ok(all, "4-CPU matches on both stages end, with ring-outs" + why);
}

/* --- ledges ------------------------------------------------------------- */
{
  const S0 = G.BK_STAGES[0];
  const fall = () => {
    const s = match([0, 1]); place(s.p[1], 0, -1);
    const p = s.p[0]; p.x = S0.main.x1 + 16; p.y = -60; p.gr = -1; p.st = "air"; p.vy = 2;
    return s;
  };
  const s = fall(), p = s.p[0];
  const ev = run(s, 30);
  ok(p.st === "ledge" && p.inv > 0, "falling past the corner catches the ledge, briefly intangible");
  run(s, 10, t => [t === 0 ? L : 0]);
  run(s, 20);
  ok(p.gr === 0 && p.y === S0.main.y && p.x < S0.main.x1, "toward the stage climbs up onto it");
  const s2 = fall(); run(s2, 30); run(s2, 8); run(s2, 2, t => [t === 0 ? J : 0]);
  ok(s2.p[0].st === "air" && s2.p[0].vy < -8, "jump leaves the ledge upward");
  const s3 = fall(); run(s3, 30); run(s3, 8); run(s3, 2, t => [t === 0 ? D : 0]); run(s3, 20);
  ok(s3.p[0].st === "air" && s3.p[0].y > S0.main.y + 60, "down lets go");
  const s4 = fall(); run(s4, 30); run(s4, 8); run(s4, 30, t => [t === 0 ? A : 0]);
  ok(s4.p[0].mk === "N:down" || s4.p[0].dmg === 0 && s4.p[0].gr === 0, "attack climbs into a getup attack");
  /* one fighter per ledge */
  const s5 = match([0, 1, 2]); place(s5.p[2], -100, 1);
  for (const q of [s5.p[0], s5.p[1]]) { q.x = S0.main.x1 + 16; q.y = -60; q.gr = -1; q.st = "air"; q.vy = 2; }
  run(s5, 30);
  ok([s5.p[0], s5.p[1]].filter(q => q.st === "ledge").length === 1, "only one fighter can hang from a ledge");
  /* intangibility does not refresh without touching the stage */
  const s6 = fall(); run(s6, 30); run(s6, 8); run(s6, 2, t => [t === 0 ? D : 0]); s6.p[0].inv = 0; s6.p[0].ledgeCd = 0;
  s6.p[0].x = S0.main.x1 + 16; s6.p[0].y = -60; s6.p[0].vy = 2; run(s6, 40);
  ok(s6.p[0].st === "ledge" && s6.p[0].inv === 0, "a regrab without landing is not intangible again");
}

/* --- the tide ------------------------------------------------------------ */
{
  const at = (s, phase) => { while (G.bkTide(s).phase !== phase) G.bkStep(s, []); };
  const s = match([0, 1]);
  ok(G.bkTide(s) && G.bkTide(s).phase === "calm", "Mactan starts with a calm sea");
  let warned = false;
  while (G.bkTide(s).phase !== "surge") { s.p.forEach((p, i) => place(p, i ? 100 : -100, 1)); if (G.bkStep(s, []).some(e => e.startsWith("tidewarn"))) warned = true; }
  ok(warned, "the tide gives a warning before it comes in");
  const dir = G.bkTide(s).dir;
  place(s.p[0], 0, 1); const x0 = s.p[0].x;
  run(s, 60);
  ok(Math.sign(s.p[0].x - x0) === dir && Math.abs(s.p[0].x - x0) > 80, "the surge carries anyone on the beach (" + Math.round(s.p[0].x - x0) + " px in a second)");
  const pl = G.BK_STAGES[0].plats[1];
  s.p[1].x = pl.x; s.p[1].y = pl.y; s.p[1].gr = 2; s.p[1].st = "idle";
  const px = s.p[1].x; run(s, 30);
  ok(Math.abs(s.p[1].x - px) < 1, "a fighter up on a bangka is out of it");
  const s2 = match([0, 1], { hazards: false }); at2(s2);
  function at2(m) { for (let t = 0; t < 2000; t++) G.bkStep(m, []); }
  ok(G.bkTide(s2) === null, "hazards off: no tide");
  ok(G.bkTide(match([0, 1], { stage: 1 })) === null, "Lunacia Grove has no tide");
}

/* --- names ----------------------------------------------------------------- */
{
  const all = G.BK_ROSTER.map(c => c.name + " " + c.bio).join(" ");
  ok(!/PACQUIAO|EFREN|REYES|BRUNO MARS|EALA/i.test(all.replace(/ACE-LA/g, "")), "no living person's real name in the roster");
  ok(G.BK_ROSTER.filter(c => c.parody).length === 4, "the four modern icons are parodies: " + G.BK_ROSTER.filter(c => c.parody).map(c => c.name).join(", "));
  ok(G.bkName(G.BK_ROSTER[id("rizal")]) === "JOSÉ RIZAL", "historical figures keep their names");
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
