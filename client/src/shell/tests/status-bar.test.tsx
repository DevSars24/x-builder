import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ApiError, AppStatus } from "@x-builder/shared";

const statusBarModulePath = "../status-bar";

type StatusPhase =
  | "checking"
  | "ready"
  | "partial"
  | "unavailable"
  | "invalid"
  | "refreshing";

type EngineStatusClient = {
  getStatus: () => Promise<AppStatus>;
};

type AppStatusSnapshot = {
  status: AppStatus | null;
  error: ApiError | null;
  phase: StatusPhase;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
};

type UseAppStatusOptions = {
  apiClient: EngineStatusClient;
  onStatusChange?: (status: AppStatus) => void;
};

type TopStatusBarProps = {
  status: AppStatusSnapshot;
  onOpenSettings: () => void;
};

type StatusBarModule = {
  TopStatusBar: (props: TopStatusBarProps) => ReactElement;
  useAppStatus: (options: UseAppStatusOptions) => AppStatusSnapshot;
};

async function loadStatusBar() {
  return (await import(statusBarModulePath)) as StatusBarModule;
}

function subsystem(
  label: string,
  state: AppStatus["engine"]["state"],
  message?: string,
): AppStatus["engine"] {
  return {
    checkedAt: "2026-06-06T12:00:00.000Z",
    details: {},
    label,
    message,
    retryable: state !== "ready",
    state,
  };
}

function createReadyStatus(): AppStatus {
  return {
    llm: subsystem("Codex judge", "ready"),
    deterministic: subsystem("Deterministic scorer", "ready"),
    engine: subsystem("Engine", "ready"),
    generatedAt: "2026-06-06T12:00:00.000Z",
    lastRun: {
      completedAt: "2026-06-06T11:55:00.000Z",
      ideaId: "idea-123",
      state: "completed",
    },
    overall: "ready",
    storage: subsystem("Storage", "ready"),
    version: "0.0.0-test",
  };
}

function createPartialStatus(): AppStatus {
  return {
    ...createReadyStatus(),
    llm: subsystem(
      "Codex judge",
      "unconfigured",
      "Codex judge is not configured. Deterministic scoring still works.",
    ),
    generatedAt: "2026-06-06T12:05:00.000Z",
    lastRun: {
      state: "none",
    },
    overall: "partial",
    storage: subsystem("Storage", "stale", "Storage path needs review."),
  };
}

function createSnapshot(
  overrides: Partial<AppStatusSnapshot> = {},
): AppStatusSnapshot {
  return {
    error: null,
    isRefreshing: false,
    phase: "ready",
    refresh: vi.fn(async () => undefined),
    status: createReadyStatus(),
    ...overrides,
  };
}

function textContent(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function renderStatusBar(
  TopStatusBar: StatusBarModule["TopStatusBar"],
  status: AppStatusSnapshot,
) {
  return renderToStaticMarkup(
    <TopStatusBar status={status} onOpenSettings={vi.fn()} />,
  );
}

describe("useAppStatus", () => {
  it("returns a checking snapshot and refreshes through the mocked API client", async () => {
    const { useAppStatus } = await loadStatusBar();
    const readyStatus = createReadyStatus();
    const apiClient: EngineStatusClient = {
      getStatus: vi.fn(async () => readyStatus),
    };
    const onStatusChange = vi.fn();
    let snapshot: AppStatusSnapshot | undefined;

    function Probe(): ReactElement {
      snapshot = useAppStatus({ apiClient, onStatusChange });

      return <output>{snapshot.phase}</output>;
    }

    renderToStaticMarkup(<Probe />);

    expect(snapshot).toMatchObject({
      error: null,
      isRefreshing: true,
      phase: "checking",
      status: null,
    });

    await snapshot?.refresh();

    expect(apiClient.getStatus).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith(readyStatus);
  });
});

describe("TopStatusBar", () => {
  it("shows ready status labels with visible text and a polite live region", async () => {
    const { TopStatusBar } = await loadStatusBar();

    const html = renderStatusBar(TopStatusBar, createSnapshot());
    const text = textContent(html);

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
    expect(text).toContain("Engine ready");
    expect(text).toContain("Deterministic scorer ready");
    expect(text).toContain("Codex judge ready");
    expect(text).toContain("Storage ready");
    expect(text).toContain("Last run");
    expect(text).toContain("idea-123");
  });

  it("shows partial readiness copy while keeping Settings available", async () => {
    const { TopStatusBar } = await loadStatusBar();

    const html = renderStatusBar(
      TopStatusBar,
      createSnapshot({
        phase: "partial",
        status: createPartialStatus(),
      }),
    );
    const text = textContent(html);

    expect(text).toContain("Engine ready");
    expect(text).toContain("Deterministic scorer ready");
    expect(text).toContain("Codex judge unconfigured");
    expect(text).toContain("Deterministic scoring still works.");
    expect(text).toContain("Storage stale");
    expect(text).toContain("No runs yet");
    expect(text).toContain("Open Settings");
  });

  it("keeps stale previous status visible while a manual refresh is pending", async () => {
    const { TopStatusBar } = await loadStatusBar();

    const html = renderStatusBar(
      TopStatusBar,
      createSnapshot({
        isRefreshing: true,
        phase: "refreshing",
      }),
    );
    const text = textContent(html);

    expect(text).toContain("Engine ready");
    expect(text).toContain("Codex judge ready");
    expect(text).toContain("Storage ready");
    expect(text).toContain("Refreshing");
    expect(html).toContain('aria-label="Refresh status"');
    expect(html).toContain('aria-busy="true"');
  });

  it("shows a danger judge badge with its inline message and keeps Settings reachable when the selected provider slot is unavailable", async () => {
    const { TopStatusBar } = await loadStatusBar();
    const status = createReadyStatus();

    const html = renderStatusBar(
      TopStatusBar,
      createSnapshot({
        phase: "partial",
        status: {
          ...status,
          llm: subsystem(
            "Codex judge",
            "unavailable",
            "Codex is unavailable. Deterministic scoring still works.",
          ),
          overall: "partial",
        },
      }),
    );
    const text = textContent(html);

    expect(text).toContain("Codex judge unavailable");
    expect(html).toContain("xb-badge--danger");
    expect(text).toContain("Codex is unavailable. Deterministic scoring still works.");
    expect(text).toContain("Deterministic scorer ready");
    expect(text).toContain("Open Settings");
  });

  it("renders a novel server-owned llm slot label verbatim without client-side provider mapping", async () => {
    const { TopStatusBar } = await loadStatusBar();
    const status = createReadyStatus();

    const html = renderStatusBar(
      TopStatusBar,
      createSnapshot({
        status: {
          ...status,
          llm: subsystem("Quorum judge", "ready"),
        },
      }),
    );
    const text = textContent(html);

    expect(text).toContain("Quorum judge ready");
    expect(text).not.toContain("Codex judge");
  });

  it("renders the judge placeholder as Judge checking while the status snapshot is still loading", async () => {
    const { TopStatusBar } = await loadStatusBar();

    const html = renderStatusBar(
      TopStatusBar,
      createSnapshot({
        isRefreshing: true,
        phase: "checking",
        status: null,
      }),
    );
    const text = textContent(html);

    expect(text).toContain("Judge checking");
    expect(text).not.toContain("Codex judge");
    expect(text).not.toContain("LLM judge");
  });

  it("falls the judge badge through to the uncertain variant for an unmapped slot state without crashing", async () => {
    const { TopStatusBar } = await loadStatusBar();
    const status = createReadyStatus();

    const html = renderStatusBar(
      TopStatusBar,
      createSnapshot({
        status: {
          ...status,
          llm: subsystem("Codex judge", "disabled"),
        },
      }),
    );
    const text = textContent(html);

    expect(text).toContain("Codex judge disabled");
    // No mapped variant exists for "disabled", so the badge falls through to the
    // uncertain styling rather than a success/danger/warning variant.
    expect(html).toContain("xb-badge--uncertain");
    expect(text).toContain("Engine ready");
  });
});
