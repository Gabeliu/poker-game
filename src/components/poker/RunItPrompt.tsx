"use client";

import { Button } from "@/components/ui/button";
import { TurnTimer } from "./TurnTimer";
import type { PublicPlayer, RunItChoice, RunItDecision } from "@/lib/types";

interface RunItPromptProps {
  decision: RunItDecision;
  players: PublicPlayer[];
  myPlayerId: string | null;
  onChoose: (choice: RunItChoice) => Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Must match RUN_IT_DECISION_SECONDS in handEngine.ts — this is display
 * pacing only (the server is the sole authority on the actual deadline), so
 * a fixed duration keyed on `decision.deadline` (like every other TurnTimer
 * usage in this app) is enough; reading Date.now() during render to compute
 * an exact remaining count is neither necessary nor pure. */
const RUN_IT_DECISION_SECONDS = 10;

/** Shown to the two all-in players (and, read-only, everyone else) while a
 * run-it-once/twice decision is pending. Inserted above the normal
 * isMyTurn branch in ActionDock — an all-in player is never
 * `activePlayerId`, so without this they'd otherwise fall straight into
 * the generic "waiting for..." text instead of getting a say. */
export function RunItPrompt({ decision, players, myPlayerId, onChoose }: RunItPromptProps) {
  const nameFor = (id: string) => players.find((p) => p.id === id)?.displayName ?? "Player";
  const [firstId, secondId] = decision.eligiblePlayerIds;
  const amEligible = myPlayerId != null && decision.eligiblePlayerIds.includes(myPlayerId);
  const myChoice = myPlayerId ? decision.choices[myPlayerId] : undefined;
  const timer = (
    <TurnTimer
      key={decision.deadline}
      durationSeconds={RUN_IT_DECISION_SECONDS}
      variant="bar"
      className="w-full max-w-xs"
    />
  );

  if (!amEligible) {
    return (
      <div className="flex flex-col items-center gap-2 text-center" data-testid="runit-decision-pending">
        <p className="text-sm text-[var(--text-secondary)]">
          {nameFor(firstId)} and {nameFor(secondId)} are deciding whether to run it twice&hellip;
        </p>
        {timer}
      </div>
    );
  }

  if (myChoice) {
    const otherId = decision.eligiblePlayerIds.find((id) => id !== myPlayerId)!;
    return (
      <div className="flex flex-col items-center gap-2 text-center" data-testid="runit-decision-waiting">
        <p className="text-sm text-[var(--text-secondary)]">
          You chose to run it <span className="font-semibold text-[var(--text-primary)]">{myChoice}</span> —
          waiting on {nameFor(otherId)}&hellip;
        </p>
        {timer}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2.5" data-testid="runit-decision-prompt">
      <p className="text-sm font-semibold text-[var(--text-primary)]">Run it once, or run it twice?</p>
      {timer}
      <div className="flex gap-3">
        <Button
          size="lg"
          variant="outline"
          data-testid="runit-once"
          onClick={() => onChoose("once")}
          className="poker-action border-white/15 bg-white/[0.03] px-6 font-bold text-[var(--text-primary)] hover:bg-white/[0.08]"
        >
          Run it once
        </Button>
        <Button
          size="lg"
          data-testid="runit-twice"
          onClick={() => onChoose("twice")}
          className="poker-action px-6 font-bold bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90"
        >
          Run it twice
        </Button>
      </div>
    </div>
  );
}
