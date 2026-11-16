# Felt — multiplayer Texas Hold'em

### 🃏 [**Play now → felt-poker-qxjk.onrender.com**](https://felt-poker-qxjk.onrender.com)

Just open the link, create a table, and share it with friends. No install, no account, no setup —
everything below is only for people who want to run or deploy their own copy.

A polished, real-time multiplayer Texas Hold'em poker web app. Create a private room, share a link,
and play with friends using virtual chips. No accounts, no real money — just a shareable room code
and a host who approves buy-ins.

Repo: [github.com/Gabeliu/poker-game](https://github.com/Gabeliu/poker-game)

> The live link runs on Render's free tier: it sleeps after 15 minutes with no table open (about a
> minute to wake on the next visit), and since state is in-memory, a restart closes any rooms in
> progress. See [Deploying](#deploying) for a free host that stays on.

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
- Switched browser or device mid-game? A player whose name is "taken" by their own old session can
  ask for the seat back; the host approves, or rejects with a reason the player is shown
- Survives backgrounded mobile tabs: the client resyncs on focus/visibility/reconnect using a
  state version so a stale snapshot can never overwrite a newer one
- Fits the window it's given: on a laptop-height screen, or when the action bar grows for the raise
  panel or a showdown summary, the whole table scales down as one piece instead of the seats
  piling onto each other
- Turn countdowns follow the server's clock, so they stay right after a reload, after a phone has
  been locked, and on a device whose own clock is wrong
- Keyboard shortcuts on your turn (F fold, C check/call, R raise) — bare keys only, so Ctrl+F or
  Ctrl+C never plays your hand for you
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

The app needs a host that runs **one** persistent Node process with WebSocket support (not a
serverless/edge platform) — it's a stateful custom server, not a set of API routes. Tables live in
that process's memory, so:

- run exactly one instance (a second one would split players at the same table across servers);
- any restart, including a deploy, closes every open table — don't deploy during a game.

### Northflank (free, stays on)

[Northflank](https://northflank.com)'s free Sandbox runs services continuously with no sleeping,
which is what a live table needs. The repo's [`Dockerfile`](./Dockerfile) is everything it needs:

1. Sign up at northflank.com and link your GitHub account.
2. Create a project, then **Create new → Service → Combined**.
3. Pick this repository and the `master` branch; under build options choose **Dockerfile**
   (path `/Dockerfile`, build context `/`).
4. Networking: port **3000**, protocol **HTTP**, **publicly exposed**.
5. Health check (optional, under Advanced): HTTP `GET /healthz` on port 3000.
6. Leave it at **1 instance** on the free compute plan and create the service.

It builds and gives you a public `https://….code.run` URL; every push to `master` redeploys.
The image was tested locally at that plan's size (0.2 vCPU / 512 MB): it starts in a few seconds
and uses about 120 MB with tables in play.

To try the image on your own machine: `docker build -t felt . && docker run -p 3000:3000 felt`.

### Render

A [`render.yaml`](./render.yaml) blueprint is included for [Render](https://render.com)
(**New + → Blueprint →** connect the repo **→ Apply**). Its free tier sleeps a service after 15
minutes without traffic and takes about a minute to wake, and sleeping wipes memory. To soften
that, while any table is open the server requests its own public URL every few minutes, so a
game survives a break where everyone's phone is locked; once the last table has been idle for six
hours it stops and the service is allowed to sleep. (On another host that sleeps, set
`KEEP_AWAKE_URL` to the site's address for the same behaviour.) The paid tier doesn't sleep.

### Anywhere else

Any host that builds a Dockerfile works (Railway, Fly.io, a VPS). Without Docker:
`npm ci && npm run build`, then `npm run start`, with `PORT` set by the platform.

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

**Reconnection.** Each player gets a random token (stored in `localStorage`, with a cookie copy
for browsers that refuse it, per room) on create/join. Refreshing the page re-sends that token; the server reattaches the new socket to the
existing seat instead of creating a duplicate player, and marks them `disconnected` (not removed)
if their socket drops without a reload — a turn timer auto-folds/checks for them if it's their
turn and they don't come back in time.

**Seat claims.** A token only lives in the browser that got it, so the same player arriving from a
different browser is a stranger whose own name is taken. They can open a seat claim by name; the
host answers it (any connected player can, if the claim is for the host's own seat and the host is
offline — otherwise a host who lost their browser could never return). Approval issues a fresh
token, retires the old ones, and signs the previous browser out; the seat itself is untouched.

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
  and mobile sizes — including a full eight-seat table on a laptop-sized window, where no seat
  may overlap another, the board, or the edge of the table area.

## Known limitations

- **Every room and invite link dies on restart.** State lives only in the running process's
  memory — no database. Redeploying (every `git push` to a connected host), the free-tier
  spin-down, or just restarting the process locally all wipe every room that existed before it.
  Any link copied before that moment will 404 with "Room not found" afterward; there's nothing
  wrong with the link itself, the room it pointed to is just gone. Create a fresh room (and
  re-share that new link) after any restart or deploy.
- Rooms that have had nobody connected for 6 hours are discarded to free memory.
- No persistent accounts; identity is a per-room browser token, not a login.
