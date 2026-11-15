import { toast } from "sonner";

/** Copies the room's invite link, showing a toast either way. Shared by the
 * header's "Invite Friends" button and empty-seat "+ Invite" placeholders. */
export async function copyInviteLink(roomId: string): Promise<void> {
  const url = `${window.location.origin}/table/${roomId}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  } catch {
    toast.error("Couldn't copy link — copy it from the address bar instead.");
  }
}

/** Copies just the room code — what a friend types into "Join table" on the
 * home page. If the clipboard isn't available (it needs a secure context),
 * the toast still spells the code out so it can be read off the screen. */
export async function copyRoomCode(roomId: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(roomId);
    toast.success(`Room code ${roomId} copied`);
  } catch {
    toast(`Room code: ${roomId}`);
  }
}
