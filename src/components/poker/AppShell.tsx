"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, History, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppShellProps {
  left: ReactNode;
  right: ReactNode;
  children: ReactNode;
}

/** LEFT SIDEBAR | MAIN | RIGHT SIDEBAR, collapsible on desktop, drawers on mobile. */
export function AppShell({ left, right, children }: AppShellProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState<"left" | "right" | null>(null);

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* Desktop left sidebar */}
      <aside
        className={cn(
          "room-sidebar hidden shrink-0 flex-col border-r border-white/8 py-3 transition-[width] duration-200 md:flex",
          leftCollapsed ? "w-12 items-center" : "w-56 px-4"
        )}
      >
        <button
          onClick={() => setLeftCollapsed((v) => !v)}
          className="mb-2 flex h-6 w-6 shrink-0 items-center justify-center self-end rounded-md text-[var(--text-secondary)] hover:bg-white/8 hover:text-[var(--text-primary)]"
          title={leftCollapsed ? "Expand" : "Collapse"}
          aria-label={leftCollapsed ? "Expand players and history" : "Collapse players and history"}
          aria-expanded={!leftCollapsed}
        >
          {leftCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
        {leftCollapsed ? (
          <History className="h-4 w-4 text-[var(--text-secondary)]" />
        ) : (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto">{left}</div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>

      {/* Desktop right sidebar */}
      <aside
        className={cn(
          "room-sidebar hidden shrink-0 flex-col border-l border-white/8 py-3 transition-[width] duration-200 md:flex",
          rightCollapsed ? "w-12 items-center" : "w-60 px-4"
        )}
      >
        <button
          onClick={() => setRightCollapsed((v) => !v)}
          className="mb-2 flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-md text-[var(--text-secondary)] hover:bg-white/8 hover:text-[var(--text-primary)]"
          title={rightCollapsed ? "Expand" : "Collapse"}
          aria-label={rightCollapsed ? "Expand chat" : "Collapse chat"}
          aria-expanded={!rightCollapsed}
        >
          {rightCollapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {rightCollapsed ? (
          <MessageSquare className="h-4 w-4 text-[var(--text-secondary)]" />
        ) : (
          <div className="flex min-h-0 flex-1">{right}</div>
        )}
      </aside>

      {/* Mobile drawer triggers */}
      <div className="absolute left-2 top-2 z-30 flex gap-1.5 md:hidden">
        <button
          aria-label="Open players and history"
          onClick={() => setMobileDrawer("left")}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-[var(--text-secondary)] backdrop-blur"
        >
          <History className="h-4 w-4" />
        </button>
      </div>
      <div className="absolute right-2 top-2 z-30 flex gap-1.5 md:hidden">
        <button
          aria-label="Open chat"
          onClick={() => setMobileDrawer("right")}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-[var(--text-secondary)] backdrop-blur"
        >
          <MessageSquare className="h-4 w-4" />
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileDrawer && (
        <div className="absolute inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileDrawer(null)} />
          <div
            className={cn(
              "relative flex h-full w-[78%] max-w-xs flex-col bg-[var(--surface-app)] p-3 shadow-2xl animate-in duration-200",
              mobileDrawer === "left" ? "slide-in-from-left" : "ml-auto slide-in-from-right"
            )}
          >
            <button
              aria-label="Close sidebar"
              onClick={() => setMobileDrawer(null)}
              className="mb-2 flex h-7 w-7 shrink-0 items-center justify-center self-end rounded-md text-[var(--text-secondary)] hover:bg-white/8"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              {mobileDrawer === "left" ? left : right}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
