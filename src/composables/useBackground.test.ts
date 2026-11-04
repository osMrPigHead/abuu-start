import { describe, expect, it, vi } from "vitest";
import type { BackgroundManifest } from "@shared/api";

vi.mock("@/api/background", () => ({
  fetchBackgroundManifest: vi.fn(),
  saveBackgroundDirectory: vi.fn(),
  rescanBackgroundDirectory: vi.fn(),
  backgroundImageUrl: (name: string) =>
    `/api/background/image?name=${encodeURIComponent(name)}`,
}));

const manifest: BackgroundManifest = {
  directory: "D:\\wallpapers",
  configured: true,
  images: [
    { name: "a.jpg", size: 1024, modifiedAt: "2026-03-01T00:00:00.000Z" },
    { name: "b.jpg", size: 2048, modifiedAt: "2026-03-02T00:00:00.000Z" },
  ],
  warning: null,
};

/** 模块级单例，每个用例都要重新导入。 */
async function loadBackground() {
  vi.resetModules();
  const [composable, api] = await Promise.all([
    import("@/composables/useBackground"),
    import("@/api/background"),
  ]);
  return {
    useBackground: composable.useBackground,
    fetchManifest: vi.mocked(api.fetchBackgroundManifest),
  };
}

describe("useBackground.hydrate", () => {
  it("应用启动后重复调用只请求一次清单", async () => {
    const { useBackground, fetchManifest } = await loadBackground();
    fetchManifest.mockResolvedValue(manifest);

    const background = useBackground();
    await background.hydrate();
    await background.hydrate();

    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(background.state.hydrated).toBe(true);
    expect(background.state.directory).toBe("D:\\wallpapers");
  });

  it("重复调用不重新随机选图，同一会话共用一张", async () => {
    const { useBackground, fetchManifest } = await loadBackground();
    fetchManifest.mockResolvedValue(manifest);

    const background = useBackground();
    await background.hydrate();
    const selected = background.state.selectedName;

    await background.hydrate();

    expect(selected).not.toBeNull();
    expect(background.state.selectedName).toBe(selected);
  });

  it("清单失败后标记已 hydrate 且不自动重试", async () => {
    const { useBackground, fetchManifest } = await loadBackground();
    fetchManifest.mockRejectedValue(new Error("relay down"));

    const background = useBackground();
    await background.hydrate();

    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(background.state.hydrated).toBe(true);
    expect(background.state.configured).toBe(false);
    expect(background.state.fallback).toBe(true);
    expect(background.state.warning).toBeTruthy();

    await background.hydrate();
    expect(fetchManifest).toHaveBeenCalledTimes(1);
  });
});
