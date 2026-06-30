import type { AnalyzePostsResponse, CooldownReport } from "@x-builder/shared";

// The cooldown window the per-item re-attach joins against: one compute(7) per
// analyze request in both the HTTP server and in-process runner bindings.
export const ANALYZE_COOLDOWN_WINDOW_DAYS = 7;

// Attach a per-item cooldown signal to each scored item by looking up its
// detectedFormat in the precomputed window report. A scored item gets a cooldown
// key ONLY when the report carries a real in-window signal for its format;
// formats with no signal leave the key genuinely absent. score_failed items are
// returned unchanged, keeping the response valid against analyzePostsResponseSchema.
export const attachCooldownSignals = (
  response: AnalyzePostsResponse,
  report: CooldownReport,
): AnalyzePostsResponse => ({
  ...response,
  items: response.items.map((item) => {
    if (item.status !== "scored") {
      return item;
    }

    const signal = report.signals.find(
      (candidate) => candidate.format === item.detectedFormat,
    );

    return signal === undefined ? item : { ...item, cooldown: signal };
  }),
});
