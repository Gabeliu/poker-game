"use client";

import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-[oklch(0.6_0.16_25)] to-[oklch(0.45_0.14_10)]",
  "from-[oklch(0.62_0.15_260)] to-[oklch(0.4_0.14_290)]",
  "from-[oklch(0.7_0.16_150)] to-[oklch(0.48_0.13_170)]",
  "from-[oklch(0.75_0.17_85)] to-[oklch(0.55_0.15_60)]",
  "from-[oklch(0.65_0.18_330)] to-[oklch(0.45_0.15_300)]",
  "from-[oklch(0.68_0.14_200)] to-[oklch(0.42_0.12_220)]",
];

function gradientForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const SIZE_CLASSES = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-8 w-8 text-[11px]",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
  // For the fixed 8-seat ring: sized for the "table is full" worst case
  // (positions don't move or grow as seats empty out), scaling only with
  // viewport width, not with how many seats happen to be occupied.
  table: "h-8 w-8 text-[11px] sm:h-10 sm:w-10 sm:text-xs md:h-11 md:w-11 md:text-sm",
} as const;

interface PlayerAvatarProps {
  name: string;
  size?: keyof typeof SIZE_CLASSES;
  dimmed?: boolean;
  className?: string;
}

export function PlayerAvatar({ name, size = "md", dimmed, className }: PlayerAvatarProps) {
  return (
    <div
      className={cn(
        SIZE_CLASSES[size],
        "relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white/90 shadow-[0_2px_10px_rgba(0,0,0,0.5)] ring-1 ring-white/10",
        gradientForName(name),
        dimmed && "opacity-40 grayscale",
        className
      )}
    >
      {initialsFor(name)}
    </div>
  );
}
