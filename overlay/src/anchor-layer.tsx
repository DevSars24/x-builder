// @x-builder/overlay — AnchorLayer skeleton + anchor registry (XOB-019)
//
// Watches `document.body` for the X SPA's DOM churn and keeps a node→pin
// registry (`Map<Element, AffordanceHandle>`) that downstream tickets (XOB-025+)
// will populate with real pins. At THIS ticket the registry stays empty: the
// reconcile pass calls `safeQueryAll` on the `XSelectors` targets, mounts no
// pins, and zero matches is a valid, error-free state.
//
// Observer discipline:
//   - A single `MutationObserver(document.body, {childList, subtree})`.
//   - Callbacks are rAF-gated and ~150ms debounced (cancel-and-reschedule), so
//     a heavy SPA re-render burst collapses to a single trailing reconcile.
//   - The observer disconnects when the tab is hidden (`visibilitychange`) and
//     on unmount; both disconnects are wrapped in try/catch to survive a
//     document teardown during fast navigation.

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef } from "react";

import { safeQueryAll, XSelectors } from "./selectors";

/** Internal node→pin handle. The registry is empty until XOB-025+ mount pins. */
export interface AffordanceHandle {
  anchorEl: Element;
  rect: DOMRect;
  type: "composer" | "tweet";
}

/** Node→pin registry, shared with descendants for read access (`.size` etc.). */
export type AnchorRegistry = Map<Element, AffordanceHandle>;

const AnchorRegistryContext = createContext<AnchorRegistry | null>(null);

/**
 * Read the anchor registry from the nearest `AnchorLayer`. Throws if used
 * outside one (dev invariant), mirroring the transport seam.
 */
export function useAnchorRegistry(): AnchorRegistry {
  const registry = useContext(AnchorRegistryContext);
  if (registry === null) {
    throw new Error("[xb] useAnchorRegistry() called outside an AnchorLayer");
  }
  return registry;
}

/** ~150ms debounce window; absorbs SPA navigation re-render bursts. */
const RECONCILE_DEBOUNCE_MS = 150;

/** rAF that degrades to a microtask-ish timeout when unavailable (JSDOM). */
function scheduleFrame(cb: () => void): number {
  const raf = (
    globalThis as { requestAnimationFrame?: (fn: FrameRequestCallback) => number }
  ).requestAnimationFrame;
  if (typeof raf === "function") {
    return raf(() => cb());
  }
  return setTimeout(cb, 0) as unknown as number;
}

/** Cancel a handle from `scheduleFrame`, matching the rAF/timeout it returned. */
function cancelFrame(handle: number): void {
  const caf = (
    globalThis as { cancelAnimationFrame?: (h: number) => void }
  ).cancelAnimationFrame;
  if (typeof caf === "function") {
    caf(handle);
  }
  clearTimeout(handle);
}

export interface AnchorLayerProps {
  children?: ReactNode;
}

/**
 * Mounts the `MutationObserver` reconcile loop and provides the (empty) anchor
 * registry to its children. Renders nothing visible at this ticket.
 */
export function AnchorLayer({ children }: AnchorLayerProps): ReactNode {
  // L3: the registry is owned here and stable for the layer's lifetime.
  const registryRef = useRef<AnchorRegistry>(new Map());

  useEffect(() => {
    const registry = registryRef.current;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let frameHandle: number | null = null;

    /**
     * Reconcile pass: query the X targets and align the registry. Empty at this
     * ticket — no `XSelectors` target mounts a pin, and zero matches is valid.
     */
    const reconcile = (): void => {
      // Touch the selectors so the reconcile path is real (miss-counted), even
      // though no pins are produced yet.
      safeQueryAll(document.body, XSelectors.COMPOSER_TEXTAREA);
      safeQueryAll(document.body, XSelectors.TWEET_ARTICLE);
      // Registry intentionally left empty until XOB-025+ wires real pins.
      void registry;
    };

    /** Cancel any pending tick and schedule a fresh rAF-gated reconcile. */
    const scheduleReconcile = (): void => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (frameHandle !== null) cancelFrame(frameHandle);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        frameHandle = scheduleFrame(() => {
          frameHandle = null;
          reconcile();
        });
      }, RECONCILE_DEBOUNCE_MS);
    };

    const observer = new MutationObserver(() => {
      scheduleReconcile();
    });

    /** Disconnect defensively — document teardown can make this throw. */
    const disconnect = (): void => {
      try {
        observer.disconnect();
      } catch {
        // Page is unloading; nothing to clean up.
      }
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        disconnect();
      }
    };

    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (frameHandle !== null) cancelFrame(frameHandle);
      disconnect();
    };
  }, []);

  return (
    <AnchorRegistryContext.Provider value={registryRef.current}>
      {children}
    </AnchorRegistryContext.Provider>
  );
}
