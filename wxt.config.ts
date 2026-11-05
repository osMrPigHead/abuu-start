import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

/**
 * 航启的 WXT 扩展工程。
 * - src/ 保存从根项目迁移过来的 Vue SPA，入口在 src/entrypoints/newtab；
 * - shared/ 不复制，继续引用仓库根目录，保证前端与本地中继使用同一份契约；
 * - 本地中继固定监听 127.0.0.1:3000，WXT 开发服务器改用 4000 避免端口冲突。
 */
export default defineConfig({
  srcDir: "src",
  // 迁移过来的代码全部使用显式导入；关闭自动导入避免同名类型被重复注入。
  imports: false,
  modules: ["@wxt-dev/module-vue"],
  alias: {
    "@shared": resolve("shared"),
  },
  manifest: {
    name: "航启",
    short_name: "航启",
    description: "航启首页 · abuu-start · 更适合北航宝宝体质的浏览器启动页",
    permissions: ["notifications"],
    host_permissions: ["http://127.0.0.1/*", "http://localhost/*"],
  },
  dev: {
    server: {
      port: 4000,
      origin: "http://localhost:4000",
      strictPort: true,
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
