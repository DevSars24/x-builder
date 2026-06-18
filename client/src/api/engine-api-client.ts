import {
  analyzePostsResponseSchema,
  apiErrorSchema,
  appSettingsResponseSchema,
  appStatusSchema,
  activeArchiveContextSchema,
  archiveContextActivationResponseSchema,
  archiveImportOverviewSchema,
  archiveInsightsLatestResponseSchema,
  archivePostsPageSchema,
  archiveTweetsImportResponseSchema,
  archiveTweetsValidateResponseSchema,
  generateIdeaResponseSchema,
  judgeDraftResponseSchema,
  type AnalyzePostsRequest,
  type AnalyzePostsResponse,
  type ActiveArchiveContext,
  type ApiError,
  type AppSettings,
  type AppSettingsResponse,
  type AppStatus,
  type ArchiveContextActivationResponse,
  type ArchiveImportOverview,
  type ArchiveInsightsLatestResponse,
  type ArchivePostsPage,
  type ArchiveTweetsImportRequest,
  type ArchiveTweetsImportResponse,
  type ArchiveTweetsValidateRequest,
  type ArchiveTweetsValidateResponse,
  type GenerateIdeaRequest,
  type GenerateIdeaResponse,
  type JudgeDraftRequest,
  type JudgeDraftResponse,
} from "@x-builder/shared";
import type { output, ZodTypeAny } from "zod";

export interface EngineApiClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type RequestOptions = {
  body?: unknown;
  method: "GET" | "PATCH" | "POST";
  timeoutMs?: number;
};

// The Codex judge runs a slow CLI; it must not be cut off by the short default
// request timeout used for the rest of the (local, fast) engine API.
const judgeTimeoutMs = 185_000;

export class ApiClientError extends Error {
  public readonly apiError: ApiError;
  public readonly cause?: unknown;

  constructor(apiError: ApiError, cause?: unknown) {
    super(apiError.message);
    this.name = "ApiClientError";
    this.apiError = apiError;
    this.cause = cause;
  }
}

const clientError = (
  code: Extract<ApiError["code"], "engine_unreachable" | "request_timeout" | "invalid_response">,
  message: string,
): ApiError =>
  apiErrorSchema.parse({
    code,
    message,
    scope: "app",
    retryable: true,
  });

const engineUnreachableError = () =>
  clientError("engine_unreachable", "The local engine could not be reached. Try again.");

const requestTimeoutError = () =>
  clientError("request_timeout", "The local engine request timed out. Try again.");

const invalidResponseError = () =>
  clientError("invalid_response", "The local engine returned an invalid response. Try again.");

const defaultFetch = (): typeof fetch => globalThis.fetch.bind(globalThis);

export class EngineApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: EngineApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? defaultFetch();
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  getStatus(): Promise<AppStatus> {
    return this.observe(this.request("/status", { method: "GET" }, appStatusSchema));
  }

  getSettings(): Promise<AppSettingsResponse> {
    return this.observe(this.request("/settings", { method: "GET" }, appSettingsResponseSchema));
  }

  saveSettings(settings: AppSettings): Promise<AppSettingsResponse> {
    return this.observe(
      this.request(
        "/settings",
        {
          body: settings,
          method: "PATCH",
        },
        appSettingsResponseSchema,
      ),
    );
  }

  generateIdea(input: GenerateIdeaRequest): Promise<GenerateIdeaResponse> {
    return this.observe(
      this.request(
        "/ideas/generate",
        {
          body: input,
          method: "POST",
        },
        generateIdeaResponseSchema,
      ),
    );
  }

  analyzePosts(input: AnalyzePostsRequest): Promise<AnalyzePostsResponse> {
    return this.observe(
      this.request(
        "/posts/analyze",
        {
          body: input,
          method: "POST",
        },
        analyzePostsResponseSchema,
      ),
    );
  }

  judgeDraft(input: JudgeDraftRequest): Promise<JudgeDraftResponse> {
    return this.observe(
      this.request(
        "/drafts/judge",
        {
          body: input,
          method: "POST",
          timeoutMs: judgeTimeoutMs,
        },
        judgeDraftResponseSchema,
      ),
    );
  }

  validateTweetsArchive(input: ArchiveTweetsValidateRequest): Promise<ArchiveTweetsValidateResponse> {
    return this.observe(
      this.request(
        "/archive/tweets/validate",
        {
          body: input,
          method: "POST",
        },
        archiveTweetsValidateResponseSchema,
      ),
    );
  }

  importTweetsArchive(input: ArchiveTweetsImportRequest): Promise<ArchiveTweetsImportResponse> {
    return this.observe(
      this.request(
        "/archive/tweets/import",
        {
          body: input,
          method: "POST",
        },
        archiveTweetsImportResponseSchema,
      ),
    );
  }

  getLatestArchiveImport(): Promise<ArchiveImportOverview> {
    return this.observe(
      this.request("/archive/imports/latest", { method: "GET" }, archiveImportOverviewSchema),
    );
  }

  getArchivePosts(input: { cursor?: string; limit?: number } = {}): Promise<ArchivePostsPage> {
    const params = new URLSearchParams();

    if (input.limit !== undefined) {
      params.set("limit", String(input.limit));
    }

    if (input.cursor !== undefined) {
      params.set("cursor", input.cursor);
    }

    const query = params.toString();

    return this.observe(
      this.request(
        `/archive/posts${query.length > 0 ? `?${query}` : ""}`,
        { method: "GET" },
        archivePostsPageSchema,
      ),
    );
  }

  getLatestArchiveInsights(): Promise<ArchiveInsightsLatestResponse> {
    return this.observe(
      this.request("/archive/insights/latest", { method: "GET" }, archiveInsightsLatestResponseSchema),
    );
  }

  activateArchiveContext(): Promise<ArchiveContextActivationResponse> {
    return this.observe(
      this.request(
        "/archive/context/activate",
        { method: "POST" },
        archiveContextActivationResponseSchema,
      ),
    );
  }

  deactivateArchiveContext(): Promise<ArchiveContextActivationResponse> {
    return this.observe(
      this.request(
        "/archive/context/deactivate",
        { method: "POST" },
        archiveContextActivationResponseSchema,
      ),
    );
  }

  getActiveArchiveContext(): Promise<ActiveArchiveContext> {
    return this.observe(
      this.request("/archive/context/active", { method: "GET" }, activeArchiveContextSchema),
    );
  }

  private observe<T>(promise: Promise<T>): Promise<T> {
    promise.catch(() => undefined);

    return promise;
  }

  private async request<TSchema extends ZodTypeAny>(
    path: string,
    options: RequestOptions,
    responseSchema: TSchema,
  ): Promise<output<TSchema>> {
    const response = await this.fetchWithTimeout(path, options);
    const payload = await this.readJson(response);

    if (!response.ok) {
      const parsedError = apiErrorSchema.safeParse(payload);

      if (parsedError.success) {
        throw new ApiClientError(parsedError.data);
      }

      throw new ApiClientError(invalidResponseError());
    }

    const parsedResponse = responseSchema.safeParse(payload);

    if (!parsedResponse.success) {
      throw new ApiClientError(invalidResponseError(), parsedResponse.error);
    }

    return parsedResponse.data;
  }

  private async fetchWithTimeout(path: string, options: RequestOptions): Promise<Response> {
    const controller = new AbortController();
    const timeoutError = new ApiClientError(requestTimeoutError());
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(timeoutError);
        controller.abort();
      }, options.timeoutMs ?? this.timeoutMs);
    });

    const fetchPromise = Promise.resolve().then(() =>
      this.fetchImpl(`${this.baseUrl}${path}`, {
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        headers:
          options.body === undefined
            ? undefined
            : {
                "content-type": "application/json",
              },
        method: options.method,
        signal: controller.signal,
      }),
    );

    try {
      return await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }

      throw new ApiClientError(engineUnreachableError(), error);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new ApiClientError(invalidResponseError(), error);
    }
  }
}
