import { customAlphabet } from "nanoid";

// Unambiguous uppercase alphabet: no 0/O, 1/I, etc. — easy to read aloud/type.
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const generateRoomId = customAlphabet(ROOM_CODE_ALPHABET, 6);
export const generatePlayerId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 16);
export const generatePlayerToken = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  32
);
export const generateRequestId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 16);
