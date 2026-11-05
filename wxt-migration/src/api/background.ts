import type { BackgroundManifest } from "@shared/api";
import { relayUrl } from "./base";
import { postJson, request } from "./client";

/** 背景接口映射，见 docs/trd.md 3.3。 */
export function fetchBackgroundManifest(): Promise<BackgroundManifest> {
  return request<BackgroundManifest>("/api/background");
}

export function saveBackgroundDirectory(
  path: string,
): Promise<BackgroundManifest> {
  return postJson<BackgroundManifest>("/api/background/directory", { path });
}

export function rescanBackgroundDirectory(): Promise<BackgroundManifest> {
  return postJson<BackgroundManifest>("/api/background/rescan", {});
}

export function backgroundImageUrl(name: string): string {
  return relayUrl(`/api/background/image?name=${encodeURIComponent(name)}`);
}
