/**
 * Shared domain types used by both the server (authoritative game state)
 * and the client (rendering + optimistic UI only). The client NEVER
 * computes game outcomes itself — it only renders whatever the server
 * broadcasts via socket events.
 */

// ---------- Primitives ----------

export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "A";

export interface Card {
  rank: Rank;
  suit: Suit;
}

// ---------- Player ----------

export type PlayerConnectionStatus = "connected" | "disconnected";

/** A player's status within the current hand's betting flow. */
export type PlayerHandStatus =
  | "waiting"     // not dealt in (joined mid-hand, or sitting out)
  | "active"      // still in the hand, can act
  | "folded"
  | "all-in"
  | "sitting-out";

export interface Player {
  id: string;
  displayName: string;
  isHost: boolean;
  connectionStatus: PlayerConnectionStatus;
  /** Approved chip stack, server authoritative. */
  chips: number;
  /** Seat index around the table, stable once assigned. */
  seat: number;
  /** True once the player has at least one approved buy-in and can be dealt in. */
  hasBoughtIn: boolean;
  /** Sitting out voluntarily (won't be dealt into next hand). */
  sittingOut: boolean;
  handStatus: PlayerHandStatus;
  /** Chips committed in the current betting round (street). */
  currentBet: number;
  /** Chips committed across the whole hand (all streets), for side-pot math. */
  totalCommittedThisHand: number;
  hasActedThisStreet: boolean;
  /** Only ever sent to the owning client; other clients get [] or hidden. */
  holeCards: Card[];
  /** Revealed at showdown for all remaining players. */
  holeCardsRevealed: boolean;
  /** This player's own recent hands (their own cards only) — private, like holeCards. */
  handHistory: HandHistoryEntry[];
}

/** Public-safe player view sent to clients who are not this player. */
export type PublicPlayer = Omit<Player, "holeCards" | "handHistory"> & {
  holeCards: Card[]; // empty unless holeCardsRevealed, or length-known placeholders
  hasHoleCards: boolean;
};

// ---------- Buy-ins & ledger ----------

export type BuyInRequestStatus = "pending" | "approved" | "rejected";
export type BuyInRequestType = "initial" | "topup";

export interface BuyInRequest {
  id: string;
  playerId: string;
  playerDisplayName: string;
  amount: number;
  type: BuyInRequestType;
  status: BuyInRequestStatus;
  createdAt: number;
  resolvedAt?: number;
}

export type LedgerEntryType =
  | "initial-buy-in"
  | "additional-buy-in"
  | "hand-win"
  | "hand-loss"
  | "host-adjustment";

export interface LedgerEntry {
  id: string;
  playerId: string;
  type: LedgerEntryType;
  amount: number; // signed delta
  balanceAfter: number;
  createdAt: number;
  note?: string;
}

// ---------- Chat / table activity ----------

export type ChatMessageType = "chat" | "system";

export interface ChatMessage {
  id: string;
  type: ChatMessageType;
  /** Only present for type "chat". */
  playerId?: string;
  playerName?: string;
  text: string;
  createdAt: number;
}

// ---------- Hand history ----------

/** One completed hand from a single player's own point of view — their own
 * hole cards (never anyone else's) plus how their stack changed. Privacy
 * mirrors hole cards: only ever sent to the player it belongs to. */
export interface HandHistoryEntry {
  handNumber: number;
  holeCards: Card[];
  /** Positive = won chips net, negative = lost, 0 = broke even (rare, e.g. no action taken). */
  netChange: number;
  /** True if this player reached showdown/won without folding; false if they folded. */
  wasInHand: boolean;
  createdAt: number;
}

// ---------- Room settings ----------

export interface RoomSettings {
  roomName: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number | null;
  maxBuyIn: number | null;
  allowAdditionalBuyIns: boolean;
  allowJoinDuringHand: boolean;
  turnTimeLimitSeconds: number;
}

// ---------- Hand / betting state machine ----------

export type HandPhase =
  | "waiting"     // lobby, no hand in progress
  | "starting"    // dealer/blinds being assigned
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "hand-complete";

export interface SidePot {
  id: string;
  amount: number;
  eligiblePlayerIds: string[];
}

export interface PotWinner {
  playerId: string;
  potId: string;
  amount: number;
  handDescription: string;
}

export interface HandResult {
  winners: PotWinner[];
  revealedHands: Record<string, { cards: Card[]; description: string; rank: number }>;
}

export interface HandState {
  phase: HandPhase;
  handNumber: number;
  dealerSeat: number;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  communityCards: Card[];
  pots: SidePot[];
  currentBetAmount: number;
  minRaiseAmount: number;
  activePlayerId: string | null;
  turnDeadline: number | null; // epoch ms
  lastAggressorId: string | null;
  result: HandResult | null;
}

// ---------- Room ----------

export type RoomStatus = "lobby" | "in-hand";

export interface RoomState {
  id: string;
  createdAt: number;
  hostPlayerId: string;
  settings: RoomSettings;
  status: RoomStatus;
  players: Player[];
  buyInRequests: BuyInRequest[];
  ledger: LedgerEntry[];
  hand: HandState;
  chatMessages: ChatMessage[];
}

/** What's broadcast to a specific client: hole cards hidden for others. */
export interface ClientRoomView extends Omit<RoomState, "players"> {
  players: PublicPlayer[];
  /** The requesting client's own player id, and their own private info. */
  you: {
    playerId: string | null;
    holeCards: Card[];
    handHistory: HandHistoryEntry[];
  };
}

// ---------- Player actions ----------

export type PokerAction = "check" | "call" | "bet" | "raise" | "fold" | "all-in";

export interface ActionRequest {
  action: PokerAction;
  amount?: number; // for bet/raise: the total amount being raised TO
}
