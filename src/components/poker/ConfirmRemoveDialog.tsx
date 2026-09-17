"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmRemoveDialogProps {
  playerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/** A single "are you sure?" step before a host kicks someone — removing a
 * player is disruptive and not easily undone (they'd need a new invite link
 * to come back), so it shouldn't fire from one misplaced click. */
export function ConfirmRemoveDialog({ playerName, open, onOpenChange, onConfirm }: ConfirmRemoveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove {playerName}?</DialogTitle>
          <DialogDescription>
            They&rsquo;ll be removed from the table right away. They can rejoin with a new invite link.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            data-testid="confirm-remove-player"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
