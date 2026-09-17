import { useState } from "react";
import type { PublicPlayer } from "@/lib/types";

interface Snapshot {
  handStatus: PublicPlayer["handStatus"];
  currentBet: number;
  hasActedThisStreet: boolean;
  connectionStatus: PublicPlayer["connectionStatus"];
}

interface LabelEntry {
  label: string;
  /** Derived from the transition itself (not a counter) so remounting the
   * fade animation never needs a side-effecting global. */
  key: string;
}

function snapshotOf(players: PublicPlayer[]): Map<string, Snapshot> {
  const map = new Map<string, Snapshot>();
  for (const p of players) {
    map.set(p.id, {
      handStatus: p.handStatus,
      currentBet: p.currentBet,
      hasActedThisStreet: p.hasActedThisStreet,
      connectionStatus: p.connectionStatus,
    });
  }
  return map;
}

/**
 * Infers a transient "Called" / "Checked" / "Raised" / "Folded" / "All In" /
 * "Disconnected" label per player by diffing consecutive server broadcasts —
 * purely a presentation nicety layered on top of the authoritative state,
 * not new game logic. Uses React's "adjust state while rendering" pattern
 * (comparing props against state holding the previous snapshot) instead of
 * an effect, since this only needs to run when the diff actually changes.
 */
export function usePlayerStatusLabels(
  players: PublicPlayer[],
  lastAggressorId: string | null,
  resetKey?: string | number
): Record<string, LabelEntry> {
  const [prevSnapshot, setPrevSnapshot] = useState<Map<string, Snapshot>>(() => snapshotOf(players));
  const [labels, setLabels] = useState<Record<string, LabelEntry>>({});
  const [prevResetKey, setPrevResetKey] = useState(resetKey);

  // A resync (or a new hand) can jump the snapshot across an arbitrary gap —
  // diffing against whatever was seen before the gap can produce a stale or
  // misleading label (e.g. "Folded" resurfacing for a fold that happened
  // minutes ago). Reseed silently instead of diffing across the gap.
  if (resetKey !== prevResetKey) {
    const resyncedSnapshot = snapshotOf(players);
    setPrevResetKey(resetKey);
    setPrevSnapshot(resyncedSnapshot);
    setLabels({});
    return {};
  }

  const nextSnapshot = snapshotOf(players);
  let snapshotChanged = nextSnapshot.size !== prevSnapshot.size;
  const nextLabels = { ...labels };
  let labelsChanged = false;

  for (const p of players) {
    const prev = prevSnapshot.get(p.id);
    const cur = nextSnapshot.get(p.id)!;
    if (!prev) continue;
    if (
      prev.handStatus !== cur.handStatus ||
      prev.currentBet !== cur.currentBet ||
      prev.hasActedThisStreet !== cur.hasActedThisStreet ||
      prev.connectionStatus !== cur.connectionStatus
    ) {
      snapshotChanged = true;
    }

    let label: string | null = null;
    if (cur.handStatus === "folded" && prev.handStatus !== "folded") {
      label = "Folded";
    } else if (cur.handStatus === "all-in" && prev.handStatus !== "all-in") {
      label = "All In";
    } else if (cur.connectionStatus === "disconnected" && prev.connectionStatus !== "disconnected") {
      label = "Disconnected";
    } else if (cur.hasActedThisStreet && !prev.hasActedThisStreet) {
      if (cur.currentBet === prev.currentBet) label = "Checked";
      else if (p.id === lastAggressorId) label = "Raised";
      else label = "Called";
    }

    if (label) {
      nextLabels[p.id] = {
        label,
        key: `${p.id}:${label}:${cur.handStatus}:${cur.currentBet}:${cur.connectionStatus}`,
      };
      labelsChanged = true;
    }
  }

  if (snapshotChanged) {
    setPrevSnapshot(nextSnapshot);
    if (labelsChanged) setLabels(nextLabels);
  }

  return labels;
}
