import { judgeProviderIdSchema, type AppSettings, type JudgeProviderId } from "@x-builder/shared";

const fallbackJudgeProviderId: JudgeProviderId = "codex-cli";

type AppSettingsRepositoryLike = {
  load: () => Promise<{ settings: AppSettings; source: "persisted" | "defaults"; updatedAt?: string }>;
};

export type SettingsJudgeProviderResolver = () => Promise<JudgeProviderId>;

/**
 * Resolve the active judge provider from persisted settings on EVERY call (no
 * caching), so a settings PATCH takes effect on the very next judge call. Any
 * failure of any kind — unreadable file, repository throw, or a settings object
 * whose provider id is missing or unrecognized — falls back to codex-cli and
 * never throws.
 */
export const createSettingsJudgeProviderResolver = (
  repository: AppSettingsRepositoryLike,
): SettingsJudgeProviderResolver => {
  return async () => {
    try {
      const { settings } = await repository.load();
      const parsed = judgeProviderIdSchema.safeParse(settings.judgeProvider);

      return parsed.success ? parsed.data : fallbackJudgeProviderId;
    } catch {
      return fallbackJudgeProviderId;
    }
  };
};
