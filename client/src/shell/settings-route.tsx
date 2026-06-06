import {
  useEffect,
  useState,
  type ChangeEvent,
  type ReactElement,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  ApiError,
  AppSettings,
  AppSettingsResponse,
  AppStatus,
  RouteConfig,
  SubsystemStatus,
} from "@x-builder/shared";

import { ApiClientError } from "../api/engine-api-client";
import { Alert, Badge } from "../ui/foundation";

type TextSettingsFieldName = Extract<
  keyof AppSettings,
  "codexCommandLabel" | "engineBaseUrl" | "storagePath"
>;

type SwitchSettingsFieldName = Extract<
  keyof AppSettings,
  "runCodexJudgeAfterGeneration" | "showDeterministicDetails"
>;

export type SettingsRouteApiClient = {
  getSettings: () => Promise<AppSettingsResponse>;
  getStatus: () => Promise<AppStatus>;
  saveSettings: (settings: AppSettings) => Promise<AppSettingsResponse>;
};

export type SettingsRouteProps = {
  apiClient: SettingsRouteApiClient;
  openedFrom?: RouteConfig["id"];
  onNavigateToWriter?: () => void;
  onStatusRefresh?: (status: AppStatus) => void;
};

type SettingsRouteInternalProps = SettingsRouteProps & {
  initialModel?: SettingsRouteModel;
};

export type SettingsRoutePublicDriverOptions = SettingsRouteProps & {
  renderRoute?: (props: SettingsRouteProps) => ReactElement;
};

export type SettingsRoutePublicDriver = {
  backToWriter: () => string;
  discardUnsavedNavigation: () => string;
  load: () => Promise<string>;
  save: () => Promise<string>;
  stayOnSettings: () => string;
  testReadiness: () => Promise<string>;
  updateField: (field: TextSettingsFieldName, value: string) => string;
  updateSwitch: (field: SwitchSettingsFieldName, value: boolean) => string;
  warnBeforeNavigateAway: (to: RouteConfig["path"]) => string;
};

type SettingsRouteModel = {
  draft: AppSettings;
  engineUrlError: string | null;
  error: ApiError | null;
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  lastReadiness: AppStatus | null;
  pendingNavigationPath: RouteConfig["path"] | null;
  saved: AppSettings;
  source: AppSettingsResponse["source"];
  successMessage: string | null;
};

const defaultSettings: AppSettings = {
  codexCommandLabel: "Codex judge",
  engineBaseUrl: "http://127.0.0.1:4173",
  runCodexJudgeAfterGeneration: false,
  showDeterministicDetails: true,
  storagePath: "~/.x-builder",
};

const localEngineUrlError = "Enter a valid local engine URL.";
const dirtyReadinessHelper = "Save settings before testing readiness.";

function createInitialModel(): SettingsRouteModel {
  return {
    draft: defaultSettings,
    engineUrlError: null,
    error: null,
    isLoading: true,
    isSaving: false,
    isTesting: false,
    lastReadiness: null,
    pendingNavigationPath: null,
    saved: defaultSettings,
    source: "defaults",
    successMessage: null,
  };
}

function modelFromResponse(response: AppSettingsResponse): SettingsRouteModel {
  return {
    ...createInitialModel(),
    draft: response.settings,
    isLoading: false,
    saved: response.settings,
    source: response.source,
  };
}

function settingsEqual(left: AppSettings, right: AppSettings): boolean {
  return (
    left.codexCommandLabel === right.codexCommandLabel &&
    left.engineBaseUrl === right.engineBaseUrl &&
    left.runCodexJudgeAfterGeneration === right.runCodexJudgeAfterGeneration &&
    left.showDeterministicDetails === right.showDeterministicDetails &&
    left.storagePath === right.storagePath
  );
}

function isLocalEngineUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function normalizeSettingsError(error: unknown, fallback: ApiError): ApiError {
  if (error instanceof ApiClientError) {
    return error.apiError;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "apiError" in error &&
    typeof error.apiError === "object" &&
    error.apiError !== null
  ) {
    return error.apiError as ApiError;
  }

  return fallback;
}

function settingsLoadError(): ApiError {
  return {
    code: "settings_load_failed",
    message: "Settings could not be loaded. Try again.",
    retryable: true,
    scope: "settings",
    status: 500,
  };
}

function settingsPersistError(): ApiError {
  return {
    code: "settings_persist_failed",
    message: "Settings could not be saved. Your edits are still here.",
    retryable: true,
    scope: "settings",
    status: 500,
  };
}

function statusError(): ApiError {
  return {
    code: "status_unavailable",
    message: "Readiness could not be checked. Try again.",
    retryable: true,
    scope: "status",
    status: 503,
  };
}

function withValidatedEngineUrl(model: SettingsRouteModel): SettingsRouteModel {
  return {
    ...model,
    engineUrlError: isLocalEngineUrl(model.draft.engineBaseUrl)
      ? null
      : localEngineUrlError,
  };
}

function updateTextField(
  model: SettingsRouteModel,
  field: TextSettingsFieldName,
  value: string,
): SettingsRouteModel {
  const nextModel = {
    ...model,
    draft: {
      ...model.draft,
      [field]: value,
    },
    error: null,
    pendingNavigationPath: null,
    successMessage: null,
  };

  if (field !== "engineBaseUrl") {
    return nextModel;
  }

  return withValidatedEngineUrl(nextModel);
}

function updateSwitchField(
  model: SettingsRouteModel,
  field: SwitchSettingsFieldName,
  value: boolean,
): SettingsRouteModel {
  return {
    ...model,
    draft: {
      ...model.draft,
      [field]: value,
    },
    error: null,
    pendingNavigationPath: null,
    successMessage: null,
  };
}

function isDirty(model: SettingsRouteModel): boolean {
  return !settingsEqual(model.draft, model.saved);
}

function sourceLabel(source: AppSettingsResponse["source"]): string {
  return source === "defaults" ? "Using defaults" : "Persisted settings";
}

function buttonClassName(variant: "primary" | "secondary" | "ghost" | "danger") {
  return `xb-button xb-button--${variant} xb-button--md`;
}

function fieldId(field: keyof AppSettings): string {
  return `settings-${field}`;
}

function renderTextField({
  error,
  label,
  name,
  onChange,
  value,
}: {
  error?: string | null;
  label: string;
  name: TextSettingsFieldName;
  onChange: (field: TextSettingsFieldName, value: string) => void;
  value: string;
}): ReactElement {
  const id = fieldId(name);
  const errorId = `${id}-error`;

  return (
    <label className="xb-settings-route__field" htmlFor={id}>
      <span className="xb-settings-route__label">{label}</span>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        id={id}
        name={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(name, event.target.value);
        }}
        type="text"
        value={value}
      />
      {error ? (
        <span className="xb-settings-route__field-error" id={errorId}>
          {error}
        </span>
      ) : null}
    </label>
  );
}

function renderSwitch({
  checked,
  label,
  name,
  onChange,
}: {
  checked: boolean;
  label: string;
  name: SwitchSettingsFieldName;
  onChange: (field: SwitchSettingsFieldName, value: boolean) => void;
}): ReactElement {
  const id = fieldId(name);

  return (
    <label className="xb-settings-route__switch" htmlFor={id}>
      <span className="xb-settings-route__switch-label">{label}</span>
      <input
        checked={checked}
        id={id}
        name={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(name, event.target.checked);
        }}
        type="checkbox"
      />
    </label>
  );
}

function orderedSwitches(settings: AppSettings) {
  return [
    {
      checked: settings.runCodexJudgeAfterGeneration,
      label: "Run Codex judge after generation",
      name: "runCodexJudgeAfterGeneration" as const,
    },
    {
      checked: settings.showDeterministicDetails,
      label: "Show deterministic details",
      name: "showDeterministicDetails" as const,
    },
  ].sort((left, right) => Number(right.checked) - Number(left.checked));
}

function readinessItems(status: AppStatus): SubsystemStatus[] {
  return [status.engine, status.storage, status.codex, status.deterministic];
}

function SettingsRouteView({
  model,
  onBackToWriter,
  onDiscardNavigation,
  onSave,
  onStayOnSettings,
  onTestReadiness,
  onUpdateField,
  onUpdateSwitch,
}: {
  model: SettingsRouteModel;
  onBackToWriter: () => void;
  onDiscardNavigation: () => void;
  onSave: () => void;
  onStayOnSettings: () => void;
  onTestReadiness: () => void;
  onUpdateField: (field: TextSettingsFieldName, value: string) => void;
  onUpdateSwitch: (field: SwitchSettingsFieldName, value: boolean) => void;
}): ReactElement {
  const dirty = isDirty(model);
  const canSave = dirty && model.engineUrlError === null && !model.isSaving;
  const canTestReadiness = !dirty && !model.isTesting && !model.isLoading;

  return (
    <section className="xb-settings-route">
      <div className="xb-settings-route__header">
        <div className="xb-settings-route__heading">
          <h2>Settings</h2>
          <div className="xb-settings-route__meta">
            <Badge variant={model.source === "defaults" ? "warning" : "success"}>
              {sourceLabel(model.source)}
            </Badge>
            {dirty ? <Badge variant="warning">Unsaved changes</Badge> : null}
            {model.successMessage ? (
              <Badge variant="success">{model.successMessage}</Badge>
            ) : null}
          </div>
        </div>
        <button
          className={buttonClassName("ghost")}
          onClick={onBackToWriter}
          type="button"
        >
          Back to Writer
        </button>
      </div>

      {model.error ? (
        <Alert
          recovery={
            model.error.retryable ? (
              <button
                className={buttonClassName("secondary")}
                onClick={onSave}
                type="button"
              >
                Retry save
              </button>
            ) : null
          }
          title="Settings unavailable"
          variant="danger"
        >
          {model.error.message}
        </Alert>
      ) : null}

      {model.pendingNavigationPath ? (
        <Alert
          recovery={
            <>
              <button
                className={buttonClassName("secondary")}
                onClick={onStayOnSettings}
                type="button"
              >
                Stay on Settings
              </button>
              <button
                className={buttonClassName("danger")}
                onClick={onDiscardNavigation}
                type="button"
              >
                Discard changes
              </button>
            </>
          }
          title="You have unsaved settings changes."
          variant="warning"
        >
          Save or discard them before leaving.
        </Alert>
      ) : null}

      <div className="xb-settings-route__form" aria-busy={model.isLoading}>
        {renderTextField({
          error: model.engineUrlError,
          label: "Engine URL",
          name: "engineBaseUrl",
          onChange: onUpdateField,
          value: model.draft.engineBaseUrl,
        })}
        {renderTextField({
          label: "Storage path",
          name: "storagePath",
          onChange: onUpdateField,
          value: model.draft.storagePath,
        })}
        {renderTextField({
          label: "Codex command label",
          name: "codexCommandLabel",
          onChange: onUpdateField,
          value: model.draft.codexCommandLabel,
        })}

        <div className="xb-settings-route__switches">
          {orderedSwitches(model.draft).map((switchConfig) =>
            <div key={switchConfig.name}>
              {renderSwitch({
                ...switchConfig,
                onChange: onUpdateSwitch,
              })}
            </div>,
          )}
        </div>
      </div>

      <div className="xb-settings-route__actions">
        <button
          className={buttonClassName("primary")}
          disabled={!canSave}
          onClick={onSave}
          type="button"
        >
          Save settings
        </button>
        <button
          className={buttonClassName("secondary")}
          disabled={!canTestReadiness}
          onClick={onTestReadiness}
          type="button"
        >
          Test readiness
        </button>
        {dirty ? (
          <span className="xb-settings-route__helper">
            {dirtyReadinessHelper}
          </span>
        ) : null}
      </div>

      {model.lastReadiness ? (
        <div className="xb-settings-route__readiness" aria-live="polite">
          {readinessItems(model.lastReadiness).map((item) => (
            <Badge
              key={item.label}
              variant={item.state === "ready" ? "success" : "warning"}
            >
              {item.label} {item.state}
            </Badge>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function SettingsRoute({
  apiClient,
  initialModel,
  onNavigateToWriter,
  onStatusRefresh,
}: SettingsRouteInternalProps): ReactElement {
  const [model, setModel] = useState(initialModel ?? createInitialModel);

  useEffect(() => {
    if (initialModel !== undefined) {
      return;
    }

    let cancelled = false;

    async function loadSettings() {
      try {
        const response = await apiClient.getSettings();

        if (!cancelled) {
          setModel(modelFromResponse(response));
        }
      } catch (error) {
        if (!cancelled) {
          setModel({
            ...createInitialModel(),
            error: normalizeSettingsError(error, settingsLoadError()),
            isLoading: false,
          });
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [apiClient, initialModel]);

  const handleSave = async () => {
    setModel((current) => withValidatedEngineUrl({ ...current, isSaving: true }));

    if (!isLocalEngineUrl(model.draft.engineBaseUrl)) {
      setModel((current) => ({
        ...withValidatedEngineUrl(current),
        isSaving: false,
      }));
      return;
    }

    try {
      const response = await apiClient.saveSettings(model.draft);
      const status = await apiClient.getStatus();
      onStatusRefresh?.(status);
      setModel({
        ...modelFromResponse(response),
        lastReadiness: status,
        successMessage: "Settings saved",
      });
    } catch (error) {
      setModel((current) => ({
        ...current,
        error: normalizeSettingsError(error, settingsPersistError()),
        isSaving: false,
      }));
    }
  };

  const handleTestReadiness = async () => {
    if (isDirty(model)) {
      return;
    }

    setModel((current) => ({ ...current, error: null, isTesting: true }));

    try {
      const status = await apiClient.getStatus();
      onStatusRefresh?.(status);
      setModel((current) => ({
        ...current,
        isTesting: false,
        lastReadiness: status,
      }));
    } catch (error) {
      setModel((current) => ({
        ...current,
        error: normalizeSettingsError(error, statusError()),
        isTesting: false,
      }));
    }
  };

  return (
    <SettingsRouteView
      model={model}
      onBackToWriter={() => {
        onNavigateToWriter?.();
      }}
      onDiscardNavigation={() => {
        onNavigateToWriter?.();
      }}
      onSave={() => {
        void handleSave();
      }}
      onStayOnSettings={() => {
        setModel((current) => ({ ...current, pendingNavigationPath: null }));
      }}
      onTestReadiness={() => {
        void handleTestReadiness();
      }}
      onUpdateField={(field, value) => {
        setModel((current) => updateTextField(current, field, value));
      }}
      onUpdateSwitch={(field, value) => {
        setModel((current) => updateSwitchField(current, field, value));
      }}
    />
  );
}

function renderDriverRoute(
  options: SettingsRoutePublicDriverOptions,
  model: SettingsRouteModel,
): string {
  const renderRoute = options.renderRoute ?? SettingsRoute;
  const RouteComponent = renderRoute;
  const props = {
    apiClient: options.apiClient,
    initialModel: model,
    openedFrom: options.openedFrom,
    onNavigateToWriter: options.onNavigateToWriter,
    onStatusRefresh: options.onStatusRefresh,
  };

  return renderToStaticMarkup(
    <RouteComponent {...(props as SettingsRouteProps)} />,
  );
}

export function createSettingsRoutePublicDriver(
  options: SettingsRoutePublicDriverOptions,
): SettingsRoutePublicDriver {
  let model = createInitialModel();
  let pendingNavigationPath: RouteConfig["path"] | null = null;

  const render = () => renderDriverRoute(options, {
    ...model,
    pendingNavigationPath,
  });

  return {
    backToWriter: () => {
      options.onNavigateToWriter?.();
      return render();
    },
    discardUnsavedNavigation: () => {
      if (pendingNavigationPath === "/writer") {
        options.onNavigateToWriter?.();
      }

      pendingNavigationPath = null;
      return render();
    },
    load: async () => {
      const response = await options.apiClient.getSettings();
      model = modelFromResponse(response);
      return render();
    },
    save: async () => {
      model = withValidatedEngineUrl(model);

      if (model.engineUrlError !== null) {
        return render();
      }

      try {
        const response = await options.apiClient.saveSettings(model.draft);
        const status = await options.apiClient.getStatus();
        options.onStatusRefresh?.(status);
        model = {
          ...modelFromResponse(response),
          lastReadiness: status,
          successMessage: "Settings saved",
        };
      } catch (error) {
        model = {
          ...model,
          error: normalizeSettingsError(error, settingsPersistError()),
        };
      }

      return render();
    },
    stayOnSettings: () => {
      pendingNavigationPath = null;
      return render();
    },
    testReadiness: async () => {
      if (isDirty(model)) {
        return render();
      }

      try {
        const status = await options.apiClient.getStatus();
        options.onStatusRefresh?.(status);
        model = {
          ...model,
          error: null,
          lastReadiness: status,
        };
      } catch (error) {
        model = {
          ...model,
          error: normalizeSettingsError(error, statusError()),
        };
      }

      return render();
    },
    updateField: (field, value) => {
      model = updateTextField(model, field, value);
      return render();
    },
    updateSwitch: (field, value) => {
      model = updateSwitchField(model, field, value);
      return render();
    },
    warnBeforeNavigateAway: (to) => {
      if (isDirty(model)) {
        pendingNavigationPath = to;
      }

      return render();
    },
  };
}
