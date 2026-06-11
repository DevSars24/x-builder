import { type JudgeProviderId } from "@x-builder/shared";

import { CodexCliProvider } from "./codex-cli-provider.js";
import type { ProcessRunner } from "./process-runner.js";
import type { LlmProvider } from "./structured-llm-service.js";

export type JudgeProviderRegistryEntry = {
  id: JudgeProviderId;
  createProvider: (options: { runner: ProcessRunner; workspaceRoot: string }) => LlmProvider<unknown>;
};

// The single per-provider wiring point. Only codex is registered in the first
// extension ticket; Claude/Cursor arrive in later tickets.
export const judgeProviderRegistry: readonly JudgeProviderRegistryEntry[] = [
  {
    id: "codex-cli",
    createProvider: ({ runner, workspaceRoot }) => new CodexCliProvider({ runner, workspaceRoot }),
  },
];
