import { describe, expect, it, vi } from "vitest";
import {
  judgeProviderLabels,
  subsystemStatusSchema,
  type JudgeProviderId,
  type SubsystemStatus,
} from "@x-builder/shared";

import type {
  ProcessRunner,
  ProcessRunOptions,
  ProcessRunResult,
} from "../process-runner.js";

type ProviderReadinessSpec = {
  command: string;
  adapter: JudgeProviderId;
  label: string;
  sandbox: string;
};

type JudgeReadinessRegistryEntry = {
  id: JudgeProviderId;
  judgeLabel: string;
  readiness: ProviderReadinessSpec;
};

type SelectedJudgeReadinessProbeConstructor = new (options: {
  resolveProvider: () => Promise<JudgeProviderId>;
  registry: readonly JudgeReadinessRegistryEntry[];
  resolveWorkspaceRoot: () => string | null;
  runner: ProcessRunner;
  executionTimeoutMs?: number;
}) => { check: () => Promise<SubsystemStatus> };

type CapturedProcessRun = {
  command: string;
  args: readonly string[];
  options: ProcessRunOptions;
};

type FakeProcessRunner = ProcessRunner & {
  calls: CapturedProcessRun[];
};

const workspaceRoot = "/tmp/x-builder-selected-judge-workspace";

const codexEntry: JudgeReadinessRegistryEntry = {
  id: "codex-cli",
  judgeLabel: judgeProviderLabels["codex-cli"],
  readiness: {
    command: "codex",
    adapter: "codex-cli",
    label: judgeProviderLabels["codex-cli"],
    sandbox: "read-only",
  },
};

const claudeEntry: JudgeReadinessRegistryEntry = {
  id: "claude-cli",
  judgeLabel: judgeProviderLabels["claude-cli"],
  readiness: {
    command: "claude",
    adapter: "claude-cli",
    label: judgeProviderLabels["claude-cli"],
    sandbox: "read-only",
  },
};

const byteLength = (value: string): number => Buffer.byteLength(value, "utf8");

async function loadSelectedJudgeReadinessProbe(): Promise<SelectedJudgeReadinessProbeConstructor> {
  const module = (await import("../selected-judge-readiness-probe.js")) as {
    SelectedJudgeReadinessProbe: SelectedJudgeReadinessProbeConstructor;
  };

  return module.SelectedJudgeReadinessProbe;
}

const fakeProcessRunner = (
  handler: (call: CapturedProcessRun) => Promise<ProcessRunResult> | ProcessRunResult,
): FakeProcessRunner => {
  const calls: CapturedProcessRun[] = [];

  return {
    calls,
    run: vi.fn(async (command, args, options) => {
      const call = { command, args, options };
      calls.push(call);

      return handler(call);
    }),
  };
};

const successfulProcessResult = (stdout: string): ProcessRunResult => ({
  status: "success",
  stdout,
  stderr: "",
  exitCode: 0,
  signal: null,
  durationMs: 4,
  stdoutBytes: byteLength(stdout),
  stderrBytes: 0,
});

describe("SelectedJudgeReadinessProbe", () => {
  it("probes the resolved provider's command through the registry readiness spec", async () => {
    const runner = fakeProcessRunner(() => successfulProcessResult("codex-cli 0.42.0\n"));
    const SelectedJudgeReadinessProbe = await loadSelectedJudgeReadinessProbe();
    const probe = new SelectedJudgeReadinessProbe({
      resolveProvider: vi.fn(async () => "codex-cli"),
      registry: [codexEntry, claudeEntry],
      resolveWorkspaceRoot: () => workspaceRoot,
      runner,
    });

    const status = subsystemStatusSchema.parse(await probe.check());

    expect(runner.run).toHaveBeenCalledOnce();
    const [call] = runner.calls;
    expect(call?.command).toBe("codex");
    expect(call?.args).toEqual(["--version"]);
    expect(status.state).toBe("ready");
    expect(status.label).toBe("Codex judge");
  });

  it("dispatches to a different selected provider's command on the next check", async () => {
    const runner = fakeProcessRunner(() => successfulProcessResult("claude-cli 1.2.3\n"));
    const SelectedJudgeReadinessProbe = await loadSelectedJudgeReadinessProbe();
    const probe = new SelectedJudgeReadinessProbe({
      resolveProvider: vi.fn(async () => "claude-cli"),
      registry: [codexEntry, claudeEntry],
      resolveWorkspaceRoot: () => workspaceRoot,
      runner,
    });

    const status = subsystemStatusSchema.parse(await probe.check());

    const [call] = runner.calls;
    expect(call?.command).toBe("claude");
    expect(status.label).toBe("Claude judge");
    expect(status.state).toBe("ready");
  });

  it("reports unavailable when the resolved provider id is absent from the injected registry", async () => {
    const runner = fakeProcessRunner(() => successfulProcessResult("codex-cli 0.42.0\n"));
    const SelectedJudgeReadinessProbe = await loadSelectedJudgeReadinessProbe();
    const probe = new SelectedJudgeReadinessProbe({
      resolveProvider: vi.fn(async () => "cursor-cli"),
      // Injected registry deliberately lacks the resolved provider id.
      registry: [codexEntry, claudeEntry],
      resolveWorkspaceRoot: () => workspaceRoot,
      runner,
    });

    const status = subsystemStatusSchema.parse(await probe.check());

    expect(runner.run).not.toHaveBeenCalled();
    expect(status.state).toBe("unavailable");
    expect(status.label).toBe("Judge");
    expect(status.message).toBe("Judge provider is not available in this build.");
  });

  it("uses the selected provider's catalog label and unresolved-root reason when no workspace root resolves", async () => {
    const runner = fakeProcessRunner(() => successfulProcessResult("claude-cli 1.2.3\n"));
    const SelectedJudgeReadinessProbe = await loadSelectedJudgeReadinessProbe();
    const probe = new SelectedJudgeReadinessProbe({
      resolveProvider: vi.fn(async () => "claude-cli"),
      registry: [codexEntry, claudeEntry],
      resolveWorkspaceRoot: () => null,
      runner,
    });

    const status = subsystemStatusSchema.parse(await probe.check());

    expect(runner.run).not.toHaveBeenCalled();
    expect(status.state).toBe("unavailable");
    expect(status.label).toBe("Claude judge");
    expect(status.details).toMatchObject({ reason: "workspace_root_unresolved" });
  });

  it("probes the codex default normally when the resolver fails and falls back", async () => {
    const runner = fakeProcessRunner(() => successfulProcessResult("codex-cli 0.42.0\n"));
    const SelectedJudgeReadinessProbe = await loadSelectedJudgeReadinessProbe();
    // A resolver failure falls back to codex-cli (the resolver itself never
    // throws), so the probe runs the codex spec against the registry entry.
    const probe = new SelectedJudgeReadinessProbe({
      resolveProvider: vi.fn(async () => "codex-cli"),
      registry: [codexEntry, claudeEntry],
      resolveWorkspaceRoot: () => workspaceRoot,
      runner,
    });

    const status = subsystemStatusSchema.parse(await probe.check());

    const [call] = runner.calls;
    expect(call?.command).toBe("codex");
    expect(status.state).toBe("ready");
    expect(status.label).toBe("Codex judge");
  });
});
