import { cn } from "@/lib/utils";
import type { PlayerRunResult } from "@/lib/handResultSummary";

/**
 * A pair of small "R1" / "R2" tags shown right under a player's hole cards
 * once a run-it-twice hand reaches showdown — a glance at the felt shows
 * which run(s) they actually won, without repeating the full hand name that
 * belongs to the bottom result summary instead.
 *
 * Colouring reads `wonRun1`/`wonRun2` straight off the same `PlayerRunResult`
 * the summary panel is built from (see `summarizeHandResult`), so the two
 * can never disagree about who's highlighted for which run. Renders nothing
 * for a normal single-board hand — the seat's winner glow plus the summary
 * panel already cover that case without extra chrome at the table.
 */
export function RunResultTags({ result, isRunItTwice }: { result: PlayerRunResult | null; isRunItTwice: boolean }) {
  if (!isRunItTwice || !result) return null;
  return (
    <div className="run-tags" aria-hidden="true">
      <span className={cn("run-tag", result.wonRun1 && "run-tag-won")}>R1</span>
      <span className={cn("run-tag", result.wonRun2 && "run-tag-won")}>R2</span>
    </div>
  );
}
