import Database from "better-sqlite3";
import * as fs from "node:fs";

const dbFile = 'pixie-bridge.db';
const dbExists = fs.existsSync(dbFile);
const db = new Database(dbFile);

if (!dbExists) {
    initDB();
}

function initDB() {
    db.exec(`CREATE TABLE IF NOT EXISTS lock_hashes
             (
                 id INTEGER,
                 hash TEXT UNIQUE,
                 processed BOOLEAN DEFAULT 0,
                 source TEXT DEFAULT ''
             )`);
}

export function saveLockHashesToDB(ledgerVersion, lockHashes, source) {
    const stmt = db.prepare('INSERT OR IGNORE INTO lock_hashes (id, hash, processed, source) VALUES (?, ?, 0, ?)');
    for (const hash of lockHashes) {
        const info = stmt.run(ledgerVersion, hash, source);
        // console.log(`Inserting hash=${hash}, changes=${info.changes}`);
    }
    console.log("Saved to SQLite DB");
}

export function getLastProcessedVersion(source, defaultVersion = 0) {
    const row = db.prepare("SELECT MAX(id) as maxId FROM lock_hashes WHERE source = ?").get(source);
    return row.maxId || defaultVersion;
}

export function getOldestUnprocessed(source) {
    return db.prepare(
        "SELECT * FROM lock_hashes WHERE processed = 0 and source = ? ORDER BY id ASC LIMIT 1"
    ).get(source);
}

export function markAsProcessed(hash) {
    const stmt = db.prepare("UPDATE lock_hashes SET processed = 1 WHERE hash = ?");
    stmt.run(hash);
}