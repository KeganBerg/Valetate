import { useEffect, useRef } from 'react';

/*
 * Phones expect the back button (Android) or back swipe to close whatever is
 * on top (a dialog, a sheet, the sign-up form) instead of leaving the app.
 * Each open layer adds a history entry; going back closes the top layer, and
 * closing a layer any other way removes its entry again.
 */
interface Layer {
  close: () => void;
  popped: boolean;
}
const layers: Layer[] = [];
let skipPops = 0;
// entries of closed layers, removed together a moment later; a layer opened
// meanwhile (React's dev double-run, or one dialog swapped for another) takes
// one over instead, so history never goes back past the app
let pendingBacks = 0;
let backTimer: ReturnType<typeof setTimeout> | undefined;
function flushBacks() {
  backTimer = undefined;
  if (!pendingBacks) return;
  const n = pendingBacks;
  pendingBacks = 0;
  skipPops++;
  history.go(-n);
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (skipPops > 0) {
      skipPops--;
      return;
    }
    const top = layers.pop();
    if (top) {
      top.popped = true;
      top.close();
    }
  });
}

/** Back closes this layer while `open` is true. */
export function useBackToClose(open: boolean, onClose: (() => void) | undefined) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closable = open && !!onClose;
  useEffect(() => {
    if (!closable) return;
    const layer: Layer = { close: () => closeRef.current?.(), popped: false };
    layers.push(layer);
    if (pendingBacks > 0) pendingBacks--;
    else history.pushState({ valetateLayer: layers.length }, '');
    return () => {
      if (layer.popped) return;
      // closed with a button, Escape or a tap outside: drop the entry it added
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      pendingBacks++;
      backTimer ??= setTimeout(flushBacks, 0);
    };
  }, [closable]);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Everything a dialog needs to behave like one: back and Escape close it,
 * focus moves into it and stays there, and returns where it was on close.
 * Spread the result onto the dialog element.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: (() => void) | undefined) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useBackToClose(true, onClose);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const before = document.activeElement as HTMLElement | null;
    if (!el.contains(document.activeElement)) {
      // the dialog itself, so a screen reader starts at its title and no keyboard pops up
      el.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeRef.current) {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, []);

  return { ref, role: 'dialog', 'aria-modal': true, tabIndex: -1 } as const;
}
