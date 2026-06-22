// @x-builder/overlay — overlay React tree root (XOB-019)
//
// Mounts the transport seam and the anchor layer. `OverlayTransportProvider`
// wraps the tree and (with no explicit prop) resolves the page-bound
// `window.__xbTransport`, falling back to a warned no-op when absent.
// `AnchorLayer` runs its MutationObserver reconcile loop and owns the (empty)
// anchor registry. Renders no visible output at this ticket — the affordance
// pins that hang off the registry arrive in XOB-025+.

import type { ReactNode } from "react";

import { AnchorLayer } from "./anchor-layer";
import { OverlayTransportProvider } from "./transport/provider";

export interface OverlayRuntimeProps {}

/**
 * The overlay's React root: transport provider over the anchor layer. Produces
 * zero paint output at this ticket.
 */
export function OverlayRuntime(_props: OverlayRuntimeProps): ReactNode {
  return (
    <OverlayTransportProvider>
      <AnchorLayer />
    </OverlayTransportProvider>
  );
}
