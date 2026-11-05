import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

/**
 * 测试配置复用 WXT 的别名、Vue/Tailwind 插件与扩展 API 模拟。
 * 中继仍由根项目的 server/ 承载，这里只测前端。
 */
export default defineConfig({
  // WxtVitest 不会替测试环境加载 module-vue，组件测试需要显式挂 Vue 插件。
  plugins: [vue(), WxtVitest()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    testTimeout: 10_000,
  },
});
