# AxieKick — jam pitch

**Two buttons. One hit. First to five.**

Every fighting game is really one question asked over and over: *when do I commit?*
Divekick deletes everything else and asks only that. No walking, no blocking, no health
bar, no combos — you jump, you kick, and one of you is wrong.

We give that question to the three Axies everyone in this building already knows.

## The hook

Starter Axies are potatoes. No arms, no legs, nothing to animate. So we stopped trying to
make them fight like people and made the *body part* the weapon:

- **Olek** — Plant, the teacher. Leaf tail. A long, shallow arc that owns the whole stage
  from range and sails uselessly over anyone who gets underneath him.
- **Buba** — Beast, the hothead. Horn drill. Steepest, fastest dive in the game, smallest
  hitbox on it, and the longest apology if he misses.
- **Puffy** — Aqua, the cannonball. Inflate. Hold DIVE at the apex and she hangs there.
  She is the only player in the game who can edit the clock — and the biggest target while
  she does it.

Three Axies, three completely different questions to answer. You learn the game in ten
seconds and you are still losing to Puffy's float an hour later.

## Why it works for a jam

It is finishable. The whole design is one jump arc and one straight line, which means the
weekend goes into *feel* instead of systems. It is also instantly legible at a demo
station: two people, one keyboard, twenty-second rounds, and a queue that keeps moving
because a match is over in ninety seconds.

## Where it goes

The simulation is a pure function of `(state, p1 input, p2 input)` running at a fixed
60Hz with a 2-bit input log. That is not tidiness for its own sake — it is what made
online a transport problem rather than a rewrite. It already plays peer to peer over a
WebRTC data channel with no server anywhere: one of you hosts, the other joins, you
paste two codes at each other, and a state hash every 30 frames tells you if the two
simulations ever disagree. Rollback is the next step and needs nothing new from it.

**Play it:** open the URL, press a button, argue about whether that last one was a trade.
