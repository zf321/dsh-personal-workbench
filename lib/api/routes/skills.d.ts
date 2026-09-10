/**
 * /api/workbench/skills —— DSH 技能目录（只读）。
 *
 * 供工作台前端在 AI 执行/协助/拆解/复盘等会话前的提示词输入区渲染可多选、可搜索的
 * Skill 列表。列表来自宿主 skills 注册表（软探测），**未安装时返回空列表 + available:false**，
 * 前端据此隐藏选择器 —— 保证"未选技能时行为与既有版本完全一致"这条底线。
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { type SkillsService } from '../skills.js';
export declare const SKILLS_PATH = "/api/workbench/skills";
export interface SkillRouteDeps {
    /** 每次请求实时探测，避免缓存"宿主稍后才注册服务"的早期快照 */
    probe: () => SkillsService | undefined;
}
export declare function makeSkillRoutes(deps: SkillRouteDeps): WebRoute[];
