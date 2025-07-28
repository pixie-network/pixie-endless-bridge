import dotenv from "dotenv";
import {
    Account,
    Ed25519PrivateKey,
    Endless,
    EndlessConfig,
    generateRawTransaction,
    generateTransactionPayloadWithABI,
    Network,
    parseTypeTag,
    SimpleTransaction,
    TypeTagAddress,
    TypeTagU256,
} from "@endlesslab/endless-ts-sdk";
import {Package_Address} from "./config.js";
import {saveLockHashesToDB} from "./db.js";

dotenv.config();

const config = new EndlessConfig({network: Network.TESTNET});
const endless = new Endless(config);

const privateKey = new Ed25519PrivateKey(process.env.ENDLESS_VALIDATOR_PRIVATE_KEY);
const validator = Account.fromPrivateKey({privateKey});

export async function getLatestLedger() {
    const ledgerInfo = await endless.getLedgerInfo();
    return ledgerInfo.ledger_version;
}

export async function getBridgeTx(ledgerVersion) {
    const tx = await endless.getTransactionByVersion({ledgerVersion: ledgerVersion});
    const {payload, events} = tx;

    // if (/token::lock_tokens_to_pixie/.test(payload.function) !== true) {
    //     return
    // }

    let lockHashes = [];
    if (events && events.length > 0) {
        for (const event of events) {
            if (/transaction_store::TokensLockedEvent/.test(event.type)) {
                lockHashes.push(event.data.tx_hash);
            }
        }
    }

    console.log(`${ledgerVersion} ${lockHashes.length} founded`);
    if (lockHashes.length > 0) {
        saveLockHashesToDB(ledgerVersion, lockHashes, "endless");
    }
}

export async function getLockTransactionDetail(lockHash) {
    return await endless.view({
        payload: {
            function: `${Package_Address}::transaction_store::get_locked_transaction`,
            typeArguments: [],
            functionArguments: [lockHash],
        }
    });
}

export async function setLockTransactionExecuted(lockHash, executedByTx) {
    const abi = {
        typeParameters: [],
        parameters: [parseTypeTag("0x1::string::String"), parseTypeTag("0x1::string::String")],
    };

    const payload = await generateTransactionPayloadWithABI({
        function: `${Package_Address}::token::set_lock_transaction_executed`,
        typeArguments: [],
        functionArguments: [
            lockHash,
            executedByTx
        ],
        abi: abi,
    });

    return submitSimpleTransaction({payload});
}

export async function callSignMintTokens({tx_hash, source_user_address, amount, target_user_address, chain_id, nonce}) {
    const abi = {
        typeParameters: [],
        parameters: [
            parseTypeTag("0x1::string::String"),
            parseTypeTag("0x1::string::String"),
            new TypeTagU256(),
            new TypeTagAddress(),
            new TypeTagU256(),
            new TypeTagU256(),
        ],
    };

    const payload = await generateTransactionPayloadWithABI({
        function: `${Package_Address}::token::sign_mint_tokens`,
        typeArguments: [],
        functionArguments: [
            tx_hash,
            source_user_address,
            amount,
            target_user_address,
            chain_id,
            nonce
        ],
        abi: abi,
    });

    return await submitSimpleTransaction({payload})
}

async function submitSimpleTransaction({payload}) {
    try {
        const rawTransaction = await generateRawTransaction({
            endlessConfig: config,
            sender: validator.accountAddress,
            payload,
        });

        const transaction = new SimpleTransaction(rawTransaction);
        const authenticator = endless.transaction.sign({signer: validator, transaction});
        const transactionResponse = await endless.transaction.submit.simple({
            senderAuthenticator: authenticator,
            transaction,
        });

        const tx = (await endless.waitForTransaction({
            transactionHash: transactionResponse.hash,
        }))
        console.log(`submitSimpleTransaction transaction version: ${transactionResponse.hash}`)

        return transactionResponse.hash;
    } catch (error) {
        console.error(error);
        return "";
    }
}

// await getLockTransactionDetail("0x196ff5703f2ab47ecdce5bc5e84d18db4c9001c92f4ba87eb98539682db8667a");
// await setLockTransactionExecuted("0x196ff5703f2ab47ecdce5bc5e84d18db4c9001c92f4ba87eb98539682db8667a", "0xb3b02c23542184a11c9fa26d2494982f5ca6aae0855d6dca4a2f28c550265a60");
