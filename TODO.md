# RC 发布前 TODO

> 来源：开发版实机验收后的文档保留项确认。已完成项已从文档删除；以下为决定在 RC 发布前处理的事项。

## 1. 固定扩展 ID 并收紧中继来源白名单

- [ ] Chrome/Edge：在 `wxt.config.ts` 的 manifest 中配置固定 `key`，使扩展 ID 稳定。
- [ ] Firefox：配置 `browser_specific_settings.gecko.id`，固定扩展 ID。
- [ ] 中继：在 `server/app/relayHttp.ts` 的来源校验中维护允许的扩展 ID 白名单，替代当前“任意 `chrome-extension://` / `moz-extension://` 来源放行”。
- [ ] 测试：补充 `server/app/relayHttp.test.ts` 用例，覆盖允许的 Chrome/Firefox 扩展 ID、其他扩展 ID 拒绝，以及 loopback 普通网页同源规则不变。
- [ ] 文档：完成后更新 `docs/trd.md` §9 与 §12，移除对应风险说明。
- [ ] 验收：重启中继后，Chrome/Edge 与 Firefox 均可正常取数，其他扩展来源的 `POST` 被拒绝。

关联文档：`docs/trd.md` §9、§12。
