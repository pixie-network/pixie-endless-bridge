import {useState} from 'react';
import {
    Network, parseTypeTag,
    TypeTagU256,
    EndlessConfig,
    Endless,
} from '@endlesslab/endless-ts-sdk';

import {
    EndlessJsSdk,
    UserResponseStatus,
} from '@endlesslab/endless-web3-sdk';
import {TxDB} from "../utils/db.js";
import { Package_Address } from "../config.js";

const db = new TxDB("EndlessDbDev");

const jssdk = new EndlessJsSdk({
    // optional: Network.MAINNET
    network: Network.LOCAL,
    // optional: 'dark' | 'light'
    colorMode: 'light'
});

const config = new EndlessConfig({ network: Network.LOCAL });
const endless = new Endless(config);

function EndlessApp() {
    const [targetAddress, setTargetAddress] = useState("0x777B67FAc5473E793131acFE6e9248277Df9950f");
    const [valueInETH, setValueInETH] = useState("0.0001");

    const connectWallet = () => {
        jssdk.connect().then(res => {
            if (res.status === UserResponseStatus.APPROVED) {
                console.log('Account:', res.args.account);
            }
        });
    }

    const lockTokens = async () => {
        const abi = {
            typeParameters: [],
            parameters: [new TypeTagU256(), parseTypeTag("0x1::string::String")],
        };

        const txData= {
            payload: {
                function: `${Package_Address}::token::lock_tokens_to_pixie`,
                functionArguments: [
                    BigInt(Number(valueInETH)),
                    targetAddress
                ],
                abi,
            },
        };

        const res = await jssdk.signAndSubmitTransaction(txData);
        if (res.status === UserResponseStatus.APPROVED) {
            console.log('Transaction submitted:', res);

            const transaction = await endless.waitForTransaction({
                transactionHash: res.args.hash,
            });

            console.log("submit_guess", transaction);
            await parseEvents(transaction);
        }
    }

    const parseEvents = async (transaction) => {
        const {events} = transaction;

        for (const event of events) {
            const {type, data} = event;
            if (/token::TokensLockedEvent/.test(type)) {
                const {tx_hash, user_address, target_address, nonce, chain_id, amount } = data;
                await db.saveTxHash(tx_hash);
            }
        }
    }

    const get_transactions = async () => {
        const transaction = await endless.getTransactionByHash({transactionHash: "0x6317b2519abd0d8d13354688d705b98e24020ba2e4349bbcdd10ee08aacb742f"})
        console.log("get_transactions", transaction);
        await parseEvents(transaction);
    }

    const findLockTransactions = async () => {
        const data = await endless.view({
            payload: {
                function: `${Package_Address}::transaction_store::get_locked_transaction`,
                typeArguments: [],
                functionArguments: ["0xd39064183244507825ada4096cc22c13ee38cdf5d55dabe971487731ba08de8d"],
            }
        });
        console.log(data)
    }

    return <>
        <button onClick={connectWallet}>Connect to Wallet</button>

        <h2>Bridge ePIX to Pixie</h2>
        <div>
            <label>Pixie Address: </label>
            <input
                type="text"
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
            />
        </div>
        <div>
            <label>Amount in ETH: </label>
            <input
                type="text"
                value={valueInETH}
                onChange={(e) => setValueInETH(e.target.value)}
            />
        </div>
        <button onClick={lockTokens}>Lock PIX to Endless</button>
        <div></div>
        <div></div>
        <div></div>
        <button onClick={get_transactions}>Get Tx</button>
        <div></div>
        <div></div>
        <div></div>
        <button onClick={findLockTransactions}>Find Lock Transaction</button>
    </>
}

export default EndlessApp