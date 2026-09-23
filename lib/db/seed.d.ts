/**
 * 出厂字典种子。INSERT OR IGNORE：首次安装写入，之后用户改名/停用不会被覆盖。
 */
import type { DatabaseSync } from 'node:sqlite';
export interface DictionarySeed {
    kind: string;
    code: string;
    name: string;
    config: Record<string, unknown>;
    sortOrder: number;
}
export declare const DICTIONARY_SEEDS: DictionarySeed[];
export declare function seedDictionaries(db: DatabaseSync, now?: string): void;
export interface McpServerSeed {
    /** 播种标记（meta 键；写入后视为已播过，无论用户后续如何改动该记录） */
    metaKey: string;
    name: string;
    url: string;
    sortOrder: number;
}
export declare const DEFAULT_MCP_SERVERS: McpServerSeed[];
/**
 * 首次打开库时播种平台预置 MCP 服务（默认库与每个用户库均执行）。
 * 幂等：meta 标记短路 + 同名/同 URL 查重（用户已自行配置过则不重复插入）。
 */
export declare function seedDefaultMcpServers(db: DatabaseSync, now?: string): void;
