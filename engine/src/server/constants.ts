import { homedir } from "node:os";
import { join } from "node:path";

export const defaultSettingsRoot = join(homedir(), ".x-builder", "engine-settings");
export const defaultEngineHost = "127.0.0.1";
export const defaultEnginePort = 4173;

export const defaultCorsAllowedOrigins = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
] as const;
