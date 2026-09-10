import { DatabaseSync } from 'node:sqlite';
export interface WorkbenchDbConfig {
    /** 数据目录；缺省 ~/.dsh/workbench */
    dataDir?: string;
    /** 数据库文件绝对路径；优先于 dataDir */
    dbPath?: string;
}
export declare function defaultDbPath(): string;
export declare function migrate(db: DatabaseSync): void;
export declare function openWorkbenchDb(config?: WorkbenchDbConfig): DatabaseSync;
