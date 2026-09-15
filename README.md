# Felt — multiplayer Texas Hold'em

A polished, real-time multiplayer Texas Hold'em poker web app. Create a private room, share a link,
and play with friends using virtual chips. No accounts, no real money — just a shareable room code
and a host who approves buy-ins.

Repo: [github.com/Gabeliu/poker-game](https://github.com/Gabeliu/poker-game)

## Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind CSS + shadcn/ui**
- **Socket.IO** over a custom Node HTTP server (`server.ts`) for real-time state sync
- **Zustand** for client-side room state (hydrated entirely from server broadcasts)
- **Vitest** for engine/service unit tests, **Playwright** for multi-browser end-to-end tests
- No database — rooms are ephemeral, in-memory, single-process (see [Architecture](#architecture))

## Getting started

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
    socket/       Socket.IO event handlers + broadcast/turn-timer wiring.
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
  betting, all-ins, side pots, split pots, dealer rotation, busting) — 41 cases.
- `tests/services/*` — room/buy-in lifecycle, reconnection, min/max buy-in limits, host removal
  rules — 8 cases.
- `e2e/poker.spec.ts` — real multi-browser-context Playwright flows: create → join → buy-in
  request/approve/reject/resubmit → play a full hand to showdown, reconnect-without-losing-seat,
  host remove/transfer, and a 7-player layout check (desktop + mobile viewports).

## Known limitations

- Single-process, in-memory state — restarting the server clears all rooms.
- No persistent accounts; identity is a per-room browser token, not a login.
- No chat.
