/**
 * 读取 dsh-im 微信机器人的入站消息计数，用于探测"发送能力是否恢复"。
 *
 * 为什么需要：2026-09-09 真机实测显示，iLink 拒发后**静置不会自动恢复**，
 * 但接收者给机器人发一条消息会立即恢复。所以"入站计数增长"是唯一可靠的恢复信号。
 *
 * 实现说明：dsh-im 把 RPC 注册为 DSH connection 的 exact fetch route
 * （路径 `/api/dsh-im/weixin`），可在 host 进程内直接调用，绕过浏览器签名 Cookie。
 * 未安装 dsh-im 时路由不存在，返回 null，调用方按"无信号"处理。
 */
import type { Context } from '@deepseek-ai/cordis';
/** 返回所有微信机器人的 messagesReceived 之和；不可用时返回 null。 */
export declare function readWeixinInboundCount(ctx: Context): Promise<number | null>;
