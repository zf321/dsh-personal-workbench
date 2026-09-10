export function readMeta(db, key) {
    return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value;
}
export function writeMeta(db, key, value) {
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
