/**
 * RunnerApp bootstrap: launches a persistent Chromium context, injects the
 * prebuilt overlay bundle once per document via `addInitScript`, wires the
 * (XOB-016) transport and (XOB-017) capture observer through injectable seams,
 * and navigates to x.com.
 *
 * Every collaborator `start()` touches is injectable through {@link RunnerAppOptions}
 * so the lifecycle can be tested with no real browser, engine services, or
 * network. The `bindTransport` / `attachObserver` defaults are deliberate NO-OPs
 * — XOB-016 and XOB-017 replace them — keeping this ticket zero-trace.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  JsonFileAppSettingsRepository,
  JsonFilePostLibraryRepository,
  LiveCaptureService,
} from "@x-builder/engine";
import { type BrowserContext } from "playwright";

import { BrowserController } from "./browser-controller.js";

const require = createRequire(import.meta.url);

/**
 * Structural surfaces of the Playwright Page/Context the bootstrap actually
 * touches. Typing the seams against these (rather than the full Playwright
 * interfaces) lets a real `BrowserContext` flow through unchanged while keeping
 * the launch/bind/observer seams injectable with lightweight fakes — the launch
 * mock returns a context-like object, not a full driver.
 */
export interface PageLike {
  goto(url: string): Promise<unknown>;
}

export interface BrowserContextLike {
  addInitScript(script: { content: string }): Promise<unknown> | unknown;
  pages(): PageLike[];
  newPage(): Promise<PageLike>;
  close(): Promise<unknown> | unknown;
}

/**
 * The in-process engine service bundle the runner hands to its seams. The runner
 * itself only touches `liveCapture` (the observer's onBatch forwards a captured
 * batch into `liveCapture.ingest`); XOB-016 binds the rest through the transport.
 * The production factory adds the readily-constructable repositories so XOB-016
 * has them to wire, but they are optional on the type so a test can inject a
 * minimal `{ liveCapture }` bundle.
 */
export interface LiveCaptureLike {
  ingest(batch: unknown): unknown;
}

export interface EngineServices {
  liveCapture: LiveCaptureLike;
  settingsRepository?: JsonFileAppSettingsRepository;
  postLibraryRepository?: JsonFilePostLibraryRepository;
}

export interface RunnerAppOptions {
  engineSettingsDir?: string;
  browserProfileDir?: string;
  overlayBundlePath?: string;
  services?: EngineServices;
  createServices?: (opts: { engineSettingsDir: string }) => EngineServices;
  launchBrowser?: (opts: {
    userDataDir: string;
    channel: "chromium";
  }) => Promise<BrowserContextLike>;
  bindTransport?: (page: PageLike, services: EngineServices) => void | Promise<void>;
  attachObserver?: (
    context: BrowserContextLike,
    onBatch: (batch: unknown) => unknown,
  ) => void | Promise<void>;
}

/**
 * Thrown when the overlay bundle file cannot be found — the `@x-builder/overlay`
 * package has not been built. Surfaced before any browser binding or navigation
 * so the failure is unambiguous and side-effect free.
 */
export class OverlayBundleNotFoundError extends Error {
  constructor(bundlePath: string) {
    super(
      `Overlay bundle not found at ${bundlePath}. Build @x-builder/overlay first (pnpm -F @x-builder/overlay build).`,
    );
    this.name = "OverlayBundleNotFoundError";
  }
}

const defaultEngineSettingsDir = (): string => join(homedir(), ".x-builder", "engine-settings");
const defaultBrowserProfileDir = (): string => join(homedir(), ".x-builder", "browser-profile");
const defaultOverlayBundlePath = (): string =>
  require.resolve("@x-builder/overlay/dist/overlay.iife.js");

// Production service construction. The runner consumes engine services in-process
// (no HTTP). Only the slice the runner needs is built here; the full transport
// bundle is XOB-016's concern.
const defaultCreateServices = (opts: { engineSettingsDir: string }): EngineServices => {
  const settingsRepository = new JsonFileAppSettingsRepository({ root: opts.engineSettingsDir });
  const postLibraryRepository = new JsonFilePostLibraryRepository({
    root: join(opts.engineSettingsDir, "storage"),
  });
  const liveCapture = new LiveCaptureService(postLibraryRepository);

  return { liveCapture, settingsRepository, postLibraryRepository };
};

export class RunnerApp {
  private readonly engineSettingsDir: string;
  private readonly browserProfileDir: string;
  private readonly overlayBundlePath: string;
  private readonly injectedServices?: EngineServices;
  private readonly createServices: (opts: { engineSettingsDir: string }) => EngineServices;
  private readonly launchBrowser: (opts: {
    userDataDir: string;
    channel: "chromium";
  }) => Promise<BrowserContextLike>;
  private readonly bindTransport: (
    page: PageLike,
    services: EngineServices,
  ) => void | Promise<void>;
  private readonly attachObserver: (
    context: BrowserContextLike,
    onBatch: (batch: unknown) => unknown,
  ) => void | Promise<void>;

  private started = false;
  private context?: BrowserContextLike;
  private page?: PageLike;

  constructor(options: RunnerAppOptions = {}) {
    this.engineSettingsDir = options.engineSettingsDir ?? defaultEngineSettingsDir();
    this.browserProfileDir = options.browserProfileDir ?? defaultBrowserProfileDir();
    this.overlayBundlePath = options.overlayBundlePath ?? defaultOverlayBundlePath();
    this.injectedServices = options.services;
    this.createServices = options.createServices ?? defaultCreateServices;
    this.launchBrowser = options.launchBrowser ?? ((opts) => BrowserController.launch(opts));
    // XOB-016 / XOB-017 replace these NO-OP defaults.
    this.bindTransport = options.bindTransport ?? (() => undefined);
    this.attachObserver = options.attachObserver ?? (() => undefined);
  }

  async start(): Promise<void> {
    // Guard re-entry: a second start() without an intervening stop() must not
    // launch a second context.
    if (this.started) {
      return;
    }
    this.started = true;

    const services =
      this.injectedServices ?? this.createServices({ engineSettingsDir: this.engineSettingsDir });

    this.context = await this.launchBrowser({
      userDataDir: this.browserProfileDir,
      channel: "chromium",
    });

    // Read the overlay bundle before addInitScript/bind/observer/goto. A missing
    // bundle throws here, so none of those downstream steps run.
    if (!existsSync(this.overlayBundlePath)) {
      throw new OverlayBundleNotFoundError(this.overlayBundlePath);
    }
    const overlayBundle = readFileSync(this.overlayBundlePath, "utf-8");

    await this.context.addInitScript({ content: overlayBundle });

    this.page = this.context.pages()[0] ?? (await this.context.newPage());

    await this.bindTransport(this.page, services);
    await this.attachObserver(this.context, (batch) => services.liveCapture.ingest(batch));

    await this.page.goto("https://x.com");

    console.log("[x-builder] Ready — x.com loaded with overlay.");
  }

  async stop(): Promise<void> {
    await this.context?.close();
    this.context = undefined;
    this.page = undefined;
    this.started = false;
  }
}
