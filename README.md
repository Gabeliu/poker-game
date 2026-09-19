# Felt — multiplayer Texas Hold'em

### 🃏 [**Play now → felt-poker-qxjk.onrender.com**](https://felt-poker-qxjk.onrender.com)

Just open the link, create a table, and share it with friends. No install, no account, no setup —
everything below is only for people who want to run or deploy their own copy.

A polished, real-time multiplayer Texas Hold'em poker web app. Create a private room, share a link,
and play with friends using virtual chips. No accounts, no real money — just a shareable room code
and a host who approves buy-ins.

Repo: [github.com/Gabeliu/poker-game](https://github.com/Gabeliu/poker-game)

> The live link runs on Render's free tier: it spins down after 15 minutes of no traffic (a
> ~30-60s cold start on the next visit), and since state is in-memory, rooms in progress are lost
> if it spins down mid-session. See [Deploying](#deploying) for details.

## Features

- Private tables (up to 8 seats) with a shareable link; the host approves buy-ins and can top up
  or rebuy mid-hand (extra chips are queued and applied automatically at the start of the next hand)
- No-limit hold'em with correct side pots, split pots, and odd-chip handling
- **Run it once / twice** when exactly two players are all-in: a 10-second decision (any "once",
  or no answer, means once), hole cards stay hidden until it's decided, then Run 1 is dealt and
  resolved completely before Run 2 is dealt at all
- Server-paced, staged all-in reveals (flop → turn → river) so everyone sees the same thing at the
  same time, including anyone who reconnects mid-reveal
- Net profit/loss shown for every player after each hand, with a per-run breakdown when a hand ran
  twice
- Survives backgrounded mobile tabs: the client resyncs on focus/visibility/reconnect using a
  state version so a stale snapshot can never overwrite a newer one
- Chat, per-player hand history, sounds, and host controls (kicks are only allowed between hands,
  with a confirmation step)

## Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind CSS + shadcn/ui**
- **Socket.IO** over a custom Node HTTP server (`server.ts`) for real-time state sync
- **Zustand** for client-side room state (hydrated entirely from server broadcasts)
- **Vitest** for engine/service unit tests, **Playwright** for multi-browser end-to-end tests
- No database — rooms are ephemeral, in-memory, single-process (see [Architecture](#architecture))

## Running it yourself (optional — most people should just play the live link above)

```bash
npm install
npm run dev      # custom server (Next.js + Socket.IO) at http://localhost:3000
```

Other scripts:

```bash
npm run build       # production build
npm run start        # run the production build
npm test             # unit tests (vitest)
npm run test:e2e      # end-to-end tests (playwright) — starts its own dev server
npm run lint          # eslint
```

**If you expose your local server publicly** (e.g. an ngrok/Cloudflare tunnel to show someone a
build before deploying), run it via `npm run build && npm run start`, not `npm run dev`. Dev mode's
hot-reload machinery expects to be reached at the same origin it was served from; behind a tunnel
domain its WebSocket handshake fails, the client bundle never finishes hydrating, and every button
silently does nothing (no console error beyond a failed HMR socket). The production build has none
of that and is what you want exposed either way.

## Deploying

The app needs a host that runs a persistent Node process with WebSocket support (not a
serverless/edge platform) — it's a stateful custom server, not a set of API routes. A
[`render.yaml`](./render.yaml) blueprint is included for [Render](https://render.com):

1. Sign up at [dashboard.render.com](https://dashboard.render.com) (free, no card required for
   the free web-service tier).
2. **New +** → **Blueprint** → connect this GitHub repo.
3. Render detects `render.yaml` and pre-fills the build command, start command, and Node
   version — click **Apply**.
4. Once the build finishes you get a public URL (e.g. `https://felt-poker.onrender.com`) that
   anyone can open to create or join a table.

The same build/start commands work on Railway, Fly.io, or a plain VPS if you'd rather use one of
those instead — the app just needs `npm install && npm run build` then `npm run start`, with a
`PORT` env var set by the platform.

Note: Render's free tier spins the service down after 15 minutes of no traffic (a ~30-60s cold
start on the next visit), and since state is in-memory, any rooms in progress are lost if it spins
down mid-session. The paid tier removes the spin-down; see
[Known limitations](#known-limitations) for the in-memory tradeoff in general.

## Architecture

```
src/
  lib/            Shared types and the client<->server socket event contract
  server/
    engine/       Pure poker logic: deck, hand evaluator, betting, side pots,
                   the hand state machine. No I/O, fully unit tested.
    services/     Room/player/buy-in orchestration on top of the engine;
                   owns the in-memory room store.
    socket/       Socket.IO event handlers + broadcast, turn-timer and all-in
                   reveal-timer wiring.
  hooks/          useRoomStore — the client's single source of truth, fed by
                   the "room:state" socket event (never computed locally).
  components/poker/  All table UI: seats, cards, betting controls, host panel.
  app/            Landing page and the /table/[roomId] page.
server.ts         Custom server: wraps Next.js' request handler with a
                   Socket.IO server on the same HTTP listener.
```

**Server-authoritative by design.** The client never decides who wins a hand, what a legal bet
is, or who the host is — it only renders whatever `room:state` the server last broadcast, and
every socket event handler re-validates the action against the room state before applying it.

**Why in-memory, no database.** Rooms are private, ephemeral home-game tables with virtual chips —
there's no requirement for state to survive a server restart or to scale beyond one process. This
keeps the whole thing dependency-free to run locally. The one deliberate seam for scaling out
later is `src/server/services/roomStore.ts`: everything that would need to move to a shared store
(e.g. Redis + the Socket.IO Redis adapter) is isolated there.

**Reconnection.** Each player gets a random token (stored in `localStorage`, per room) on
create/join. Refreshing the page re-sends that token; the server reattaches the new socket to the
existing seat instead of creating a duplicate player, and marks them `disconnected` (not removed)
if their socket drops without a reload — a turn timer auto-folds/checks for them if it's their
turn and they don't come back in time.

## Testing

- `tests/engine/*` — hand evaluator, side-pot math, and the full hand state machine (blinds,
  betting, all-ins, side pots, split pots, dealer rotation, busting, paced runouts, and
  run-it-once/twice including independent per-run evaluation).
- `tests/services/*` — room/buy-in lifecycle (including mid-hand rebuys), reconnection, min/max
  buy-in limits, host removal rules, idle-room reaping, and per-viewer hole-card visibility (a
  player sees their own cards, never an opponent's).
- `tests/lib/*` — the pure helpers behind the post-hand summary and result keys.
- `e2e/*.spec.ts` — real multi-browser-context Playwright flows: the full multiplayer lifecycle,
  net results, mid-hand rebuys, network-drop resync, host-leaving notification, run-it-twice
  (agree / disagree / timeout / sequential reveal), sound behavior, and layout checks at desktop
  and mobile sizes.

## Known limitations

- **Every room and invite link dies on restart.** State lives only in the running process's
  memory — no database. Redeploying (every `git push` to a connected host), the free-tier
  spin-down, or just restarting the process locally all wipe every room that existed before it.
  Any link copied before that moment will 404 with "Room not found" afterward; there's nothing
  wrong with the link itself, the room it pointed to is just gone. Create a fresh room (and
  re-share that new link) after any restart or deploy.
- Rooms that have had nobody connected for 6 hours are discarded to free memory.
- No persistent accounts; identity is a per-room browser token, not a login.
