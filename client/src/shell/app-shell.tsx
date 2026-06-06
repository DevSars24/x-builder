import {
  Component,
  useEffect,
  useSyncExternalStore,
  type MouseEvent,
  type ReactElement,
} from "react";
import type { RouteConfig } from "@x-builder/shared";

import { WriterPage } from "../features/writer/writer-page";
import { Alert, Button, EmptyState } from "../ui/foundation";
import { appRoutes, resolveRoutePath } from "./route-registry";
import {
  createShellPreferencesStore,
  type ShellPreferencesStore,
} from "./shell-preferences";

export type ShellHistory = {
  location: {
    pathname: string;
  };
  push?: (path: RouteConfig["path"]) => void;
  replace?: (path: RouteConfig["path"]) => void;
  subscribe?: (listener: () => void) => () => void;
};

export type RouteHeadingFocusTarget = {
  routeId: RouteConfig["id"];
  headingId: string;
  headingText: string;
};

export type ShellRouteComponentProps = {
  route: RouteConfig;
};

export type ShellRouteComponents = Partial<
  Record<RouteConfig["id"], (props: ShellRouteComponentProps) => ReactElement>
>;

export type AppShellProps = {
  history: ShellHistory;
  preferencesStore: ShellPreferencesStore;
  routeComponents?: ShellRouteComponents;
  onRouteHeadingFocus?: (target: RouteHeadingFocusTarget) => void;
};

export type CreateMemoryShellHistoryOptions = {
  initialPath: string;
};

export type NavigateShellRouteOptions = {
  history: ShellHistory;
  preferencesStore: ShellPreferencesStore;
  to: RouteConfig["path"];
  focusRouteHeading: (target: RouteHeadingFocusTarget) => void;
};

type ShellHistoryState = ShellHistory & {
  notify: () => void;
};

const browserStorageKey = "x-builder:shell-preferences";

function createHistoryState(initialPath: string): ShellHistoryState {
  const listeners = new Set<() => void>();
  const initialResolution = resolveRoutePath(initialPath);
  const history: ShellHistoryState = {
    location: {
      pathname: initialResolution.canonicalPath,
    },
    notify: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    push: (path) => {
      history.location.pathname = path;
      history.notify();
    },
    replace: (path) => {
      history.location.pathname = path;
      history.notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };

  return history;
}

export function createMemoryShellHistory({
  initialPath,
}: CreateMemoryShellHistoryOptions): ShellHistory {
  return createHistoryState(initialPath);
}

export function createBrowserShellHistory(): ShellHistory {
  if (typeof window === "undefined") {
    return createMemoryShellHistory({ initialPath: "/writer" });
  }

  const initialResolution = resolveRoutePath(window.location.pathname);
  const history = createHistoryState(initialResolution.canonicalPath);
  const push = history.push;
  const replace = history.replace;

  if (initialResolution.shouldReplace) {
    window.history.replaceState(null, "", initialResolution.canonicalPath);
  }

  history.push = (path) => {
    window.history.pushState(null, "", path);
    push?.(path);
  };
  history.replace = (path) => {
    window.history.replaceState(null, "", path);
    replace?.(path);
  };

  window.addEventListener("popstate", () => {
    history.location.pathname = window.location.pathname;
    history.notify();
  });

  return history;
}

export function createBrowserShellPreferencesStore(): ShellPreferencesStore {
  if (typeof window === "undefined") {
    return createShellPreferencesStore({
      storage: createMemoryPreferenceStorage(),
      storageKey: browserStorageKey,
    });
  }

  return createShellPreferencesStore({
    storage: window.localStorage,
    storageKey: browserStorageKey,
  });
}

function createMemoryPreferenceStorage() {
  const entries = new Map<string, string>();

  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

function headingTargetForRoute(route: RouteConfig): RouteHeadingFocusTarget {
  return {
    routeId: route.id,
    headingId: `route-heading-${route.id}`,
    headingText: route.title,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setHistoryPath(
  history: ShellHistory,
  path: RouteConfig["path"],
  action: "push" | "replace",
) {
  const handler = action === "push" ? history.push : history.replace;

  if (handler !== undefined) {
    handler(path);
    return;
  }

  history.location.pathname = path;
}

export function navigateShellRoute({
  focusRouteHeading,
  history,
  preferencesStore,
  to,
}: NavigateShellRouteOptions): void {
  const resolution = resolveRoutePath(to);

  setHistoryPath(history, resolution.canonicalPath, "push");
  preferencesStore.set({
    ...preferencesStore.get(),
    lastRoutePath: resolution.canonicalPath,
  });
  focusRouteHeading(headingTargetForRoute(resolution.route));
}

function useShellPath(history: ShellHistory): string {
  return useSyncExternalStore(
    history.subscribe ?? (() => () => undefined),
    () => history.location.pathname,
    () => history.location.pathname,
  );
}

function useShellPreferences(preferencesStore: ShellPreferencesStore) {
  return useSyncExternalStore(
    preferencesStore.subscribe,
    preferencesStore.get,
    preferencesStore.get,
  );
}

function focusRouteHeading(target: RouteHeadingFocusTarget): void {
  if (typeof document === "undefined") {
    return;
  }

  window.requestAnimationFrame(() => {
    document.getElementById(target.headingId)?.focus();
  });
}

function SidebarNav({
  activeRoute,
  history,
  onNavigate,
  preferences,
  preferencesStore,
}: {
  activeRoute: RouteConfig;
  history: ShellHistory;
  onNavigate?: (target: RouteHeadingFocusTarget) => void;
  preferences: ReturnType<ShellPreferencesStore["get"]>;
  preferencesStore: ShellPreferencesStore;
}): ReactElement {
  const sidebarToggleLabel = preferences.sidebarCollapsed
    ? "Expand sidebar"
    : "Collapse sidebar";

  const handleToggleSidebar = () => {
    preferencesStore.set({
      ...preferences,
      sidebarCollapsed: !preferences.sidebarCollapsed,
    });
  };

  const handleNavigate =
    (path: RouteConfig["path"]) => (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      navigateShellRoute({
        history,
        preferencesStore,
        to: path,
        focusRouteHeading: (target) => {
          onNavigate?.(target);
          focusRouteHeading(target);
        },
      });
    };

  return (
    <nav aria-label="Primary" className="xb-shell-sidebar">
      <div className="xb-shell-sidebar__header">
        <span
          aria-hidden={preferences.sidebarCollapsed}
          className="xb-shell-sidebar__brand"
        >
          x-builder
        </span>
        <button
          aria-label={sidebarToggleLabel}
          className="xb-shell-sidebar__toggle"
          onClick={handleToggleSidebar}
          type="button"
        >
          <span aria-hidden="true">{preferences.sidebarCollapsed ? ">" : "<"}</span>
        </button>
      </div>
      <div className="xb-shell-sidebar__routes">
        {appRoutes.map((route) => (
          <a
            key={route.id}
            href={route.path}
            aria-current={route.id === activeRoute.id ? "page" : undefined}
            aria-label={route.label}
            className="xb-shell-sidebar__route"
            data-active={route.id === activeRoute.id ? "true" : undefined}
            onClick={handleNavigate(route.path)}
          >
            <span className="xb-shell-sidebar__route-marker" aria-hidden="true" />
            <span className="xb-shell-sidebar__route-label">{route.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

function DefaultRouteBody({ route }: ShellRouteComponentProps): ReactElement {
  if (route.id === "writer") {
    return <WriterPage />;
  }

  return (
    <EmptyState title={`${route.title} workspace`}>
      The {route.label} route is ready in the shell.
    </EmptyState>
  );
}

function RouteRecovery(): ReactElement {
  return (
    <Alert
      recovery={
        <Button size="sm" variant="secondary">
          Retry
        </Button>
      }
      title="Route unavailable"
      variant="danger"
    >
      This route could not render.
    </Alert>
  );
}

type RouteErrorBoundaryProps = {
  children: ReactElement;
  routeId: RouteConfig["id"];
};

type RouteErrorBoundaryState = {
  hasError: boolean;
  routeId: RouteConfig["id"];
};

class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = {
    hasError: false,
    routeId: this.props.routeId,
  };

  static getDerivedStateFromProps(
    props: RouteErrorBoundaryProps,
    state: RouteErrorBoundaryState,
  ): RouteErrorBoundaryState | null {
    if (props.routeId !== state.routeId) {
      return {
        hasError: false,
        routeId: props.routeId,
      };
    }

    return null;
  }

  componentDidCatch(): void {
    this.setState({
      hasError: true,
      routeId: this.props.routeId,
    });
  }

  render(): ReactElement {
    if (this.state.hasError) {
      return <RouteRecovery />;
    }

    return this.props.children;
  }
}

function routeComponentFor(
  route: RouteConfig,
  routeComponents: ShellRouteComponents | undefined,
) {
  const RouteComponent = routeComponents?.[route.id] ?? DefaultRouteBody;

  return RouteComponent;
}

function renderStaticRouteBody(
  route: RouteConfig,
  RouteComponent: (props: ShellRouteComponentProps) => ReactElement,
): ReactElement {
  // React error boundaries do not catch server-render failures.
  try {
    return RouteComponent({ route });
  } catch {
    return <RouteRecovery />;
  }
}

function RouteBody({
  route,
  routeComponents,
}: {
  route: RouteConfig;
  routeComponents: ShellRouteComponents | undefined;
}): ReactElement {
  const RouteComponent = routeComponentFor(route, routeComponents);

  if (typeof window === "undefined") {
    return renderStaticRouteBody(route, RouteComponent);
  }

  return (
    <RouteErrorBoundary routeId={route.id}>
      <RouteComponent route={route} />
    </RouteErrorBoundary>
  );
}

function RouteHeading({ target }: { target: RouteHeadingFocusTarget }): ReactElement {
  return (
    <div
      className="xb-page-header__copy"
      dangerouslySetInnerHTML={{
        __html: `<h1 class="xb-page-header__title" id="${target.headingId}" tabIndex="-1">${escapeHtml(target.headingText)}</h1>`,
      }}
    />
  );
}

export function AppShell({
  history,
  onRouteHeadingFocus,
  preferencesStore,
  routeComponents,
}: AppShellProps): ReactElement {
  const pathname = useShellPath(history);
  const preferences = useShellPreferences(preferencesStore);
  const resolution = resolveRoutePath(pathname);
  const shouldReplace = resolution.shouldReplace;
  const canonicalPath = resolution.canonicalPath;

  useEffect(() => {
    if (shouldReplace) {
      setHistoryPath(history, canonicalPath, "replace");
    }
  }, [canonicalPath, history, shouldReplace]);

  const route = resolution.route;
  const headingTarget = headingTargetForRoute(route);

  return (
    <div
      className="xb-shell"
      data-sidebar-collapsed={preferences.sidebarCollapsed ? "true" : "false"}
    >
      <a className="xb-shell__skip-link" href="#main-content">
        Skip to content
      </a>
      <SidebarNav
        activeRoute={route}
        history={history}
        onNavigate={onRouteHeadingFocus}
        preferences={preferences}
        preferencesStore={preferencesStore}
      />
      <main className="xb-shell__main" id="main-content">
        <header className="xb-page-header xb-shell__route-header">
          <div className="xb-page-header__main">
            <RouteHeading target={headingTarget} />
          </div>
        </header>
        <section aria-labelledby={headingTarget.headingId} className="xb-shell__route-outlet">
          <RouteBody route={route} routeComponents={routeComponents} />
        </section>
      </main>
    </div>
  );
}
