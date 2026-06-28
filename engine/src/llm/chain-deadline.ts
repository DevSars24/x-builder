export class ChainBudgetExceededError extends Error {
  readonly code = "chain_budget_exhausted";
  readonly retryable = true;
  readonly budgetMs: number;
  readonly elapsedMs: number;

  constructor(options: { budgetMs: number; elapsedMs: number }) {
    super("The LLM chain budget has been exhausted.");
    this.name = "ChainBudgetExceededError";
    this.budgetMs = options.budgetMs;
    this.elapsedMs = options.elapsedMs;
  }
}

export class ChainDeadline {
  readonly startedAt: number;
  readonly budgetMs: number;

  constructor(options: { budgetMs: number }) {
    this.startedAt = Date.now();
    this.budgetMs = options.budgetMs;
  }

  elapsedMs(): number {
    return Math.max(0, Date.now() - this.startedAt);
  }

  remainingMs(maxStepMs?: number): number {
    const remainingBudgetMs = Math.max(0, this.budgetMs - this.elapsedMs());

    if (maxStepMs === undefined) {
      return remainingBudgetMs;
    }

    return Math.max(0, Math.min(remainingBudgetMs, maxStepMs));
  }

  assertRemaining(minMs = 1): void {
    if (this.remainingMs() < minMs) {
      throw new ChainBudgetExceededError({
        budgetMs: this.budgetMs,
        elapsedMs: this.elapsedMs(),
      });
    }
  }
}
