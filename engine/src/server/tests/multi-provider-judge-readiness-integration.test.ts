import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appStatusSchema,
  judgeProviderIdSchema,
  judgeProviderLabels,
  type AppSettings,
  type JudgeProviderId,
} from "@x-builder/shared";
import { describe, expect, it, vi } from "vitest";

import { CliReadinessProbe } from "../../llm/cli-readiness-probe";
import { judgeProviderRegistry } from "../../llm/judge-provider-registry";
import type {
  ProcessRunOptions,
  ProcessRunResult,
  ProcessRunner,
} from "../../llm/process-runner";
import { SelectedJudgeReadinessProbe } from "../../llm/selected-judge-readiness-probe";
import { JsonFileAppSettingsRepository } from "../settings-repository";
import {
  buildServer,
  createDefaultReadinessDependencies,
  type ReadinessDependencies,
} from "../server";

// Cross-cutting readiness-dispatch integration coverage. Drives the REAL probe
// stack (SelectedJudgeReadinessProbe -> judgeProviderRegistry -> CliReadinessProbe)
// through createDefaultReadinessDependencies and GET /status, reading the active
// provider from the SAME temp-root settings repository the judge path uses. The
// fake ProcessRunner is the only mocked seam; no CLI is ever spawned.

const allProviderIds = judgeProviderIdSchema.options;

// The CLI command and the version line each provider's readiness probe runs.
const commandByProvider: Record<JudgeProviderId, string> = {
  "codex-cli": "codex",
  "claude-cli": "claude",
  "cursor-cli": "cursor-agent",
};

const versionStdoutByProvider: Record<JudgeProviderId, string> = {
  "codex-cli": "codex-cli 0.42.0\n",
  "claude-cli": "claude-cli 1.2.3\n",
  "cursor-cli": "cursor-agent 2025.10.0\n",
};

type CapturedRun = {
  command: string;
  args: readonly string[];
  options: ProcessRunOptions;
};

type FakeProcessRunner = ProcessRunner & {
  calls: CapturedRun[];
};

const byteLength = (value: string): number => Buffer.byteLength(value, "utf8");

const parseJson = (payload: string): unknown => JSON.parse(payload);

const successProcessResult = (stdout: string): ProcessRunResult => ({
  status: "success",
  stdout,
  stderr: "",
  exitCode: 0,
  signal: null,
  durationMs: 4,
  stdoutBytes: byteLength(stdout),
  stderrBytes: 0,
});

const fakeRunner = (
  handler: (call: CapturedRun) => ProcessRunResult | Promise<ProcessRunResult>,
): FakeProcessRunner => {
  const calls: CapturedRun[] = [];

  return {
    calls,
    run: vi.fn(async (command, args, options) => {
      const call: CapturedRun = { command, args: [...args], options };
      calls.push(call);

      return handler(call);
    }),
  } as FakeProcessRunner;
};

// A version runner that returns the version line matching whichever CLI was
// invoked, so a single runner serves any selected provider's readiness probe.
const versionRunnerForAnyProvider = (): FakeProcessRunner =>
  fakeRunner((call) => {
    const provider = (Object.keys(commandByProvider) as JudgeProviderId[]).find(
      (id) => commandByProvider[id] === call.command,
    );

    if (!provider) {
      throw new Error(`Unexpected command spawned by the readiness probe: ${call.command}`);
    }

    return successProcessResult(versionStdoutByProvider[provider]);
  });

const baseSettings = (root: string, overrides: Partial<AppSettings>): AppSettings =>
  ({
    engineBaseUrl: "http://127.0.0.1:4173",
    storagePath: join(root, "storage"),
    judgeProvider: "codex-cli",
    showDeterministicDetails: true,
    ...overrides,
  }) as AppSettings;

// Builds a server whose readiness dependencies are the REAL defaults wired to a
// git workspace at `root` and the same temp-root settings repository the patch
// route writes to, with the fake runner injected as the codex/probe runner.
const withReadinessServer = async <T>(
  options: { settings?: Partial<AppSettings>; persist?: boolean; runner?: FakeProcessRunner },
  run: (context: {
    app: ReturnType<typeof buildServer>;
    runner: FakeProcessRunner;
    settingsRepository: JsonFileAppSettingsRepository;
    root: string;
  }) => Promise<T>,
): Promise<T> => {
  const root = await mkdtemp(join(tmpdir(), "x-builder-mp-readiness-"));

  try {
    await mkdir(join(root, ".git"), { recursive: true });

    const settingsRepository = new JsonFileAppSettingsRepository({ root });

    if (options.persist !== false) {
      await settingsRepository.save(baseSettings(root, options.settings ?? {}));
    }

    const runner = options.runner ?? versionRunnerForAnyProvider();
    const dependencies: ReadinessDependencies = createDefaultReadinessDependencies({
      codexRunner: runner,
      startupCwd: root,
      settingsRoot: root,
    });
    const app = buildServer({ readinessDependencies: dependencies, settingsRepository });

    try {
      return await run({ app, runner, settingsRepository, root });
    } finally {
      await app.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const getStatus = async (app: ReturnType<typeof buildServer>) => {
  const response = await app.inject({ method: "GET", url: "/status" });
  expect(response.statusCode).toBe(200);

  return appStatusSchema.parse(parseJson(response.body));
};

const patchProvider = async (
  app: ReturnType<typeof buildServer>,
  root: string,
  provider: JudgeProviderId,
): Promise<void> => {
  const response = await app.inject({
    method: "PATCH",
    url: "/settings",
    payload: baseSettings(root, { judgeProvider: provider }),
  });
  expect(response.statusCode).toBe(200);
};

describe("multi-provider judge readiness — user flows", () => {
  // FLOW 2: a provider change via PATCH /settings is reflected by the very next
  // GET /status with no engine restart — the slot runs the new provider's probe.
  it("reflects a live provider switch in the next status probe and label without restart", async () => {
    await withReadinessServer({}, async ({ app, runner, root }) => {
      for (const provider of allProviderIds) {
        await patchProvider(app, root, provider);
        const before = runner.calls.length;
        const status = await getStatus(app);

        expect(status.llm.state).toBe("ready");
        expect(status.llm.label).toBe(judgeProviderLabels[provider]);
        // The newly-selected provider's command was probed on this very call.
        const probeCall = runner.calls.at(-1)!;
        expect(runner.calls.length).toBe(before + 1);
        expect(probeCall.command).toBe(commandByProvider[provider]);
        expect(probeCall.args).toEqual(["--version"]);
        expect(status.llm.details).toMatchObject({ adapter: provider, command: commandByProvider[provider] });
      }
    });
  });

  // FLOW 3 (status side): a settings file that fails to load falls back to the
  // codex provider's readiness probe and label.
  it("falls back the status llm slot to the codex provider when settings fail to load", async () => {
    await withReadinessServer({ persist: false }, async ({ app, runner, root }) => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(join(root, "settings.json"), "{ not valid json", "utf8");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      try {
        const status = await getStatus(app);

        expect(status.llm.state).toBe("ready");
        expect(status.llm.label).toBe(judgeProviderLabels["codex-cli"]);
        const probeCall = runner.calls.at(-1)!;
        expect(probeCall.command).toBe("codex");
        expect(probeCall.args).toEqual(["--version"]);
        expect(status.llm.details).toMatchObject({ adapter: "codex-cli" });
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
});

describe("multi-provider judge readiness — architectural invariants", () => {
  // INVARIANT 4: version-only readiness. Falsifiable: any captured arg set other
  // than exactly ["--version"] (e.g. a cursor `status`/`about` auth subcommand)
  // fails this for that provider.
  it("invokes only <command> --version for every provider's readiness probe", async () => {
    for (const provider of allProviderIds) {
      const runner = fakeRunner(() => successProcessResult(versionStdoutByProvider[provider]));
      const probe = new CliReadinessProbe({
        spec: judgeProviderRegistry.find((entry) => entry.id === provider)!.readiness,
        runner,
        workspaceRoot: "/tmp/x-builder-mp-readiness-argv",
      });

      const status = await probe.check();

      expect(status.state).toBe("ready");
      expect(runner.run).toHaveBeenCalledOnce();
      const call = runner.calls[0]!;
      expect(call.command).toBe(commandByProvider[provider]);
      // Exactly --version, nothing else. A stray subcommand fails this.
      expect(call.args).toEqual(["--version"]);
      expect(call.args).not.toContain("status");
      expect(call.args).not.toContain("about");
      expect(call.args).not.toContain("auth");
      expect(call.args).not.toContain("login");
    }
  });

  it("drives version-only readiness through the full selected-probe dispatch for every provider", async () => {
    // The same invariant, but through SelectedJudgeReadinessProbe -> the REAL
    // registry -> CliReadinessProbe, so a registry/probe miswiring also fails it.
    for (const provider of allProviderIds) {
      const runner = fakeRunner(() => successProcessResult(versionStdoutByProvider[provider]));
      const probe = new SelectedJudgeReadinessProbe({
        resolveProvider: async () => provider,
        registry: judgeProviderRegistry,
        resolveWorkspaceRoot: () => "/tmp/x-builder-mp-readiness-dispatch",
        runner,
      });

      const status = await probe.check();

      expect(status.state).toBe("ready");
      expect(status.label).toBe(judgeProviderLabels[provider]);
      expect(runner.run).toHaveBeenCalledOnce();
      expect(runner.calls[0]!.command).toBe(commandByProvider[provider]);
      expect(runner.calls[0]!.args).toEqual(["--version"]);
    }
  });

  // INVARIANT 5: label single-source. Falsifiable: any readiness label or
  // judgeLabel not === judgeProviderLabels[id] fails this.
  it("sources every readiness label and judgeLabel from the shared catalog", () => {
    for (const id of allProviderIds) {
      const entry = judgeProviderRegistry.find((candidate) => candidate.id === id);
      expect(entry).toBeDefined();
      expect(entry?.judgeLabel).toBe(judgeProviderLabels[id]);
      expect(entry?.readiness.label).toBe(judgeProviderLabels[id]);
    }
  });

  it("surfaces each provider's catalog label verbatim through the live status slot", async () => {
    // End-to-end label single-source: the resolver picks the provider from the
    // temp-root repo and the status slot must carry the catalog label, not an
    // engine-declared string.
    for (const provider of allProviderIds) {
      await withReadinessServer({ settings: { judgeProvider: provider } }, async ({ app }) => {
        const status = await getStatus(app);

        expect(status.llm.label).toBe(judgeProviderLabels[provider]);
      });
    }
  });
});
