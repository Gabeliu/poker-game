import { describe, expect, it } from "vitest";
import { createRoom } from "@/server/services/roomService";
import { roomStore } from "@/server/services/roomStore";

const HOUR = 60 * 60 * 1000;

describe("idle room reaping", () => {
  it("deletes a room only after everyone has been gone longer than the TTL", () => {
    const { room } = createRoom("Host", {});
    roomStore.markEmpty(room.id, 0);

    expect(roomStore.reapIdleRooms(6 * HOUR, 5 * HOUR)).toEqual([]);
    expect(roomStore.has(room.id)).toBe(true);

    expect(roomStore.reapIdleRooms(6 * HOUR, 6 * HOUR)).toEqual([room.id]);
    expect(roomStore.has(room.id)).toBe(false);
  });

  it("keeps a room alive if anyone reconnects before the TTL", () => {
    const { room } = createRoom("Host", {});
    roomStore.markEmpty(room.id, 0);
    roomStore.markActive(room.id);

    expect(roomStore.reapIdleRooms(6 * HOUR, 100 * HOUR)).not.toContain(room.id);
    expect(roomStore.has(room.id)).toBe(true);
  });

  it("measures idleness from when the room first emptied, not the latest disconnect", () => {
    const { room } = createRoom("Host", {});
    roomStore.markEmpty(room.id, 0);
    roomStore.markEmpty(room.id, 5 * HOUR);

    expect(roomStore.reapIdleRooms(6 * HOUR, 6 * HOUR)).toContain(room.id);
  });
});
