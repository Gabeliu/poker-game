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
