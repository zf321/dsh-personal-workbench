import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { DatabaseSync } from 'node:sqlite';
export declare function makeDictionaryRoute(db: DatabaseSync): WebRoute;
