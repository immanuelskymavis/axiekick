/* AxieKick matchmaking on Cloudflare Workers.
 *
 * Same protocol as tools/signal.mjs, so the game needs no changes: point it at
 * the deployed URL with ?signal=wss://your-worker.workers.dev and it queues.
 *
 * Workers are the fit here because a matchmaker needs two things a static host
 * cannot do — hold a WebSocket open, and let two of them find each other. A
 * Durable Object is the one place both halves of a pair agree to meet.
 *
 * Deploy:
 *     npx wrangler login
 *     npx wrangler deploy --config deploy/wrangler.toml
 *
 * TURN, for players behind symmetric NAT, is set as secrets so the credentials
 * never reach the page:
 *     npx wrangler secret put TURN_URL   --config deploy/wrangler.toml
 *     npx wrangler secret put TURN_USER  --config deploy/wrangler.toml
 *     npx wrangler secret put TURN_PASS  --config deploy/wrangler.toml
 */

const STUN = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"];

function iceList(env) {
  const ice = [{ urls: STUN }];
  if (env.TURN_URL) {
    ice.push({
      urls: env.TURN_URL.split(",").map(s => s.trim()).filter(Boolean),
      username: env.TURN_USER || "",
      credential: env.TURN_PASS || ""
    });
  }
  return ice;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      const id = env.LOBBY.idFromName("global");
      return env.LOBBY.get(id).fetch(new Request("https://do/health"));
    }

    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response(
        "axiekick matchmaking — connect over websocket\n", { status: 200 });
    }

    const id = env.LOBBY.idFromName("global");
    return env.LOBBY.get(id).fetch(req, { headers: req.headers });
  }
};

export class Lobby {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.peers = new Map();      /* ws -> { id, mate, queued } */
    this.queue = [];
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, waiting: this.queue.length, peers: this.peers.size });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const me = { id: crypto.randomUUID().slice(0, 8), ws: server, mate: null, queued: false };
    this.peers.set(server, me);
    this.send(me, { t: "hello", id: me.id, ice: iceList(this.env), waiting: this.queue.length });

    server.addEventListener("message", e => {
      let m;
      try { m = JSON.parse(typeof e.data === "string" ? e.data : ""); } catch (err) { return; }
      this.handle(me, m);
    });
    const drop = () => this.gone(me);
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);

    return new Response(null, { status: 101, webSocket: client });
  }

  send(p, obj) {
    try { p.ws.send(JSON.stringify(obj)); } catch (e) { }
  }

  unqueue(p) {
    p.queued = false;
    this.queue = this.queue.filter(q => q !== p);
  }

  pair() {
    while (this.queue.length >= 2) {
      const a = this.queue.shift(), b = this.queue.shift();
      if (!this.peers.has(a.ws)) { if (this.peers.has(b.ws)) this.queue.unshift(b); continue; }
      if (!this.peers.has(b.ws)) { this.queue.unshift(a); continue; }
      a.queued = b.queued = false;
      a.mate = b; b.mate = a;
      const ice = iceList(this.env);
      /* whoever waited longest hosts, and the host is player 1 */
      this.send(a, { t: "match", role: "host", peer: b.id, ice });
      this.send(b, { t: "match", role: "guest", peer: a.id, ice });
    }
  }

  handle(p, m) {
    switch (m.t) {
      case "hello":
        this.send(p, { t: "hello", id: p.id, ice: iceList(this.env), waiting: this.queue.length });
        break;
      case "queue":
        if (p.mate) break;
        if (!p.queued) { p.queued = true; this.queue.push(p); }
        this.send(p, { t: "queued", ahead: Math.max(0, this.queue.indexOf(p)) });
        this.pair();
        break;
      case "cancel":
        this.unqueue(p);
        this.send(p, { t: "cancelled" });
        break;
      /* everything else belongs to the other half of the pair, verbatim */
      case "sdp":
      case "ice":
      case "bye":
        if (p.mate && this.peers.has(p.mate.ws)) this.send(p.mate, m);
        break;
    }
  }

  gone(p) {
    if (!this.peers.has(p.ws)) return;
    this.peers.delete(p.ws);
    this.unqueue(p);
    if (p.mate && this.peers.has(p.mate.ws)) {
      this.send(p.mate, { t: "peer-left" });
      p.mate.mate = null;
    }
    p.mate = null;
  }
}
