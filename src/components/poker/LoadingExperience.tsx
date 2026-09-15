"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Spade } from "lucide-react";

interface LoadingExperienceProps {
  show: boolean;
  text: string;
}

/** A Felt-themed transition screen for create/join/reconnect — never a
 * generic spinner. Only stays up as long as the real work takes; the
 * parent controls `show` directly rather than this component faking a
 * minimum duration. */
export function LoadingExperience({ show, text }: LoadingExperienceProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="ambient-page-bg fixed inset-0 z-50 flex flex-col items-center justify-center gap-6"
        >
          <div className="relative flex h-40 w-40 items-center justify-center">
            <motion.div
              className="absolute inset-0 rounded-full border border-dashed border-[var(--accent-lime)]/30"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-4 rounded-full border border-dashed border-[var(--accent-purple)]/30"
              animate={{ rotate: -360 }}
              transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-9 rounded-full border border-[var(--accent-lime)]/15"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            />

            {/* Orbiting particles */}
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute inset-0"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3 + i, ease: "linear", delay: i * 0.3 }}
              >
                <span
                  className="absolute h-1.5 w-1.5 rounded-full bg-[var(--accent-lime)]"
                  style={{ top: 4, left: "50%", boxShadow: "0 0 8px var(--accent-lime)" }}
                />
              </motion.div>
            ))}

            <motion.div
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            >
              <Spade className="h-10 w-10 text-[var(--accent-lime)] drop-shadow-[0_0_16px_var(--accent-lime)]" fill="currentColor" />
            </motion.div>
          </div>

          <motion.p
            key={text}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm font-semibold tracking-[0.25em] text-[var(--text-secondary)]"
          >
            {text.toUpperCase()}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
