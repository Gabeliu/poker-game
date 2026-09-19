import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from "./src/lib/events";
import { registerRoomHandlers } from "./src/server/socket/handlers";
import { roomStore } from "./src/server/services/roomStore";

// Rooms live only in memory; drop ones nobody has been connected to for a
// long while so abandoned tables don't accumulate until the next restart.
const IDLE_ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const REAP_INTERVAL_MS = 10 * 60 * 1000;

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
// Bind all interfaces by default — required on most hosting platforms
// (Render, Railway, Fly, etc.), which route external traffic to 0.0.0.0.
// IMPORTANT: do NOT read process.env.HOSTNAME here. Linux containers
// (Render included) auto-populate HOSTNAME with the container's own
// internal name (e.g. "srv-xxxx-hibernate-yyyy") — it has nothing to do
// with which network interface to bind to, and binding to it makes the
// server unreachable from the platform's proxy (502 Bad Gateway). Use a
// distinct BIND_HOST var if you ever need to override the bind address.
const hostname = process.env.BIND_HOST || "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    path: "/socket.io",
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    registerRoomHandlers(io, socket);
  });

  setInterval(() => roomStore.reapIdleRooms(IDLE_ROOM_TTL_MS), REAP_INTERVAL_MS).unref();

  httpServer.listen(port, hostname, () => {
    console.log(`> Poker table ready on http://${hostname}:${port}`);
  });
});
