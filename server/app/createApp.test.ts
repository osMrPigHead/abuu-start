// @vitest-environment node
import { once } from "node:events";
import { request } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./createApp.ts";

let server: Server;
let origin: string;
let port: number;

beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  if (!server.listening) await once(server, "listening");

  const address = server.address() as AddressInfo;
  port = address.port;
  origin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  if (!server.listening) return;

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe("createApp", () => {
  it("保留 /api 健康检查", async () => {
    const response = await fetch(`${origin}/api/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("不再托管页面与静态资源", async () => {
    for (const path of ["/", "/index.html", "/assets/app.js", "/favicon.ico"]) {
      const response = await fetch(`${origin}${path}`);

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("text/plain");
      await expect(response.text()).resolves.toBe("未找到");
    }
  });

  it("未列出的 /api 返回 JSON 404", async () => {
    const response = await fetch(`${origin}/api/not-listed`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("非 GET/POST 方法返回 405", async () => {
    const response = await fetch(`${origin}/api/health`, { method: "PUT" });

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "METHOD_NOT_ALLOWED" },
    });
  });

  it("Host 不是本机地址时直接 404", async () => {
    const status = await rawStatus("/api/health", { host: "evil.example" });

    expect(status).toBe(404);
  });
});

function rawStatus(
  path: string,
  headers: Record<string, string>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port, path, headers },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );

    req.on("error", reject);
    req.end();
  });
}
