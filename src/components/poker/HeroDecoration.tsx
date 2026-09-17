"use client";

import { PlayingCard } from "./PlayingCard";
import { PokerChip } from "./PokerChip";
import { Deck } from "./Deck";

/** A still life built from the same physical objects as the live table. */
export function HeroDecoration() {
  return (
    <div className="hero-scene" aria-hidden="true">
      <div className="hero-table table-dome-rim">
        <div className="hero-felt table-dome-surface">
          <div className="hero-table-brand">&#9824; FELT <small>GOOD COMPANY. GREAT HANDS.</small></div>
          <div className="hero-hand">
            <PlayingCard card={{ rank: "A", suit: "spades" }} size="xl" rotationDeg={-14} />
            <PlayingCard card={{ rank: "A", suit: "hearts" }} size="xl" rotationDeg={7} />
          </div>
          <div className="hero-chips">
            {[25, 100, 1000].map((denomination, index) => (
              <div key={denomination} className="hero-chip-column" style={{ height: 40 + index * 9 }}>
                {Array.from({ length: 4 + index }).map((_, chip) => <PokerChip key={chip} size={46} denomination={denomination} style={{ position: "absolute", bottom: chip * 5 }} />)}
              </div>
            ))}
          </div>
          <span className="hero-dealer dealer-puck">D</span>
          <Deck handNumber={0} className="hero-deck" />
        </div>
      </div>
    </div>
  );
}
