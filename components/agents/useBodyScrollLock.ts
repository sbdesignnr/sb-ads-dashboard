import { useEffect } from "react";

/**
 * Zamkne scroll stránky, kým je otvorený portálovaný panel/modál nad ňou.
 * `overflow: hidden` na body/html by sa zdalo stačiť, ale na mobile (najmä
 * iOS Safari) to vie zároveň zablokovať aj scroll vnútri vnorených
 * `overflow-y-auto` kontajnerov - preto sa stránka namiesto toho fyzicky
 * znehybní cez `position: fixed` v aktuálnej scroll pozícii.
 */
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
