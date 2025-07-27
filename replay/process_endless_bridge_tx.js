import {getOldestUnprocessed, markAsProcessed} from './db.js';
import {getLockTransactionDetail, setLockTransactionExecuted} from "./endless.js";
import {callSignUnlockTokens} from "./pixie.js";

async function startProcessingPendingLocks(intervalMs = 5000) {
    async function loop() {
        const pending = getOldestUnprocessed("endless");
        if (pending) {
            console.log(`Processing pending tx: ${pending.hash} (ledger: ${pending.id})`);

            const lockDetail = await getLockTransactionDetail(pending.hash);
            if (lockDetail && lockDetail.length > 0) {
                const detail = lockDetail[0];
                if (detail.executed_by_tx !== "") {
                    markAsProcessed(pending.hash);
                    return;
                }

                const executedHash = await callSignUnlockTokens({
                    txHash: pending.hash,
                    endlessSender: detail.user,
                    amount: detail.amount,
                    user: detail.pixie_address,
                    chainId: detail.chain_id,
                    nonce: detail.nonce,
                })

                if (executedHash !== "") {
                    await setLockTransactionExecuted(pending.hash, executedHash);
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
