import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from "./src/lib/events";
import { registerRoomHandlers } from "./src/server/socket/handlers";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
// Bind all interfaces by default — required on most hosting platforms
// (Render, Railway, Fly, etc.), which route external traffic to 0.0.0.0.
// Only pin to localhost if explicitly asked to (e.g. local-only testing).
const hostname = process.env.HOSTNAME || "0.0.0.0";

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

  httpServer.listen(port, hostname, () => {
    console.log(`> Poker table ready on http://${hostname}:${port}`);
  });
});
