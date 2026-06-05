import { spawn } from "node:child_process";

export type CodexAdapterInput = {
  prompt: string;
  schemaPath: string;
  timeoutMs?: number;
};

export async function runCodexJudge(input: CodexAdapterInput): Promise<string> {
  const timeoutMs = input.timeoutMs ?? 120_000;

  return new Promise((resolve, reject) => {
    const child = spawn("codex", [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--output-schema",
      input.schemaPath,
      "-"
    ]);

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Codex judge timed out"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || `Codex exited with code ${code}`));
    });

    child.stdin.write(input.prompt);
    child.stdin.end();
  });
}
