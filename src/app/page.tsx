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
import {
  Spade,
  Link2,
  Users,
  Coins,
  PlayCircle,
  ArrowRight,
  X,
  Timer,
  History,
  MessageSquare,
} from "lucide-react";
import { useRoomStore } from "@/hooks/useRoomStore";
import { getStoredDisplayName, storeDisplayName } from "@/lib/socketClient";
import { HeroStage } from "@/components/poker/hero/HeroStage";
import "./landing-hero.css";
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
    const parsedSmallBlind = Number(smallBlind);
    const parsedBigBlind = Number(bigBlind);
    const res = await createRoom(name.trim(), {
      roomName: roomName.trim() || "Poker Night",
      smallBlind: Number.isFinite(parsedSmallBlind) && parsedSmallBlind > 0 ? parsedSmallBlind : 25,
      bigBlind: Number.isFinite(parsedBigBlind) && parsedBigBlind > 0 ? parsedBigBlind : 50,
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
        <nav className="landing-nav">
          <a href="#how">How it works</a>
          <a href="#features">What&rsquo;s included</a>
        </nav>
        <span className="landing-header-note"><span /> Private tables. Real friends.</span>
      </header>

      <section className="landing-hero">
        <HeroStage />
        <div className="hero-copy">
          <span className="hero-eyebrow">Poker anywhere.</span>
          <h1>
            <span className="hl hl-1">Poker night,</span>
            <span className="hl hl-2">without the</span>
            <span className="hl hl-3">kitchen table.</span>
          </h1>
          <p>
            Set the blinds, send one link, and deal real No-Limit Hold&rsquo;em with the people
            you&rsquo;d actually invite over. Virtual chips, real bragging rights.
          </p>

          <motion.div layout className="hero-actions">
            <motion.div layout className="flex w-full gap-3">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="lg"
                    data-testid="create-table-trigger"
                    className="hero-cta"
                    onClick={() => setJoinOpen(false)}
                  >
                    Create table
                    <ArrowRight className="hero-cta-arrow h-5 w-5" />
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
                        <Input id="sb" type="number" min={1} value={smallBlind} onChange={(e) => setSmallBlind(e.target.value)} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="bb">Big blind</Label>
                        <Input id="bb" type="number" min={1} value={bigBlind} onChange={(e) => setBigBlind(e.target.value)} />
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
                className="hero-cta-secondary"
                onClick={() => setJoinOpen((v) => !v)}
              >
                {joinOpen ? "Cancel" : "Join table"}
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

          <p className="hero-fineprint">No installs. No accounts. Nothing here is real money.</p>
        </div>

      </section>

      <section id="how" className="how-section">
        <h2>How a table comes together</h2>
        <ol className="how-steps">
          <HowStep
            n={1}
            icon={<PlayCircle className="h-5 w-5" />}
            title="Create a table"
            body="Name the room, set the blinds, and it's ready."
          />
          <HowStep
            n={2}
            icon={<Link2 className="h-5 w-5" />}
            title="Share the link"
            body="One link, sent however you'd normally text your group."
          />
          <HowStep
            n={3}
            icon={<Users className="h-5 w-5" />}
            title="Friends take a seat"
            body="Up to eight players, each picking their own spot."
          />
          <HowStep
            n={4}
            icon={<Coins className="h-5 w-5" />}
            title="You approve the buy-ins"
            body="Nobody's chips hit the table without your say."
          />
          <HowStep
            n={5}
            icon={<Spade className="h-5 w-5" />}
            title="Deal"
            body="Real No-Limit Hold'em, live, for as many hands as you want."
          />
        </ol>
      </section>

      <section id="features" className="features-section">
        <h2>What&rsquo;s at the table</h2>
        <div className="features-grid">
          <FeatureCard
            icon={<Timer className="h-5 w-5" />}
            title="Real hands, dealt live"
            body="Turn timers and animated bets keep the pace of an actual table — everyone sees every action the moment it happens."
          />
          <FeatureCard
            icon={<Coins className="h-5 w-5" />}
            title="Buy-ins, your call"
            body="Approve or reject every request, set a minimum and maximum, and keep a running ledger of who bought in for what."
          />
          <FeatureCard
            icon={<History className="h-5 w-5" />}
            title="Every hand on record"
            body="Flip back through hand history to settle the inevitable argument about who really had the flush."
          />
          <FeatureCard
            icon={<MessageSquare className="h-5 w-5" />}
            title="Talk at the table"
            body="Table chat and sound keep it feeling like everyone's actually sitting across from each other."
          />
        </div>
      </section>

      <section className="cta-band">
        <p>Get a table running in under a minute.</p>
        <Button
          size="lg"
          onClick={() => setCreateOpen(true)}
          className="h-12 bg-[var(--accent-lime)] px-8 text-base font-bold tracking-wide text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90"
        >
          Create table
        </Button>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <Spade className="h-4 w-4 text-[var(--accent-lime)]" fill="currentColor" />
          <span>Felt</span>
        </div>
        <p>A private table for you and your friends.</p>
        <p className="landing-footer-disclaimer">Play-money only — nothing on Felt is for real-money wagering.</p>
      </footer>
    </main>
  );
}

function HowStep({ n, icon, title, body }: { n: number; icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="how-step">
      <span className="how-step-n">{n}</span>
      <span className="how-step-icon">{icon}</span>
      <span className="how-step-title">{title}</span>
      <span className="how-step-body">{body}</span>
    </li>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="feature-card">
      <span className="feature-card-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
