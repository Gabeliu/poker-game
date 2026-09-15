export type SoundEventName =
  | "card-deal"
  | "card-flip"
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "all-in"
  | "pot-collect"
  | "pot-win"
  | "your-turn"
  | "timer-low"
  | "player-join"
  | "player-leave"
  | "buyin-request"
  | "buyin-approved"
  | "buyin-rejected"
  | "chat-message"
  | "ui-click"
  | "hand-start"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "winner";

export type SoundBus = "game" | "notify";

export interface PlayOptions {
  /** Stereo pan from -1 (left) to 1 (right); omitted/0 = centered. */
  pan?: number;
  /** Extra gain multiplier applied on top of the bus/master volume, for sounds that should sit quieter or louder than their siblings. */
  gain?: number;
  /** Delay in seconds before this instance starts, for sequencing multiple plays against one animation. */
  delaySeconds?: number;
}

export interface AudioSettings {
  enabled: boolean;
  masterVolume: number;
  gameVolume: number;
  notifyVolume: number;
}
