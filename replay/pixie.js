import dotenv from "dotenv";
import { ethers } from "ethers";
import {RPC_URL, CONTRACT_ADDRESS, Bridge_Abi} from "./config.js"
import {convert} from "./utils.js";
import {saveLockHashesToDB} from "./db.js";

dotenv.config();

const privateKey = process.env.PIXIE_VALIDATOR_PRIVATE_KEY;
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(privateKey, provider);

const contract = new ethers.Contract(CONTRACT_ADDRESS, Bridge_Abi, signer);

export async function callSignUnlockTokens({txHash, endlessSender, amount, user, chainId, nonce}) {
    try {
        const tx = await contract.signUnlockTokens(
            txHash,
            convert(endlessSender),
            amount,
            user,
            chainId,
            nonce
        );
        console.log("callSignUnlockTokens Transaction sent:", tx.hash);
        await tx.wait();
        console.log("callSignUnlockTokens Transaction confirmed!");
        return tx.hash;
    } catch (error) {
        console.error("Error signing unlock:", error);
    }

    return "";
}

export async function callMarkAsExecuted({lockHash, executedByTx}) {
    try {
        const tx = await contract.markAsExecuted(
            lockHash,
            executedByTx
        );
        console.log("callMarkAsExecuted Transaction sent:", tx.hash);
        await tx.wait();
        console.log("callMarkAsExecuted Transaction confirmed!");
        return tx.hash;
    } catch (error) {
        console.error("Error signing unlock:", error);
    }

    return "";
}

export async function getLatestBlock() {
    return await provider.getBlockNumber();
}

export async function getLockTransactionDetail(lockHash) {
    try {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, Bridge_Abi, provider);
        const txData = await contract.lockTransactions(lockHash);

        const result = {
            tx_hash: lockHash,
            source_user_address: txData.user,
            amount: Number(txData.amount),
            target_user_address: txData.endlessAddress,
            timestamp: new Date(Number(txData.timestamp) * 1000).toLocaleString(),
            executed: txData.executed,
            nonce: Number(txData.nonce),
            executed_by_tx: txData.executedByTx,
            chain_id: Number(txData.chainId),
        };
        console.log("Transaction Detail:", result);
        return result;
    } catch (error) {
        console.error("Error signing unlock:", error);
        return null;
    }
}

export async function getTokensLockedEvents(fromBlock, toBlock) {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, Bridge_Abi, provider);
    console.log(`Searching TokensLocked events from block ${fromBlock} to ${toBlock}`);

    const filter = contract.filters.TokensLocked();
    const events = await contract.queryFilter(filter, fromBlock, toBlock);

    if (events.length === 0) {
        console.log("No TokensLocked events found.");
        return;
    }

    for (const event of events) {
        const { txHash } = event.args;
        saveLockHashesToDB(event.blockNumber, [txHash], "pixie");
    }
}

export function keccak256(source_address, amount, target_address, chainId, nonce) {
    return ethers.keccak256(
        ethers.solidityPacked(
            ["address", "uint256", "string", "uint256", "uint256"],
            [source_address, amount, target_address, chainId, nonce]
        )
    );
}

// await getLockTransactionDetail("0xa87835faebb8ecff0c1c12262fd72bbc6a8c680a09858a89b05a7d07186a0de8");
// await getTokensLockedEvents(41096871, 41131752);
// await callMarkAsExecuted({lockHash: "0xa87835faebb8ecff0c1c12262fd72bbc6a8c680a09858a89b05a7d07186a0de8", executedByTx: "DGZtiN7Z6XXZxVfNcNnDRigkzwHeVs19AHoizMbSz72q"})