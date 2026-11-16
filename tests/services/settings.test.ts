import { describe, expect, it } from "vitest";
import { createRoom, joinRoom, RoomServiceError, takeSeat, updateSettings } from "@/server/services/roomService";
import { requestBuyIn, resolveBuyInRequest } from "@/server/services/buyInService";
import { startHand } from "@/server/engine/handEngine";
import { Deck } from "@/server/engine/deck";

describe("blind settings are validated, not silently corrected", () => {
  it.each([
    { smallBlind: -5, bigBlind: 10 },
    { smallBlind: 5, bigBlind: -10 },
    { smallBlind: 0, bigBlind: 10 },
    { smallBlind: 2.5, bigBlind: 10 },
    { smallBlind: 50, bigBlind: 25 },
    { smallBlind: Number.NaN, bigBlind: 10 },
  ])("createRoom rejects %j", (settings) => {
    expect(() => createRoom("Host", settings)).toThrow(RoomServiceError);
  });

  it("createRoom accepts a valid pair and defaults when none is given", () => {
    expect(createRoom("Host", { smallBlind: 5, bigBlind: 10 }).room.settings).toMatchObject({ smallBlind: 5, bigBlind: 10 });
    expect(createRoom("Host", {}).room.settings).toMatchObject({ smallBlind: 25, bigBlind: 50 });
  });

  it("updateSettings rejects bad blinds and leaves the room's settings untouched", () => {
    const { room } = createRoom("Host", { smallBlind: 5, bigBlind: 10 });
    for (const bad of [{ smallBlind: -1 }, { bigBlind: 3 }, { smallBlind: 1.5 }]) {
      expect(() => updateSettings(room, bad)).toThrow(RoomServiceError);
    }
    expect(room.settings).toMatchObject({ smallBlind: 5, bigBlind: 10 });

    updateSettings(room, { smallBlind: 10, bigBlind: 20 });
    expect(room.settings).toMatchObject({ smallBlind: 10, bigBlind: 20 });
  });

  it("blinds can't change mid-hand, but other settings still can", () => {
    const { room, playerId: hostId } = createRoom("Host", { smallBlind: 5, bigBlind: 10 });
    const { playerId: guestId } = joinRoom(room.id, "Guest");
    takeSeat(room, guestId, 1);
    for (const id of [hostId, guestId]) {
      requestBuyIn(room, id, 1000, "initial");
      resolveBuyInRequest(room, room.buyInRequests.find((r) => r.playerId === id)!.id, true);
    }
    startHand(room, new Deck());
    expect(room.status).toBe("in-hand");

    expect(() => updateSettings(room, { smallBlind: 10, bigBlind: 20 })).toThrow(/between hands/);
    expect(room.settings).toMatchObject({ smallBlind: 5, bigBlind: 10 });

    // Re-saving the same blinds alongside another change is fine.
    updateSettings(room, { smallBlind: 5, bigBlind: 10, roomName: "Renamed" });
    expect(room.settings.roomName).toBe("Renamed");
  });
});

describe("the other table limits are validated too", () => {
  it("rejects a minimum buy-in above the maximum — nobody could ever buy in", () => {
    const { room } = createRoom("Host", {});
    expect(() => updateSettings(room, { minBuyIn: 5000, maxBuyIn: 100 })).toThrow(/Minimum buy-in/);
    expect(room.settings).toMatchObject({ minBuyIn: null, maxBuyIn: null });

    updateSettings(room, { minBuyIn: 100, maxBuyIn: 5000 });
    expect(room.settings).toMatchObject({ minBuyIn: 100, maxBuyIn: 5000 });
    // Raising only the minimum past the saved maximum is caught as well.
    expect(() => updateSettings(room, { minBuyIn: 6000 })).toThrow(/Minimum buy-in/);
    updateSettings(room, { minBuyIn: 5000 });
    updateSettings(room, { minBuyIn: null, maxBuyIn: null });
    expect(room.settings).toMatchObject({ minBuyIn: null, maxBuyIn: null });
  });

  it.each([0, 4, 301, Number.NaN, "" as unknown as number, null as unknown as number])(
    "rejects a turn time limit of %j instead of quietly turning it into 5 seconds",
    (turnTimeLimitSeconds) => {
      const { room } = createRoom("Host", {});
      expect(() => updateSettings(room, { turnTimeLimitSeconds })).toThrow(/Turn time limit/);
      expect(room.settings.turnTimeLimitSeconds).toBe(30);
    }
  );

  it("accepts a turn time limit inside the range", () => {
    const { room } = createRoom("Host", {});
    for (const seconds of [5, 45, 300]) {
      updateSettings(room, { turnTimeLimitSeconds: seconds });
      expect(room.settings.turnTimeLimitSeconds).toBe(seconds);
    }
  });
});
