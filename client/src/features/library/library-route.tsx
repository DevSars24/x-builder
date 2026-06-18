import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from "react";
import type {
  ActiveArchiveContext,
  ApiError,
  ArchiveContextActivationResponse,
  ArchiveImportOverview,
  ArchiveInsightsLatestResponse,
  ArchivePostsPage,
  ArchiveTweetsImportRequest,
  ArchiveTweetsImportResponse,
  ArchiveTweetsValidateRequest,
  ArchiveTweetsValidateResponse,
} from "@x-builder/shared";

import { ApiClientError } from "../../api/engine-api-client";
import { Alert, Badge, Button, EmptyState } from "../../ui/foundation";
import "./library-route.css";

export type LibraryRouteApiClient = {
  activateArchiveContext: () => Promise<ArchiveContextActivationResponse>;
  deactivateArchiveContext: () => Promise<ArchiveContextActivationResponse>;
  getActiveArchiveContext: () => Promise<ActiveArchiveContext>;
  getArchivePosts: (input?: { cursor?: string; limit?: number }) => Promise<ArchivePostsPage>;
  getLatestArchiveImport: () => Promise<ArchiveImportOverview>;
  getLatestArchiveInsights: () => Promise<ArchiveInsightsLatestResponse>;
  importTweetsArchive: (
    input: ArchiveTweetsImportRequest,
  ) => Promise<ArchiveTweetsImportResponse>;
  validateTweetsArchive: (
    input: ArchiveTweetsValidateRequest,
  ) => Promise<ArchiveTweetsValidateResponse>;
};

export type LibraryRouteProps = {
  apiClient: LibraryRouteApiClient;
  onNavigateToWriter: () => void;
};

type SelectedArchiveFile = {
  fileName: string;
  fileSizeBytes: number;
  contents: string;
};

const archiveError = (error: unknown): ApiError => {
  if (error instanceof ApiClientError) {
    return error.apiError;
  }

  return {
    code: "internal_error",
    message: "Archive import could not complete. Try again.",
    scope: "archive",
    retryable: true,
    status: 500,
  };
};

const formatCount = (value: number): string => new Intl.NumberFormat("en-US").format(value);

function StatusBadge({ status }: { status: string }): ReactElement {
  const variant =
    status === "valid" || status === "active" || status === "ready"
      ? "success"
      : status === "partial"
        ? "warning"
        : status === "invalid"
          ? "danger"
          : "neutral";

  return <Badge variant={variant}>{status}</Badge>;
}

function ValidationSummary({
  validation,
}: {
  validation: ArchiveTweetsValidateResponse;
}): ReactElement {
  return (
    <section className="xb-library-section" aria-labelledby="library-validation-heading">
      <div className="xb-library-section__heading">
        <h2 id="library-validation-heading">Boundary review</h2>
        <StatusBadge status={validation.status} />
      </div>
      <div className="xb-library-metrics">
        <span>Total {formatCount(validation.counts.totalRecords)}</span>
        <span>Importable {formatCount(validation.counts.validPosts)}</span>
        <span>Skipped {formatCount(validation.counts.skippedRecords)}</span>
        <span>Duplicates {formatCount(validation.duplicatePreview.duplicateRecords)}</span>
      </div>
      <p className="xb-library-copy">
        Favorites and retweets are imported only as weak historical signals. Impressions,
        bookmarks, link clicks, profile clicks, quotes, and received replies are unavailable from
        this archive file.
      </p>
      {validation.warnings.length > 0 ? (
        <ul className="xb-library-list">
          {validation.warnings.map((warning) => (
            <li key={`${warning.code}:${warning.message}`}>{warning.message}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function InsightsSummary({
  insights,
}: {
  insights: ArchiveInsightsLatestResponse | null;
}): ReactElement | null {
  if (insights === null || insights.status === "empty") {
    return null;
  }

  return (
    <section className="xb-library-section" aria-labelledby="library-insights-heading">
      <div className="xb-library-section__heading">
        <h2 id="library-insights-heading">Derived insights</h2>
        <Badge variant="info">{insights.insights.confidence} confidence</Badge>
      </div>
      <div className="xb-library-metrics">
        <span>{formatCount(insights.insights.counts.posts)} posts</span>
        <span>{formatCount(insights.insights.counts.originals)} originals</span>
        <span>{formatCount(insights.insights.counts.replies)} replies</span>
        <span>{insights.insights.cadence.postsPerWeek}/week</span>
      </div>
      {insights.eligibility.blockingReasons.length > 0 ? (
        <Alert variant="warning" title="Activation unavailable">
          {insights.eligibility.blockingReasons.join(" ")}
        </Alert>
      ) : null}
    </section>
  );
}

export function LibraryRoute({
  apiClient,
  onNavigateToWriter,
}: LibraryRouteProps): ReactElement {
  const [selectedFile, setSelectedFile] = useState<SelectedArchiveFile | null>(null);
  const [validation, setValidation] = useState<ArchiveTweetsValidateResponse | null>(null);
  const [importResult, setImportResult] = useState<ArchiveTweetsImportResponse | null>(null);
  const [overview, setOverview] = useState<ArchiveImportOverview | null>(null);
  const [insights, setInsights] = useState<ArchiveInsightsLatestResponse | null>(null);
  const [activeContext, setActiveContext] = useState<ActiveArchiveContext>({ status: "empty" });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<
    "loading" | "reading" | "validating" | "importing" | "activating" | "deactivating" | null
  >("loading");
  const liveRegionRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiClient.getLatestArchiveImport(),
      apiClient.getLatestArchiveInsights(),
      apiClient.getActiveArchiveContext(),
    ])
      .then(([loadedOverview, loadedInsights, loadedContext]) => {
        if (cancelled) {
          return;
        }
        setOverview(loadedOverview);
        setInsights(loadedInsights);
        setActiveContext(loadedContext);
        setError(null);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(archiveError(caught));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusy(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const readSelectedFile = async (file: File): Promise<SelectedArchiveFile> => ({
    fileName: file.name,
    fileSizeBytes: file.size,
    contents: await file.text(),
  });

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setBusy("reading");
    setError(null);
    setValidation(null);
    setImportResult(null);

    try {
      setSelectedFile(await readSelectedFile(file));
    } catch (caught) {
      setError(archiveError(caught));
    } finally {
      setBusy(null);
    }
  };

  const validate = async () => {
    if (!selectedFile) {
      return;
    }

    setBusy("validating");
    setError(null);
    try {
      setValidation(await apiClient.validateTweetsArchive(selectedFile));
      liveRegionRef.current?.focus();
    } catch (caught) {
      setError(archiveError(caught));
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    if (!selectedFile || validation?.status === "invalid") {
      return;
    }

    setBusy("importing");
    setError(null);
    try {
      const imported = await apiClient.importTweetsArchive({
        ...selectedFile,
        duplicatePolicy: "merge_update",
      });
      const [loadedOverview, loadedInsights] = await Promise.all([
        apiClient.getLatestArchiveImport(),
        apiClient.getLatestArchiveInsights(),
      ]);

      setImportResult(imported);
      setOverview(loadedOverview);
      setInsights(loadedInsights);
      liveRegionRef.current?.focus();
    } catch (caught) {
      setError(archiveError(caught));
    } finally {
      setBusy(null);
    }
  };

  const activate = async () => {
    setBusy("activating");
    setError(null);
    try {
      const activated = await apiClient.activateArchiveContext();
      setActiveContext(activated.activeContext);
      setInsights(await apiClient.getLatestArchiveInsights());
    } catch (caught) {
      setError(archiveError(caught));
    } finally {
      setBusy(null);
    }
  };

  const deactivate = async () => {
    setBusy("deactivating");
    setError(null);
    try {
      const deactivated = await apiClient.deactivateArchiveContext();
      setActiveContext(deactivated.activeContext);
    } catch (caught) {
      setError(archiveError(caught));
    } finally {
      setBusy(null);
    }
  };

  const canImport = validation?.status === "valid" || validation?.status === "partial";
  const canActivate = insights?.status === "ready" && insights.eligibility.eligible;

  if (busy === "loading" && overview === null && insights === null) {
    return (
      <EmptyState title="Archive import workspace">
        Loading local archive state.
      </EmptyState>
    );
  }

  return (
    <div className="xb-library-route">
      <p className="xb-library-live" ref={liveRegionRef} tabIndex={-1} role="status" aria-live="polite">
        {busy ? `Archive workflow is ${busy}.` : "Archive workflow is ready."}
      </p>

      {error ? (
        <Alert variant="danger" title="Archive action failed">
          {error.message}
        </Alert>
      ) : null}

      <section className="xb-library-section" aria-labelledby="library-picker-heading">
        <div className="xb-library-section__heading">
          <h2 id="library-picker-heading">Import archive</h2>
          {activeContext.status === "active" ? <StatusBadge status="active" /> : <StatusBadge status="empty" />}
        </div>
        <label className="xb-library-file">
          <span>Select extracted data/tweets.js</span>
          <input accept=".js" type="file" onChange={handleFileChange} />
        </label>
        {selectedFile ? (
          <p className="xb-library-copy">
            Selected {selectedFile.fileName} ({formatCount(selectedFile.fileSizeBytes)} bytes)
          </p>
        ) : (
          <p className="xb-library-copy">
            Use the extracted archive file at data/tweets.js. Zip files, folders, OAuth, media,
            deleted tweets, DMs, and X API sync are not part of this local v1 import.
          </p>
        )}
        <div className="xb-library-actions">
          <Button
            disabled={!selectedFile || busy !== null}
            loading={busy === "validating"}
            onClick={validate}
            variant="primary"
          >
            Validate
          </Button>
          <Button
            disabled={!canImport || busy !== null}
            loading={busy === "importing"}
            onClick={runImport}
            variant="secondary"
          >
            Import with merge
          </Button>
        </div>
      </section>

      {validation ? <ValidationSummary validation={validation} /> : null}

      {importResult ? (
        <section className="xb-library-section" aria-labelledby="library-import-heading">
          <div className="xb-library-section__heading">
            <h2 id="library-import-heading">Import summary</h2>
            <StatusBadge status={importResult.importRun.status} />
          </div>
          <div className="xb-library-metrics">
            <span>Inserted {formatCount(importResult.importRun.counts.insertedPosts)}</span>
            <span>Updated {formatCount(importResult.importRun.counts.updatedPosts)}</span>
            <span>Unchanged {formatCount(importResult.importRun.counts.unchangedPosts)}</span>
            <span>Skipped {formatCount(importResult.importRun.counts.skippedRecords)}</span>
          </div>
        </section>
      ) : overview?.status === "ready" ? (
        <section className="xb-library-section" aria-labelledby="library-existing-heading">
          <div className="xb-library-section__heading">
            <h2 id="library-existing-heading">Current library</h2>
            <Badge variant="info">{formatCount(overview.postCount)} posts</Badge>
          </div>
          <p className="xb-library-copy">Latest import {overview.latestImportRun.id}</p>
        </section>
      ) : null}

      <InsightsSummary insights={insights} />

      <section className="xb-library-section" aria-labelledby="library-context-heading">
        <div className="xb-library-section__heading">
          <h2 id="library-context-heading">Studio context</h2>
          <StatusBadge status={activeContext.status} />
        </div>
        {activeContext.status === "active" ? (
          <p className="xb-library-copy">
            {activeContext.provenance}, {activeContext.confidence} confidence,
            {" "}{formatCount(activeContext.counts.posts)} posts included.
          </p>
        ) : (
          <p className="xb-library-copy">No archive context is active in Studio.</p>
        )}
        <div className="xb-library-actions">
          <Button
            disabled={!canActivate || busy !== null}
            loading={busy === "activating"}
            onClick={activate}
            variant="primary"
          >
            Activate Studio context
          </Button>
          <Button
            disabled={activeContext.status !== "active" || busy !== null}
            loading={busy === "deactivating"}
            onClick={deactivate}
            variant="secondary"
          >
            Deactivate
          </Button>
          <Button onClick={onNavigateToWriter} variant="ghost">
            Open Studio
          </Button>
        </div>
      </section>
    </div>
  );
}
