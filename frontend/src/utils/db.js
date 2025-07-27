import {openDB} from "idb";

class TxDB {
    constructor(dbName) {
        this.dbName = dbName;
        this.dbPromise = this.initDB();
    }

    async initDB()  {
        return await openDB(this.dbName, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('txStore')) {
                    db.createObjectStore('txStore', {keyPath: 'hash'});
                }
            }
        });
    };

    async saveTxHash(hash) {
        const db = await this.dbPromise;
        await db.put('txStore', {...hash});
    };

    async loadTxHashes() {
        const db = await this.dbPromise;
        return await db.getAll('txStore');
    }
}

export {TxDB};