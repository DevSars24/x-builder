import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";

import {
  appStatusSchema,
  subsystemStatusSchema,
  type AppStatus,
  type SubsystemStatus,
} from "@x-builder/shared";

import { createSettingsJudgeProviderResolver } from "../llm/judge-provider-resolver.js";
import { judgeProviderRegistry } from "../llm/judge-provider-registry.js";
import { NodeProcessRunner, type ProcessRunner } from "../llm/process-runner.js";
import { SelectedJudgeReadinessProbe } from "../llm/selected-judge-readiness-probe.js";
import { JsonFileAppSettingsRepository } from "./settings-repository.js";
import { defaultSettingsRoot } from "./constants.js";
import { resolveWorkspaceRoot } from "./workspace-root.js";

export type ReadinessProbe = {
  check: () => Promise<SubsystemStatus> | SubsystemStatus;
};

export type ReadinessDependencies = {
  deterministic: ReadinessProbe;
  llm: ReadinessProbe;
  storage: ReadinessProbe;
};

export type ReadinessService = {
  getStatus: () => Promise<AppStatus> | AppStatus;
};

export type DefaultReadinessDependenciesOptions = {
  codexRunner?: ProcessRunner;
  startupCwd?: string;
  settingsRoot?: string;
};

const readinessTimeoutMsDefault = 750;

export const defaultReadinessTimeoutMs = readinessTimeoutMsDefault;

const packageVersion = ((): string => {
  try {
    const requireFromHere = createRequire(import.meta.url);
    const enginePackage = requireFromHere("../../package.json") as {
      version?: string;
    };

    return enginePackage.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const nowIso = (): string => new Date().toISOString();

const subsystem = (
  state: SubsystemStatus["state"],
  label: string,
  overrides: Partial<SubsystemStatus> = {},
): SubsystemStatus =>
  subsystemStatusSchema.parse({
    state,
    label,
    checkedAt: nowIso(),
    retryable: true,
    details: {},
    ...overrides,
  });

const timeoutProbeStatus = (label: string): SubsystemStatus =>
  subsystem("unavailable", label, {
    message: "Readiness check timed out.",
    retryable: true,
  });

const failedProbeStatus = (label: string): SubsystemStatus =>
  subsystem("unavailable", label, {
    message: "Readiness check failed.",
    retryable: true,
  });

// Walk up from a path to the first directory that exists. Settings are written
// with mkdir -p, so writability of the nearest existing ancestor determines
// whether the engine can persist; the leaf dir need not exist yet.
const nearestExistingDirectory = (path: string): string => {
  let current = path;

  while (!existsSync(current)) {
    const parent = dirname(current);

    if (parent === current) {
      break;
    }

    current = parent;
  }

  return current;
};

export function createDefaultReadinessDependencies(
  options: DefaultReadinessDependenciesOptions = {},
): ReadinessDependencies {
  const startupCwd = options.startupCwd ?? process.cwd();
  const settingsRoot = options.settingsRoot ?? defaultSettingsRoot;
  const workspaceRoot = resolveWorkspaceRoot(startupCwd);
  const settingsRepository = new JsonFileAppSettingsRepository({ root: settingsRoot });
  const selectedJudgeProbe = new SelectedJudgeReadinessProbe({
    resolveProvider: createSettingsJudgeProviderResolver(settingsRepository),
    registry: judgeProviderRegistry,
    resolveWorkspaceRoot: () => workspaceRoot,
    runner: options.codexRunner ?? new NodeProcessRunner(),
    executionTimeoutMs: readinessTimeoutMsDefault,
  });

  return {
    deterministic: {
      check: () =>
        subsystem("ready", "Deterministic scorer", {
          retryable: false,
          details: {
            mode: "in-process",
          },
        }),
    },
    llm: {
      check: () => selectedJudgeProbe.check(),
    },
    storage: {
      check: async () => {
        const target = nearestExistingDirectory(settingsRoot);
        await access(target, constants.W_OK);

        return subsystem("ready", "Storage", {
          retryable: true,
          details: {
            boundary: target,
          },
        });
      },
    },
  };
}

const probeLabels: Record<keyof ReadinessDependencies, string> = {
  deterministic: "Deterministic scorer",
  llm: "Judge",
  storage: "Storage",
};

const overallFromSubsystems = (
  engine: SubsystemStatus,
  deterministic: SubsystemStatus,
  llm: SubsystemStatus,
  storage: SubsystemStatus,
): AppStatus["overall"] => {
  if (engine.state !== "ready") {
    return "unavailable";
  }

  return [deterministic, llm, storage].every((status) => status.state === "ready")
    ? "ready"
    : "partial";
};

const withTimeout = async <T>(operation: Promise<T>, timeoutMs: number, timeoutValue: T): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      resolve(timeoutValue);
    }, timeoutMs);

    operation
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timeout);
      });
  });

class DefaultReadinessService implements ReadinessService {
  constructor(
    private readonly dependencies: ReadinessDependencies = createDefaultReadinessDependencies(),
    private readonly timeoutMs = readinessTimeoutMsDefault,
  ) {}

  async getStatus(): Promise<AppStatus> {
    const engine = subsystem("ready", "Engine", {
      message: "Engine is accepting local requests.",
      retryable: false,
      details: {
        adapter: "fastify",
      },
    });

    const [deterministic, llm, storage] = await Promise.all([
      this.checkProbe("deterministic"),
      this.checkProbe("llm"),
      this.checkProbe("storage"),
    ]);
    const generatedAt = nowIso();

    return appStatusSchema.parse({
      overall: overallFromSubsystems(engine, deterministic, llm, storage),
      version: packageVersion,
      generatedAt,
      engine,
      deterministic,
      llm,
      storage,
      lastRun: {
        state: "none",
      },
    });
  }

  private async checkProbe(key: keyof ReadinessDependencies): Promise<SubsystemStatus> {
    const label = probeLabels[key];

    try {
      const status = await withTimeout(
        Promise.resolve().then(() => this.dependencies[key].check()),
        this.timeoutMs,
        timeoutProbeStatus(label),
      );

      return subsystemStatusSchema.parse(status);
    } catch {
      return failedProbeStatus(label);
    }
  }
}

export const createDefaultReadinessService = (
  options: DefaultReadinessDependenciesOptions & { timeoutMs?: number } = {},
): ReadinessService =>
  new DefaultReadinessService(
    createDefaultReadinessDependencies(options),
    options.timeoutMs ?? readinessTimeoutMsDefault,
  );

export const createReadinessService = (
  dependencies?: ReadinessDependencies,
  timeoutMs = readinessTimeoutMsDefault,
): ReadinessService =>
  new DefaultReadinessService(
    dependencies ?? createDefaultReadinessDependencies(),
    timeoutMs,
  );
