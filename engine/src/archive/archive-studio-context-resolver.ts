import type {
  ActiveArchiveContext,
  AnalyzePostsRequest,
  ScoringContext,
} from "@x-builder/shared";

import type { PostLibraryRepository } from "../server/post-library-repository.js";

type ArchiveScoringContextPatch = {
  repeatHistory?: ScoringContext["repeatHistory"];
};

export class ArchiveStudioContextResolver {
  constructor(private readonly repository: PostLibraryRepository) {}

  async activeContext(): Promise<ActiveArchiveContext> {
    const store = await this.repository.loadStore();

    return store.activeContext;
  }

  async mergeAnalysisRequest(request: AnalyzePostsRequest): Promise<AnalyzePostsRequest> {
    const activeContext = await this.activeContext();

    if (activeContext.status !== "active") {
      return request;
    }

    return {
      ...request,
      scoringContext: this.mergeScoringContext(
        request.scoringContext,
        activeContext.scoringContextPatch,
      ),
    };
  }

  async composeJudgeProfile(accountProfile: string | undefined): Promise<string | undefined> {
    const activeContext = await this.activeContext();
    const baseProfile = accountProfile?.trim();
    const hints = activeContext.status === "active" ? activeContext.judgeHints : [];

    if (hints.length === 0) {
      return baseProfile === undefined || baseProfile.length === 0 ? undefined : baseProfile;
    }

    const archiveHintBlock = [
      "Archive context hints:",
      ...hints.map((hint) => `- ${hint}`),
    ].join("\n");

    if (baseProfile === undefined || baseProfile.length === 0) {
      return archiveHintBlock;
    }

    return `${baseProfile}\n\n${archiveHintBlock}`;
  }

  private mergeScoringContext(
    requestContext: ScoringContext,
    archivePatch: ArchiveScoringContextPatch,
  ): ScoringContext {
    return {
      ...requestContext,
      ...(requestContext.repeatHistory === undefined &&
      archivePatch.repeatHistory !== undefined
        ? { repeatHistory: archivePatch.repeatHistory }
        : {}),
    };
  }
}
