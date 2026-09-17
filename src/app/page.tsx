"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
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
import { Spade, Link2, Users, Coins, PlayCircle, ArrowRight, X } from "lucide-react";
import { useRoomStore } from "@/hooks/useRoomStore";
import { getStoredDisplayName, storeDisplayName } from "@/lib/socketClient";
import { HeroDecoration } from "@/components/poker/HeroDecoration";
import { LoadingExperience } from "@/components/poker/LoadingExperience";

export default function Home() {
  const router = useRouter();
  const initListeners = useRoomStore((s) => s.initListeners);
  const createRoom = useRoomStore((s) => s.createRoom);

  useEffect(() => {
    initListeners();
  }, [initListeners]);

  const [createOpen, setCreateOpen] = useState(false);
  // Seeded empty, not read from localStorage, so the client's first render
  // can't diverge from the server-rendered HTML (see the table page for the
  // hydration bug this pattern caused there). Hydrated client-side below.
  const [name, setName] = useState("");
  useEffect(() => {
    const stored = getStoredDisplayName();
    if (stored) setTimeout(() => setName(stored), 0);
  }, []);
  const [roomName, setRoomName] = useState("Poker Night");
  const [smallBlind, setSmallBlind] = useState("25");
  const [bigBlind, setBigBlind] = useState("50");
  const [creating, setCreating] = useState(false);

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [loadingText, setLoadingText] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setLoadingText("Creating your table…");
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
      setLoadingText(null);
      toast.error(!res.ok ? res.error : "Couldn't create the room.");
    }
  };

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setLoadingText("Joining table…");
    router.push(`/table/${code}`);
  };

  return (
    <main className="landing-page ambient-page-bg relative flex min-h-screen flex-col overflow-hidden">
      <LoadingExperience show={loadingText !== null} text={loadingText ?? ""} />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <Spade className="h-6 w-6 text-[var(--accent-lime)]" fill="currentColor" />
          <span className="text-lg font-bold tracking-tight">Felt</span>
        </div>
        <span className="landing-header-note"><span /> Private tables. Real friends.</span>
      </header>

      <section className="landing-hero relative flex flex-1 flex-col items-center px-4 text-center">

        <div className="hero-copy relative z-10 flex flex-col items-center justify-center">
          <p className="hero-eyebrow">THE BEST SEAT IS WITH YOUR FRIENDS</p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Play Texas Hold&rsquo;em with your friends,
            <span className="text-[var(--accent-lime)]"> anywhere.</span>
          </h1>
          <p className="mt-4 max-w-md text-balance text-muted-foreground">
            Create a private table, share one link, and deal in. Virtual chips, real friends, no
            app to install.
          </p>

          <motion.div layout className="mt-8 flex w-full max-w-md flex-col items-stretch gap-3">
            <motion.div layout className="flex w-full gap-3">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="lg"
                    data-testid="create-table-trigger"
                    className="h-14 flex-1 bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90 text-base font-bold tracking-wide shadow-[0_10px_30px_-8px_var(--accent-lime)]"
                    onClick={() => setJoinOpen(false)}
                  >
                    CREATE TABLE
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

              <Button
                size="lg"
                variant="outline"
                data-testid="join-table-trigger"
                className="h-14 flex-1 border-white/15 bg-white/[0.03] text-base font-bold tracking-wide text-[var(--text-primary)] hover:bg-white/[0.08]"
                onClick={() => setJoinOpen((v) => !v)}
              >
                {joinOpen ? "CANCEL" : "JOIN TABLE"}
              </Button>
            </motion.div>

            <AnimatePresence initial={false}>
              {joinOpen && (
                <motion.div
                  key="join-panel"
                  initial={{ opacity: 0, height: 0, y: -6 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="flex gap-2 pt-1">
                    <Input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="Enter room code"
                      maxLength={8}
                      autoFocus
                      className="h-12 flex-1 text-center font-mono text-base tracking-[0.3em]"
                      onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                    />
                    <Button
                      size="lg"
                      data-testid="landing-join-submit"
                      className="h-12 shrink-0 bg-[var(--accent-lime)] px-4 text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90 font-semibold"
                      onClick={handleJoin}
                      disabled={!joinCode.trim()}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <button
                      onClick={() => {
                        setJoinOpen(false);
                        setJoinCode("");
                      }}
                      className="flex h-12 w-10 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-white/8 hover:text-[var(--text-primary)]"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <ol className="landing-steps mt-8 flex w-full max-w-3xl list-none flex-wrap justify-center gap-4 text-left sm:text-center">
            <Step icon={<PlayCircle className="h-5 w-5" />} label="Create a room" />
            <Step icon={<Link2 className="h-5 w-5" />} label="Share the link" />
            <Step icon={<Users className="h-5 w-5" />} label="Friends join" />
            <Step icon={<Coins className="h-5 w-5" />} label="Host approves buy-in" />
            <Step icon={<Spade className="h-5 w-5" />} label="Play poker" />
          </ol>
        </div>
        <HeroDecoration />
      </section>
      <footer className="landing-footer"><span>YOUR TABLE. YOUR PEOPLE. YOUR GAME.</span><span>Virtual chips · No real-money wagering</span></footer>
    </main>
  );
}

function Step({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--accent-lime)]/30 bg-card text-[var(--accent-lime)]">
        {icon}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </li>
  );
}
