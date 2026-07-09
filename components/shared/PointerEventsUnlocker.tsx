"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Safety net for a known Radix bug (react-select / react-dropdown-menu 2.x):
 * a dismissed Select/Dropdown can leave `body { pointer-events: none }` behind
 * (its unmount — which restores pointer events — is delayed by a close animation
 * whose `animationend` never fires on some touch devices), which freezes the
 * whole page. We clear the lock whenever no Radix layer is actually open.
 */

// A genuinely-open Radix layer marks an element with data-state="open" (trigger +
// content). A closed-but-still-mounted layer is data-state="closed", so this does
// NOT treat a lingering closed portal as "open" — otherwise the page would stay
// frozen forever. (This app only uses Radix select/dropdown/switch/tabs; switch is
// checked/unchecked and tabs is active/inactive, so [data-state="open"] is specific
// to an open select/dropdown.)
function radixLayerOpen(): boolean {
  return Boolean(document.querySelector('[data-state="open"]'));
}

function clearLock() {
  if (document.body.style.pointerEvents === "none") document.body.style.pointerEvents = "";
  if (document.documentElement.style.pointerEvents === "none") document.documentElement.style.pointerEvents = "";
}

export function PointerEventsUnlocker() {
  const pathname = usePathname();

  // Navigating to another module closes every menu/dialog — always release any
  // leftover lock so the new page is interactive. This is the common freeze:
  // tap a module → Radix left the body locked → nothing responds.
  useEffect(() => {
    clearLock();
  }, [pathname]);

  useEffect(() => {
    const unlockIfStuck = () => {
      if (document.body.style.pointerEvents !== "none") return;
      if (!radixLayerOpen()) clearLock();
    };

    const id = window.setInterval(unlockIfStuck, 300);
    // Heal on the next interaction (capture — still fires while body is locked).
    window.addEventListener("pointerup", unlockIfStuck, true);
    window.addEventListener("touchend", unlockIfStuck, true);
    window.addEventListener("click", unlockIfStuck, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pointerup", unlockIfStuck, true);
      window.removeEventListener("touchend", unlockIfStuck, true);
      window.removeEventListener("click", unlockIfStuck, true);
    };
  }, []);

  return null;
}
