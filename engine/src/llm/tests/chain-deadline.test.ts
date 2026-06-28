import { afterEach, describe, expect, it, vi } from "vitest";

type ChainDeadlineInstance = {
  readonly startedAt: number;
  readonly budgetMs: number;
  elapsedMs(): number;
  remainingMs(maxStepMs?: number): number;
  assertRemaining(minMs?: number): void;
};

type ChainDeadlineModule = {
  ChainDeadline: new (options: { budgetMs: number }) => ChainDeadlineInstance;
  ChainBudgetExceededError: new (...args: unknown[]) => Error;
};

const loadChainDeadline = async (): Promise<ChainDeadlineModule> =>
  (await import("../chain-deadline")) as ChainDeadlineModule;

describe("ChainDeadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const startAt = (timestampMs: number): number => {
    vi.useFakeTimers();
    vi.setSystemTime(timestampMs);
    return timestampMs;
  };

  it("returns the lesser of remaining wall-clock budget and maxStepMs", async () => {
    const { ChainDeadline } = await loadChainDeadline();
    const startedAt = startAt(10_000);
    const deadline = new ChainDeadline({ budgetMs: 1_000 });

    vi.setSystemTime(startedAt + 250);

    expect(deadline.startedAt).toBe(startedAt);
    expect(deadline.budgetMs).toBe(1_000);
    expect(deadline.elapsedMs()).toBe(250);
    expect(deadline.remainingMs(600)).toBe(600);
    expect(deadline.remainingMs(900)).toBe(750);
  });

  it("throws a typed retryable chain budget error when no time remains", async () => {
    const { ChainDeadline, ChainBudgetExceededError } = await loadChainDeadline();
    const startedAt = startAt(50_000);
    const deadline = new ChainDeadline({ budgetMs: 1_000 });

    vi.setSystemTime(startedAt + 1_001);

    expect(deadline.remainingMs()).toBe(0);

    try {
      deadline.assertRemaining();
    } catch (error) {
      expect(error).toBeInstanceOf(ChainBudgetExceededError);
      expect(error).toMatchObject({
        code: "chain_budget_exhausted",
        retryable: true,
        budgetMs: 1_000,
        elapsedMs: 1_001,
      });
      return;
    }

    throw new Error("Expected ChainDeadline.assertRemaining() to throw.");
  });

  it("honors assertRemaining(minMs) when positive remaining time is below the required minimum", async () => {
    const { ChainDeadline, ChainBudgetExceededError } = await loadChainDeadline();
    const startedAt = startAt(90_000);
    const deadline = new ChainDeadline({ budgetMs: 1_000 });

    vi.setSystemTime(startedAt + 750);

    expect(deadline.remainingMs()).toBe(250);
    expect(() => deadline.assertRemaining(200)).not.toThrow();

    try {
      deadline.assertRemaining(300);
    } catch (error) {
      expect(error).toBeInstanceOf(ChainBudgetExceededError);
      expect(error).toMatchObject({
        code: "chain_budget_exhausted",
        retryable: true,
        budgetMs: 1_000,
        elapsedMs: 750,
      });
      return;
    }

    throw new Error(
      "Expected ChainDeadline.assertRemaining(minMs) to throw when remaining time is below minMs.",
    );
  });
});
