/**
 * 工具层租户路由：agent 工具执行不在 HTTP 请求链路里（没有 token），
 * 用会话 header 的 cwd 反查用户，把该次工具执行的库调用路由到其用户库。
 *
 * 用 run（而非 enterWith）建立独立作用域：包装后的 execute 在同步段就会
 * 调用路由，此刻 enterWith 改写的是「调用方（agent 框架）当前的执行帧」，
 * 会把用户库上下文泄漏进框架续体；run 新建上下文，作用域只覆盖工具执行
 * 自身及其 async 续体（test/tenant.test.mjs 有该语义的回归测试）。
 */
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
/**
 * 包装工具：执行前按会话 cwd 路由到用户库上下文。
 * 会话 cwd 匹配不到用户（单机/回环/管理员会话）时保持原行为（默认库）。
 */
export declare function withTenantRouting(tool: ToolDefinition): ToolDefinition;
