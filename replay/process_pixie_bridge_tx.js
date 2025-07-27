import {getOldestUnprocessed, markAsProcessed} from './db.js';
import {callSignMintTokens} from "./endless.js";
import {callMarkAsExecuted, getLockTransactionDetail} from "./pixie.js";

async function startProcessingPendingLocks(intervalMs = 5000) {
    async function loop() {
        const pending = getOldestUnprocessed("pixie");
        if (pending) {
            console.log(`Processing pending tx: ${pending.hash} (ledger: ${pending.id})`);

            const lockDetail = await getLockTransactionDetail(pending.hash);
            if (lockDetail) {
                if (lockDetail.executed_by_tx !== "") {
                    markAsProcessed(pending.hash);
                    return;
                }

                const executedHash = await callSignMintTokens({...lockDetail});

                if (executedHash !== "") {
                    await callMarkAsExecuted({lockHash: pending.hash, executedHash});
                    markAsProcessed(pending.hash);
                }
            }
        } else {
            console.log('No pending transactions to process.');
        }
        setTimeout(loop, intervalMs);
    }

    await loop();
}

await startProcessingPendingLocks();
