import type { DatabaseSync } from 'node:sqlite';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { type ReminderRouteDeps } from './routes/reminders.js';
export declare function makeRoutes(db: DatabaseSync, deps?: ReminderRouteDeps): WebRoute[];
