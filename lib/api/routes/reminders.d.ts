/**
 * 提醒域路由：策略读写、通道状态与目标选择、测试发送。
 * 从 routes.ts 抽出（行为不变），依赖由入口注入。
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { DatabaseSync } from 'node:sqlite';
export interface ReminderRouteDeps {
    /** 通道状态与目标选择（由入口注入；缺省时提醒相关接口返回未安装） */
    channel?: {
        status(): unknown;
        listOptions(): Promise<unknown>;
        resolveTarget(): Promise<unknown>;
    };
    /** 策略读写 */
    policy?: {
        read(): unknown;
        write(raw: unknown): unknown;
    };
    /** 发送测试消息（设置页用） */
    test?: () => Promise<{
        ok: boolean;
        reason?: string;
    }>;
    /** 到期提醒列表（prefix 路由用） */
    listDue?: () => unknown;
    /** 标记提醒已触发（prefix 路由用） */
    fire?: (reminderId: string) => void;
}
export declare function makeReminderRoutes(db: DatabaseSync, deps?: ReminderRouteDeps): WebRoute[];
