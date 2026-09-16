#!/usr/bin/env node
/* AxieKick matchmaking + signalling.
 *
 * One file, no dependencies, same as the game. It does three things:
 *
 *   1. hands every client the ICE config, so TURN credentials live here
 *      rather than baked into a static page anyone can read;
 *   2. pairs whoever is waiting - first in the queue is the host, and the
 *      host is player 1;
 *   3. relays offer, answer and ICE candidates between that pair, then gets
 *      out of the way. Once the data channel opens the match is peer to peer
 *      and this process sees nothing of it.
 *
 * Run:
 *     PORT=8787 node tools/signal.mjs
 *
 * With a TURN relay (needed for players behind symmetric NAT, which is most
 * corporate networks):
 *     TURN_URL=turn:turn.example.com:3478 \
 *     TURN_USER=axiekick TURN_PASS=secret \
 *     PORT=8787 node tools/signal.mjs
 *
 * Behind nginx or a cloud load balancer, forward the Upgrade header and
 * terminate TLS there; the game will use wss:// whenever it is itself served
 * over https.
 */

import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MSG = 256 * 1024;          /* an SDP with candidates is a few KB */
const IDLE_MS = 90_000;

const ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
if (process.env.TURN_URL) {
  ICE.push({
    urls: process.env.TURN_URL.split(",").map(s => s.trim()).filter(Boolean),
    username: process.env.TURN_USER || "",
    credential: process.env.TURN_PASS || ""
  });
}

/* ---- the smallest WebSocket that does the job ------------------------- */

function accept(key) {
  return crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
}

/* Text frames only, unfragmented, unmasked (server to client). */
function frame(text) {
  const body = Buffer.from(text, "utf8");
  const n = body.length;
  let head;
  if (n < 126) {
    head = Buffer.from([0x81, n]);
  } else if (n < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81; head[1] = 126; head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, body]);
}

class Peer {
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.alive = true;
    this.mate = null;
    this.queued = false;
    this.id = crypto.randomBytes(4).toString("hex");
    this.touched = Date.now();
    sock.on("data", d => this.feed(d));
    /* a browser closing its tab half-closes the socket: FIN arrives as "end"
       and "close" never follows until we end our side too, so drop on either */
    sock.on("end", () => this.close());
    sock.on("close", () => this.gone());
    sock.on("error", () => this.gone());
  }

  send(obj) {
    if (!this.alive) return;
    try { this.sock.write(frame(JSON.stringify(obj))); } catch (e) { this.gone(); }
  }

  feed(chunk) {
    this.touched = Date.now();
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const msg = this.take();
      if (msg === null) return;
      if (msg === undefined) continue;          /* control frame, handled */
      let obj;
      try { obj = JSON.parse(msg); } catch (e) { continue; }
      handle(this, obj);
    }
  }

  /* null = need more bytes, undefined = consumed a non-text frame */
  take() {
    const b = this.buf;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f, at = 2;
    if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); at = 4; }
    else if (len === 127) {
      if (b.length < 10) return null;
      const big = b.readBigUInt64BE(2);
      if (big > BigInt(MAX_MSG)) { this.close(); return null; }
      len = Number(big); at = 10;
    }
    if (len > MAX_MSG) { this.close(); return null; }
    const need = at + (masked ? 4 : 0) + len;
    if (b.length < need) return null;

    let key = null;
    if (masked) { key = b.subarray(at, at + 4); at += 4; }
    const body = Buffer.from(b.subarray(at, at + len));
    if (key) for (let i = 0; i < body.length; i++) body[i] ^= key[i & 3];
    this.buf = b.subarray(need);

    if (op === 0x8) { this.close(); return null; }         /* close */
    if (op === 0x9) {                                      /* ping -> pong */
      try { this.sock.write(Buffer.from([0x8a, 0])); } catch (e) { }
      return undefined;
    }
    if (op === 0xa) return undefined;                      /* pong */
    if (op !== 0x1 || !fin) return undefined;              /* text, whole */
    return body.toString("utf8");
  }

  close() {
    if (!this.alive) return;
    try { this.sock.end(); } catch (e) { }
    this.gone();
  }

  gone() {
    if (!this.alive) return;
    this.alive = false;
    unqueue(this);
    if (this.mate && this.mate.alive) {
      this.mate.send({ t: "peer-left" });
      this.mate.mate = null;
    }
    this.mate = null;
    peers.delete(this);
  }
}

/* ---- matchmaking ------------------------------------------------------ */

const peers = new Set();
let queue = [];

function unqueue(p) {
  p.queued = false;
  queue = queue.filter(q => q !== p);
}

function pair() {
  while (queue.length >= 2) {
    const a = queue.shift(), b = queue.shift();
    if (!a.alive) { if (b.alive) queue.unshift(b); continue; }
    if (!b.alive) { queue.unshift(a); continue; }
    a.queued = b.queued = false;
    a.mate = b; b.mate = a;
    /* whoever waited longest hosts, and the host is player 1 */
    a.send({ t: "match", role: "host", peer: b.id, ice: ICE });
    b.send({ t: "match", role: "guest", peer: a.id, ice: ICE });
    log(`paired ${a.id} (host) with ${b.id} — ${queue.length} still waiting`);
  }
}

function handle(p, m) {
  switch (m.t) {
    case "hello":
      p.send({ t: "hello", id: p.id, ice: ICE, waiting: queue.length });
      break;
    case "queue":
      if (p.mate) break;
      if (!p.queued) { p.queued = true; queue.push(p); }
      p.send({ t: "queued", ahead: Math.max(0, queue.indexOf(p)) });
      pair();
      break;
    case "cancel":
      unqueue(p);
      p.send({ t: "cancelled" });
      break;
    /* everything else is for the other half of the pair, verbatim */
    case "sdp":
    case "ice":
    case "bye":
      if (p.mate && p.mate.alive) p.mate.send(m);
      break;
  }
}

function log(s) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${s}\n`);
}

/* ---- server ----------------------------------------------------------- */

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, waiting: queue.length, peers: peers.size }));
    return;
  }
  res.writeHead(404); res.end("axiekick signalling — connect over websocket\n");
});

server.on("upgrade", (req, sock) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) { sock.destroy(); return; }
  sock.setNoDelay(true);
  sock.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept(key) + "\r\n\r\n");
  const p = new Peer(sock);
  peers.add(p);
  p.send({ t: "hello", id: p.id, ice: ICE, waiting: queue.length });
});

setInterval(() => {
  const now = Date.now();
  for (const p of [...peers]) if (now - p.touched > IDLE_MS) p.close();
}, 15_000).unref();

server.listen(PORT, () => {
  log(`listening on :${PORT}`);
  log(`ice: ${ICE.map(s => [].concat(s.urls).join(" ")).join("  |  ")}`);
  if (!process.env.TURN_URL) {
    log("no TURN_URL set — peers behind symmetric NAT will fail to connect");
  }
});
