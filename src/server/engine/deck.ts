import type { Card, Rank, Suit } from "@/lib/types";

const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export function createOrderedDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Fisher-Yates shuffle using a cryptographically strong RNG so hands can't
 * be predicted by observing Math.random()'s weaker PRNG state.
 */
export function shuffleDeck(deck: Card[], rng: () => number = secureRandom): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function secureRandom(): number {
  // Node's webcrypto is available globally in modern Node runtimes.
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x100000000;
}

export class Deck {
  private cards: Card[];

  constructor() {
    this.cards = shuffleDeck(createOrderedDeck());
  }

  /** Test/deterministic helper: cards will be drawn in exactly this order. */
  static fromOrderedDraws(cardsInDrawOrder: Card[]): Deck {
    const deck = Object.create(Deck.prototype) as Deck;
    deck.cards = [...cardsInDrawOrder].reverse();
    return deck;
  }

  draw(): Card {
    const card = this.cards.pop();
    if (!card) throw new Error("Deck is empty");
    return card;
  }

  drawMany(count: number): Card[] {
    return Array.from({ length: count }, () => this.draw());
  }

  remaining(): number {
    return this.cards.length;
  }
}
