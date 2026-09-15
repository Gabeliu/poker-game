"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spade, Link2, Users, Coins, PlayCircle } from "lucide-react";
import { useRoomStore } from "@/hooks/useRoomStore";
import { getStoredDisplayName, storeDisplayName } from "@/lib/socketClient";

export default function Home() {
  const router = useRouter();
  const initListeners = useRoomStore((s) => s.initListeners);
  const createRoom = useRoomStore((s) => s.createRoom);

  useEffect(() => {
    initListeners();
  }, [initListeners]);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState(() => getStoredDisplayName());
  const [roomName, setRoomName] = useState("Poker Night");
  const [smallBlind, setSmallBlind] = useState("25");
  const [bigBlind, setBigBlind] = useState("50");
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    storeDisplayName(name.trim());
    const res = await createRoom(name.trim(), {
      roomName: roomName.trim() || "Poker Night",
      smallBlind: Number(smallBlind) || 25,
      bigBlind: Number(bigBlind) || 50,
    });
    setCreating(false);
    if (res.ok && res.roomId) {
      router.push(`/table/${res.roomId}`);
    } else {
      toast.error(!res.ok ? res.error : "Couldn't create the room.");
    }
  };

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    router.push(`/table/${code}`);
  };

  return (
    <main className="ambient-page-bg relative flex min-h-screen flex-col overflow-hidden">

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <Spade className="h-6 w-6 text-[var(--accent-lime)]" fill="currentColor" />
          <span className="text-lg font-bold tracking-tight">Felt</span>
        </div>
      </header>

      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-20 text-center">
        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Play Texas Hold&rsquo;em with your friends,
          <span className="text-[var(--accent-lime)]"> anywhere.</span>
        </h1>
        <p className="mt-4 max-w-md text-balance text-muted-foreground">
          Create a private table, share one link, and deal in. Virtual chips, real friends, no
          app to install.
        </p>

        <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                size="lg"
                data-testid="create-table-trigger"
                className="flex-1 bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90 font-semibold shadow-lg"
              >
                Create Table
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Create a table</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 py-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="display-name">Your display name</Label>
                  <Input
                    id="display-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Gabriel"
                    maxLength={24}
                    autoFocus
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="room-name">Room name</Label>
                  <Input
                    id="room-name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Poker Night"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="sb">Small blind</Label>
                    <Input id="sb" type="number" value={smallBlind} onChange={(e) => setSmallBlind(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="bb">Big blind</Label>
                    <Input id="bb" type="number" value={bigBlind} onChange={(e) => setBigBlind(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  You can fine-tune buy-in limits and more from the table once it&rsquo;s created.
                </p>
              </div>
              <DialogFooter>
                <Button
                  className="w-full bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90 font-semibold"
                  disabled={!name.trim() || creating}
                  data-testid="create-table-submit"
                  onClick={handleCreate}
                >
                  {creating ? "Creating…" : "Create Table"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="flex flex-1 gap-2">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Room code"
              maxLength={8}
              className="text-center font-mono tracking-widest"
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            <Button
              size="lg"
              variant="outline"
              className="border-white/15"
              data-testid="landing-join-submit"
              onClick={handleJoin}
              disabled={!joinCode.trim()}
            >
              Join
            </Button>
          </div>
        </div>

        <ol className="mt-14 flex w-full max-w-3xl flex-col gap-4 text-left sm:flex-row sm:justify-between sm:text-center">
          <Step icon={<PlayCircle className="h-5 w-5" />} step="1" label="Create a room" />
          <Step icon={<Link2 className="h-5 w-5" />} step="2" label="Share the link" />
          <Step icon={<Users className="h-5 w-5" />} step="3" label="Friends join" />
          <Step icon={<Coins className="h-5 w-5" />} step="4" label="Host approves buy-in" />
          <Step icon={<Spade className="h-5 w-5" />} step="5" label="Play poker" />
        </ol>
      </section>
    </main>
  );
}

function Step({ icon, step, label }: { icon: React.ReactNode; step: string; label: string }) {
  return (
    <li className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--accent-lime)]/30 bg-card text-[var(--accent-lime)]">
        {icon}
      </span>
      <span className="text-sm text-muted-foreground">
        <span className="mr-1 font-semibold text-foreground">{step}.</span>
        {label}
      </span>
    </li>
  );
}
