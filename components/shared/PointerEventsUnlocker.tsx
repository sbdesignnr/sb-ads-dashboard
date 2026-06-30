"use client";

import { useEffect } from "react";

/**
 * Safety net for a known Radix bug (react-select / react-dropdown-menu 2.x):
 * a dismissed Select/Dropdown can leave `body { pointer-events: none }` behind,
 * which freezes the whole page — especially on touch devices. If the body is
 * locked while no Radix overlay is actually open, clear the lock. Runs on every
 * tap (so a stuck page heals on the next touch) and on a short interval backstop.
 */
export function PointerEventsUnlocker() {
  useEffect(() => {
    const unlockIfStuck = () => {
      if (document.body.style.pointerEvents !== "none") return;
      const overlayOpen = document.querySelector(
        "[data-radix-popper-content-wrapper], [role='dialog'][data-state='open']",
      );
      if (!overlayOpen) document.body.style.pointerEvents = "";
    };

    const id = window.setInterval(unlockIfStuck, 400);
    window.addEventListener("pointerup", unlockIfStuck, true);
    window.addEventListener("touchend", unlockIfStuck, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pointerup", unlockIfStuck, true);
      window.removeEventListener("touchend", unlockIfStuck, true);
    };
  }, []);

  return null;
}
