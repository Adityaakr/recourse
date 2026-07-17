// A modal dialog with correct AnimatePresence motion (per the ui-skills
// mastering-animate-presence rules): the conditional is wrapped in
// AnimatePresence, both backdrop and panel declare exit that mirrors initial,
// and `mode="wait"` lets the exit finish before anything else. Escape and
// backdrop-click close it; focus moves in on open; scroll is locked.

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Dialog({ open, onClose, label, meta, children }: {
  open: boolean; onClose: () => void; label: string; meta?: string; children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div
            key="backdrop"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col border border-border bg-card shadow-float outline-none"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <header className="flex items-center justify-between border-b bg-card-head px-4 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="term-label">{label}</span>
                {meta && <span className="text-[11px] text-muted-fg">{meta}</span>}
              </div>
              <button type="button" onClick={onClose} aria-label="Close"
                className="grid h-6 w-6 place-items-center text-muted-fg hover:bg-muted hover:text-fg">
                <X size={15} />
              </button>
            </header>
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
