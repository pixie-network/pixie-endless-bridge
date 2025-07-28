import { getLastProcessedVersion} from './db.js';
import {getLatestBlock, getTokensLockedEvents} from "./pixie.js";

async function startPollingLockTxFromPixie(intervalMs = 1000) {
    let ledgerVersion = getLastProcessedVersion("pixie", 41149700);

    async function loop() {
        const latest = await getLatestBlock();
        const upperBound = latest - 50;
        const toBlock = ledgerVersion + 10;

        if (toBlock > upperBound) {
            console.log(`Waiting... current=${ledgerVersion}, upperBound=${upperBound}`);
            setTimeout(loop, intervalMs);
            return;
        }

        try {
            await getTokensLockedEvents(ledgerVersion, toBlock);
        } catch (e) {
            console.error(`Error processing ledger ${ledgerVersion}:`, e);
        }
        ledgerVersion = toBlock;
        setTimeout(loop, intervalMs);
    }

    await loop();
}

await startPollingLockTxFromPixie();
