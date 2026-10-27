---
version: 0.1.2
level: copilot
components:
  docs/api.md: auto
  docs/prd.md: copilot
  docs/prd-phase2.md: copilot
  docs/prd-phase3.md: copilot
  docs/trd.md: copilot
  docs/trd-phase2.md: copilot
  docs/trd-phase3.md: copilot
  docs/ui-lowfi: assist
processes:
  design: copilot
  documentation: auto
  implementation: copilot
  testing: none
  review: assist
---
This format is based on [AI-DECLARATION.md](https://ai-declaration.md/en/0.1.2).

本声明文件由 AI 辅助起草，内容基于人类提供的工作流描述；人类对声明事实的准确性负责。

## Notes

### 总体模式

- 人类掌握软件的整体技术架构、设计模式和产品方向，但不掌握源码细节实现方式；不逐行阅读源码，也不直接修改生产代码（少量 UI 细节除外）。
- AI 承担 PRD、TRD、UI 低保真后续修改、逆向 API 文档以及生产代码的实际编写与维护工作。
- 人类负责提供方向、回答 AI 的澄清、在冲突与架构不统一时做最终决策、验收 AI 输出，并通过测试发现问题。
- 人类对最终交付质量负责；所有 AI 输出均视为待验收产物，而非可直接信任的最终结果。

### 分阶段说明

**Design — copilot**

- **PRD**：人类先描述产品大致方向，AI 通过逐级提问深入每个细节，并最终写成 PRD 文档。AI 承担文档的实际撰写工作，人类负责规划方向、回答澄清并确认内容，符合 `copilot` 中“人类规划、AI 实现”的分工。
- **TRD**：AI 基于 PRD 和 UI 低保真生成 TRD。AI 就设计方向向人类提问澄清，具体数据模型由 AI 决定；人类只做大致审阅和高层确认，不深入源码级实现细节。该模式为 `copilot`。

**Documentation**

文档类工作存在多个级别，需分别理解：

- **UI 低保真 — assist**：初版由人类独立编写。后续所有更改均由 AI 执行，但要么是人类给出精确到细节的要求，要么是要求 AI 只生成特定部分并由人类完整过目后再写入。任务主导权和内部理解均在人类，AI 仅执行范围明确的子任务，因此为 `assist`，不是 `pair`。
- **逆向 API 文档 — auto**：文档完全由 AI 基于所提供的 HAR 和参考源码等分析资料生成与维护。AI 仅在资料不足时提出对特定 HAR 文件的精确需求，该行为属于执行过程中的必要输入请求，不涉及设计方向或实现决策的征询。人类不过目文档内容，仅在出现需要人工修复的 bug 时查阅相关章节。该模式为 `auto`。

**Implementation — copilot**

- 所有生产代码由 AI 基于 PRD、TRD、UI 低保真和 API 文档生成。人类清楚软件整体技术架构和设计模式，但不知道源码细节实现方式，不逐行审阅源码，也不直接修改代码（少量 UI 细节除外）。
- 当四份文档之间、或文档与人类提示词发生冲突时，AI 主动提问，由人类决策；AI 将修改同步至相关文档后再编写源码。
- AI 接收来自 Testing、Review 和 Debugging 环节的修复任务并执行代码修改：包括细节问题修复、架构问题修复、行为或架构不统一问题的统一实现，以及人类定位后的 bug 修复与重构。人类只验收结果，不阅读也不修改代码。
- 部分 bug 由人类调试定位根因并界定“改什么”和重构方向后，**重构与修复的全部实现由 AI 执行**；人类验收结果，不阅读、不逐行审阅重构源码。人类在 bug 相关局部具备较深理解，但未参与实现执行，贡献不对等，故该修复实现仍属 `copilot` 而非 `pair`。
- 少量 UI 细节由人类亲自修改代码，并同步至文档。这是 `implementation` 阶段内局部由人类亲自执行的例外，具有 `assist` 性质，不改变该阶段整体 `copilot` 的定性。
- 该阶段为 `copilot` 而非 `pair`：人类不掌握源码细节，不符合 `pair` 对“人类对内部实现有清晰理解”的要求；AI 承担整个编码任务，人类负责规划、澄清决策与验收。
- 该阶段为 `copilot` 而非 `auto`：AI 在文档冲突、架构不统一等节点会主动请求澄清，由人类拍板，并非在最少人类指导下自主完成至结束。

**Review — assist**

- 代码审查由人类执行。人类审查代码时发现行为或架构不统一，提出架构问题。
- AI 根据人类提出的问题给出若干统一方案，由人类做最终决策。
- 人类只验收结果，不阅读也不修改代码。
- 方案确定后的**修复实现**属于 `implementation` 阶段，不计入 `review`。

**Testing — none**

- 测试由人类亲自执行。人类通过测试发现细节问题和架构问题，提出问题和预期解决方向，并验收修复结果。
- AI 不参与测试用例设计、测试执行或测试结果分析。
- 测试中发现的问题，其**修复实现**属于 `implementation` 阶段，不计入 `testing`。

### 边界与维护

- 若未来 AI 在编码过程中开始自主决定架构方向，而不再请求人类决策，`implementation` 应向 `auto` 重新评估。
- 若 AI 在文档生成过程中就设计方向频繁征询人类意见并共同推演，相关文档阶段应向 `copilot` 或 `pair` 重新评估。
- 当工作流、工具或人机参与方式发生变化时，应更新本文件并提升版本号，确保声明与事实一致。