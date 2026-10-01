# Deploying the matchmaker

The game itself is static and already lives on GitHub Pages. Two things it cannot do
from there, because a static host cannot hold a socket open or relay UDP:

1. **Matchmaking** — a queue two strangers can meet in.
2. **TURN** — a relay for players whose NAT will not let them talk directly.

Both need an account somewhere. Nothing below costs money at this scale, but somebody
with the Cloudflare login has to run it; there is no credential-free path.

## What works without any of this

Peer to peer over **Google STUN**, which needs no account and is already in the build.
Verified from this repo: `host` and `srflx` candidates gather fine. In practice that
connects most home networks to each other.

So today, with nothing deployed, two friends can play by opening
<https://immanuelskymavis.github.io/axiekick/> and using **PLAY ONLINE → PLAY A FRIEND**,
which trades two codes over Slack. What they cannot do is find a *stranger*, and what
may fail is symmetric NAT — office networks, some mobile carriers, a few ISP CGNATs.

## Matchmaking, on Cloudflare Workers

`worker.js` is the same protocol as `tools/signal.mjs`, on Durable Objects so both halves
of a pair have one place to meet. Free tier covers this comfortably.

```bash
cd deploy
npx wrangler@3 login                 # opens a browser once
npx wrangler@3 deploy
```

Wrangler 4 wants Node 22; this machine has 20, hence the `@3` pin. Either works.

It prints a URL like `https://axiekick-matchmaker.<account>.workers.dev`. Point the game
at it by opening:

```
https://immanuelskymavis.github.io/axiekick/?signal=wss://axiekick-matchmaker.<account>.workers.dev
```

`wss://`, not `ws://` — Pages is HTTPS and browsers block mixed content.

To make that the default so nobody needs the query string, set `SIGNAL_URL` in
`game/index.html` and republish:

```js
const SIGNAL_URL = "wss://axiekick-matchmaker.<account>.workers.dev";
```

Check it is alive with `curl https://<your-worker>/health`.

## TURN, for the networks STUN cannot fix

Without a relay, two players behind symmetric NAT will queue, pair, negotiate, and then
fail to connect. The game says so rather than hanging.

Every TURN provider needs an account, because TURN relays real bandwidth and nobody
gives that away anonymously. Two that were checked and do **not** work: the old
`openrelay.metered.ca` free endpoints are dead, and there is no working public demo
credential on ExpressTurn. Pick one of:

- **Cloudflare Realtime TURN** — same account as the Worker, free allowance, simplest if
  you are already deploying above.
- **Metered**, **Twilio NTS**, **Xirsys** — all have small free tiers.
- **Self-hosted coturn** on any VPS, if you would rather own it.

The credentials go in as Worker secrets, so they are handed to clients at connect time
and never sit in the published page:

```bash
cd deploy
npx wrangler@3 secret put TURN_URL     # e.g. turn:turn.example.com:3478
npx wrangler@3 secret put TURN_USER
npx wrangler@3 secret put TURN_PASS
```

Nothing in the game needs rebuilding — the ICE list arrives over the socket.

## Running it locally instead

`tools/signal.mjs` is the same thing with no Cloudflare in the way:

```bash
PORT=8787 node tools/signal.mjs
# then open the game with ?signal=ws://localhost:8787
```

With TURN:

```bash
TURN_URL=turn:turn.example.com:3478 TURN_USER=axiekick TURN_PASS=secret \
  PORT=8787 node tools/signal.mjs
```
