import { getLastProcessedVersion} from './db.js';
import { getLatestLedger, getBridgeTx } from './endless.js';

async function startPollingLockTxFromEndless(intervalMs = 1000) {
    let ledgerVersion = getLastProcessedVersion("endless", 272659000);

    async function loop() {
        const latest = await getLatestLedger();
        const upperBound = latest - 300;

        let executed = 0;
        while (executed < 4) {
            if (ledgerVersion > upperBound) {
                console.log(`Waiting... current=${ledgerVersion}, upperBound=${upperBound}`);
                break;
            }

            try {
                await getBridgeTx(ledgerVersion);
            } catch (e) {
                console.error(`Error processing ledger ${ledgerVersion}:`, e);
            }
            ledgerVersion++;
            executed++;
        }

        setTimeout(loop, intervalMs);
    }

    await loop();
}

await startPollingLockTxFromEndless();
