import {useEffect, useState} from 'react';
import '../App.css';
import {ethers} from 'ethers';

import {BridgeAbi, ContractAddress, Rpc_Url, Chain_Id, Chain_Id_Hex} from '../config.js';
import {TxDB} from "../utils/db.js";
import {convert} from "../utils/utils.js";

const db = new TxDB("PixieDbDev");

function Pixie() {
    // const [provider, setProvider] = useState(null);
    // const [bridgeContract, setBridgeContract] = useState(null);

    const [chainId, setChainId] = useState(null);
    const [account, setAccount] = useState(null);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [endlessAddress, setEndlessAddress] = useState("AJb8fEVLCB6nYnMisSAZqR2Zar9bCSxmnzGya85phHTh");
    const [valueInETH, setValueInETH] = useState("0.0001");
    const [txHash, setTxHash] = useState("0xd2bdcb2dc5a5c93d2288555390530fcaba16171ccee7b70e93b987524e565330");

    const [savedTxs, setSavedTxs] = useState([]);
    const [selectedTxDetails, setSelectedTxDetails] = useState(null);

    useEffect(() => {
        db.loadTxHashes().then(r => setSavedTxs(r));
    }, []);

    useEffect(() => {
        initializeProvider().then(r => {});
    }, []);

    const initializeProvider = async () => {
        if (!window.ethereum) {
            setError("MetaMask is not installed.");
            return;
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        // setProvider(provider);

        // initializeContract().then(r => {});
        console.log("provider initialized");
    }

    const initializeContract = async () => {
        if (provider) {
            const signer = await provider.getSigner();
            const bridgeContract = new ethers.Contract(ContractAddress, BridgeAbi, signer);
            setBridgeContract(bridgeContract);
            console.log("bridgeContract initialized");
        }
    }

    const connectWallet = async () => {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const network = await provider.getNetwork();
            const connectedChainId = network.chainId.toString();

            console.log("Connected to chain ID:", connectedChainId);


            if (connectedChainId !== Chain_Id) {
                setStatus("Please switch to the Pixie network");
                return;
            }


            const accounts = await provider.send("eth_requestAccounts", []);
            console.log("Accounts connected: " + accounts.length);
            setAccount(accounts[0]);


            // initializeContract().then(r => {});

        } catch (err) {
            setError(err.message || "Connection failed.");
        }
    };

    const switchNetwork = async () => {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{chainId: Chain_Id_Hex}],
            });
            setStatus("Switched to the correct network. Please try again.");
        } catch (switchError) {
            if (switchError.code === 4902) {
                setStatus("Network not added to MetaMask.");
            } else {
                setStatus("Failed to switch network. Please do it manually.");
            }
        }
    }

    const lockTokens = async () => {
        if (!account) {
            alert("Please connect wallet first.");
            return;
        }
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const bridgeContract = new ethers.Contract(ContractAddress, BridgeAbi, signer);


        const endlessHexAddress = convert(endlessAddress);

        try {
            const tx = await bridgeContract.lockTokensToEndless(
                endlessAddress,
                endlessHexAddress,
                {
                    value: ethers.parseEther(valueInETH),
                }
            );
            setStatus("Transaction sent: " + tx.hash);
            await tx.wait();

            console.log(tx.hash);

            const receipt = await provider.getTransactionReceipt(tx.hash);
            const iface = new ethers.Interface(BridgeAbi);

            for (const log of receipt.logs) {
                try {
                    const parsedLog = iface.parseLog(log);
                    console.log("Parsed Event:", parsedLog.name, parsedLog.args);
                } catch (e) {
                    // Ignore logs that do not match the ABI
                }
            }
            setStatus("Transaction confirmed: " + tx.hash);
        } catch (err) {
            console.error(err);
            setStatus("Error: " + (err.reason || err.message));
        }
    };

    const getTx = async () => {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const receipt = await provider.getTransactionReceipt(txHash);
        const iface = new ethers.Interface(BridgeAbi);

        // console.log("getTx: " + receipt.logs);

        for (const log of receipt.logs) {
            try {
                const parsedLog = iface.parseLog(log);
                if (parsedLog.name === "TokensLocked") {
                    const txHash = parsedLog.args.txHash;
                    console.log("txHash from event:", txHash);
                    await db.saveTxHash(txHash);
                }
            } catch (e) {
                // 忽略无法解析的日志
            }
        }
    }

    const queryLockTransactions = async (lockedHash) => {
        console.log("query lock transactions", lockedHash);

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const bridgeContract = new ethers.Contract(ContractAddress, BridgeAbi, signer);

            const txData = await bridgeContract.lockTransactions(lockedHash);

            const result = {
                user: txData.user,
                amount: ethers.formatEther(txData.amount),
                endlessAddress: txData.endlessAddress,
                timestamp: new Date(Number(txData.timestamp) * 1000).toLocaleString(),
                executed: txData.executed,
                nonce: txData.nonce,
                executedByTx: txData.executedByTx,
                chainId: txData.chainId,
            };

            setSelectedTxDetails(result);
        } catch (e) {
            console.error(e);
        }

    }

    async function signUnlockTokens() {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const bridgeContract = new ethers.Contract(ContractAddress, BridgeAbi, signer);
        const endlessTx =
        {
            "amount": "1200000000",
            "chain_id": "221",
            "executed": false,
            "executed_by_tx": "",
            "nonce": "1",
            "pixie_address": "0x25A89679331327101060b8E960565dDd336Cb03b",
            "timestamp": "1753627036",
            "user": "3zZ7DdUYnacaF6xYQk44U39yDfuDxS169DB1iyWf8e3c"
        };
        const lockHash = "0x196ff5703f2ab47ecdce5bc5e84d18db4c9001c92f4ba87eb98539682db8667a";

        try {
            const tx = await bridgeContract.signUnlockTokens(
                lockHash,
                convert(endlessTx.user),
                endlessTx.amount,
                endlessTx.pixie_address,
                endlessTx.chain_id,
                endlessTx.nonce
            );
            console.log("Transaction sent:", tx.hash);
            await tx.wait();
            console.log("Transaction confirmed!");
        } catch (error) {
            console.error("Error signing unlock:", error);
        }
    }

    return (
        <>
            <div>
                <h1>Connect to MetaMask</h1>
                {account ? (
                    <p>Connected Account: {account}</p>
                ) : (
                    <button onClick={connectWallet}>Connect MetaMask</button>
                )}
                {chainId && <p>Connected Chain ID: {chainId}</p>}
                {error && <p style={{color: 'red'}}>{error}</p>}

                <button onClick={switchNetwork}>Switch Network</button>

                <h2>Bridge PIX to Endless</h2>
                <div>
                    <label>Endless Address (Base58): </label>
                    <input
                        type="text"
                        value={endlessAddress}
                        onChange={(e) => setEndlessAddress(e.target.value)}
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
                {status && <p>{status}</p>}

                <button onClick={getTx}>Parse Tx</button>

                <h3>Saved Transactions</h3>
                <ul>
                    {savedTxs.map((item) => (
                        <li key={item.hash} onClick={() => queryLockTransactions(item.hash)} style={{ cursor: 'pointer' }}>
                            {item.hash}
                        </li>
                    ))}
                </ul>
                {selectedTxDetails && (
                    <div key={selectedTxDetails.nonce}>
                        <h4>Transaction Details</h4>
                        <p><strong>User:</strong> {selectedTxDetails.user}</p>
                        <p><strong>Amount:</strong> {selectedTxDetails.amount} PIX</p>
                        <p><strong>Endless Address:</strong> {selectedTxDetails.endlessAddress}</p>
                        <p><strong>Timestamp:</strong> {selectedTxDetails.timestamp}</p>
                        <p><strong>Executed:</strong> {selectedTxDetails.executed.toString()}</p>
                        <p><strong>Nonce:</strong> {selectedTxDetails.nonce}</p>
                        <p><strong>Executed By Tx:</strong> {selectedTxDetails.executedByTx}</p>
                        <p><strong>Chain ID:</strong> {selectedTxDetails.chainId}</p>
                    </div>
                )}


                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div>
                    <button onClick={signUnlockTokens}>signUnlockTokens</button>
                </div>
            </div>
        </>
    )
}

export default Pixie;
