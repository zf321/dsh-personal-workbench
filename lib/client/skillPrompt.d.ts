/**
 * AI 会话提示词里的技能加载指令（纯函数，便于单测）。
 *
 * 设计取舍（见 docs/2026-09-09-ai-session-skill-selector.md）：
 * - **只注入"请加载这些技能"的指令，不内联技能正文** —— 正文由模型侧 `skill` 工具按需加载，
 *   避免每次会话都把多个技能正文塞进提示词（token 成本与上下文污染）。
 * - 未选择任何技能时返回空串，调用方据此保持提示词与既有版本逐字一致（零变化）。
 */
/** 技能加载指令块：为空时返回空串。 */
export declare function buildSkillPromptBlock(names: readonly string[]): string;
/** 把技能加载指令块拼接到提示词最前面（无技能时原样返回，保证零变化）。 */
export declare function withSkillPromptBlock(prompt: string, names: readonly string[]): string;
