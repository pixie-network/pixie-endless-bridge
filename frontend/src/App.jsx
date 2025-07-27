import React, {useState, useEffect} from "react";
import {ArrowRight, ChevronDown, History, X, ExternalLink} from "lucide-react";
import {ethers} from "ethers";
import {BridgeAbi, ContractAddress, Rpc_Url, Chain_Id, Chain_Id_Hex, Package_Address} from "./config.js";
import {TxDB} from "./utils/db.js";
import {convert} from "./utils/utils.js";
import {
    Network,
    parseTypeTag,
    TypeTagU256,
    EndlessConfig,
    Endless,
} from '@endlesslab/endless-ts-sdk';
import {
    EndlessJsSdk,
    UserResponseStatus,
} from '@endlesslab/endless-web3-sdk';

const db = new TxDB("PixieDB");
const endlessNetwork = Network.TESTNET;

const jssdk = new EndlessJsSdk({
    // optional: Network.MAINNET
    network: endlessNetwork,
    // optional: 'dark' | 'light'
    colorMode: 'light'
});
const config = new EndlessConfig({ network: endlessNetwork });
const endless = new Endless(config);

const PixieBridge = () => {
    const [isWalletConnected, setIsWalletConnected] = useState(false);
    const [walletAddress, setWalletAddress] = useState("");
    const [balance, setBalance] = useState("0.00");
    const [fromChain, setFromChain] = useState("pixie");
    const [toChain, setToChain] = useState("endless");
    const [sendAmount, setSendAmount] = useState("");
    const [receiveAddress, setReceiveAddress] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [historyRecords, setHistoryRecords] = useState([]);
    // const [provider, setProvider] = useState(null);

    const chains = {
        pixie: {
            name: "Pixie",
            symbol: "PIX",
            icon: "https://scan.chain.pixie.xyz/images/favicon-ec75c24274715aad554a23cc73e40dbe.ico",
            // balance: "0.00"
        },
        endless: {
            name: "Endless",
            symbol: "ePIX",
            icon: "https://images.pixie.xyz/logos/endless.avif",
            // balance: "0.00"
        },
    };

    const exchangeRate = 1;
    const bridgeFee = 0;

    // Show notification
    const showNotification = (message, type = "info") => {
        const id = Date.now();
        const notification = {id, message, type};
        setNotifications(prev => [...prev, notification]);

        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 3000);
    };

    // Format address for display
    const formatAddress = (address) => {
        if (!address) return "";
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // Format transaction hash
    const formatTxHash = (hash) => {
        if (!hash) return "";
        return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
    };

    // Get chain name
    const getChainName = (chainId) => {
        if (chainId.toString() === "6626") return "Pixie";
        else return "Endless";
    };

    useEffect(() => {
        try {
            // const provider = new ethers.BrowserProvider(window.ethereum);
            // // setProvider(provider);
            // console.log("provider initialized");
            //
            // window.ethereum.on("accountsChanged", (accounts) => {
            //     console.log("accountsChanged", accounts);
            //     if (accounts.length === 0) {
            //         console.log("No accounts connected");
            //     } else {
            //         getAccountBalance(accounts[0]).then(r => {});
            //     }
            // });

        } catch (e) {
            console.error(e);
        }
    }, []);

    const connectEndlessWallet = async () => {
        const res = await jssdk.connect();
        if (res.status === UserResponseStatus.APPROVED) {
            const accountAddress = res.args.address;
            setWalletAddress(accountAddress);
            setIsWalletConnected(true);

            const balanceWei = await getEPIXBalance(accountAddress);
            const balanceEth = (balanceWei/1_000_000_000).toFixed(5);
            setBalance(balanceEth);
        }
    }

    const connectMetamask = async () => {
        try {
            // const network = await provider.getNetwork();
            // const connectedChainId = network.chainId.toString();
            //
            // console.log("Connected to chain ID:", connectedChainId);
            //
            //
            // if (connectedChainId !== Chain_Id) {
            //     showNotification("Please switch to the Pixie network", "error");
            //     return;
            // }
            const provider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await provider.send("eth_requestAccounts", []);
            console.log("Accounts connected: " + accounts.length);

            await getAccountBalance(accounts[0]);

            setIsWalletConnected(true);

        } catch (err) {
            showNotification("Connection failed.", "error");
        }
    }

    // Connect wallet
    const connectWallet = async () => {
        console.log("connectWallet");

        if (!isWalletConnected) {
            if (fromChain === "pixie") {
                await connectMetamask()
            } else {
                await connectEndlessWallet();
            }
        } else {
            if (fromChain === "endless") {
                await jssdk.disconnect();
            }
            setIsWalletConnected(false);
            setWalletAddress("");
            showNotification("Wallet Disconnected", "info");
        }
    };

    const getAccountBalance = async (account) => {
        setWalletAddress(account);

        const provider = new ethers.BrowserProvider(window.ethereum);
        const balanceWei = await provider.getBalance(account);
        const balanceEth = parseFloat(ethers.formatEther(balanceWei)).toFixed(5);
        setBalance(balanceEth);
    }

    // Swap chains
    const swapChains = () => {
        const tempChain = fromChain;
        setFromChain(toChain);
        setToChain(tempChain);
        setIsWalletConnected(false);
        setWalletAddress("");
    };

    // Set maximum amount
    const setMaxAmount = () => {
        setSendAmount(balance);
    };

    const getPixieTx = async (txHash) => {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const receipt = await provider.getTransactionReceipt(txHash);
        const iface = new ethers.Interface(BridgeAbi);

        let lockHash = "";

        for (const log of receipt.logs) {
            try {
                const parsedLog = iface.parseLog(log);
                if (parsedLog.name === "TokensLocked") {
                    lockHash = parsedLog.args.txHash;
                    // await db.saveTxHash(txHash);
                }
            } catch (e) {
                // 忽略无法解析的日志
            }
        }

        if (lockHash === "") {
            return
        }

        try {
            const bridgeContract = new ethers.Contract(ContractAddress, BridgeAbi, signer);
            const txData = await bridgeContract.lockTransactions(lockHash);

            const result = {
                hash: lockHash,
                from_address: txData.user,
                amount: ethers.formatEther(txData.amount),
                target_address: txData.endlessAddress,
                timestamp: new Date(Number(txData.timestamp) * 1000).toLocaleString(),
                executed: txData.executed,
                nonce: txData.nonce,
                executed_by_tx: txData.executedByTx,
                chain_id: txData.chainId,
            };

            await db.saveTxHash(result);

        } catch (e) {
            console.error(e);
        }
    }

    const bridgeToEndless = async () => {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const bridgeContract = new ethers.Contract(ContractAddress, BridgeAbi, signer);
        const endlessHexAddress = convert(receiveAddress);

        try {
            const tx = await bridgeContract.lockTokensToEndless(
                receiveAddress,
                endlessHexAddress,
                {
                    value: ethers.parseEther(sendAmount),
                }
            );
            await tx.wait();
            await getPixieTx(tx.hash)

        } catch (err) {
            console.error(err);
            setStatus("Error: " + (err.reason || err.message));
        }
    }

    const getEPIXBalance = async (address) => {
        try {
            const data = await endless.view({
                payload: {
                    function: `${Package_Address}::token::get_balance`,
                    typeArguments: [],
                    functionArguments: [address],
                }
            });
            console.log("EPIX balance", data);
            if (data.length > 0) return data[0];

        } catch (e) {
            console.error(e);
        }

        return "0.00";
    }

    const queryEndlessLockTransactions = async (lockHash) => {
        try {
            const data = await endless.view({
                payload: {
                    function: `${Package_Address}::transaction_store::get_locked_transaction`,
                    typeArguments: [],
                    functionArguments: [lockHash],
                }
            });

            if (data && data.length > 0) {
                const item = data[0];

                await db.saveTxHash({
                    hash: lockHash,
                    from_address: item.user,
                    amount: ethers.formatEther(item.amount),
                    target_address: item.pixie_address,
                    timestamp: new Date(Number(item.timestamp) * 1000).toLocaleString(),
                    executed: item.executed,
                    nonce: item.nonce,
                    executed_by_tx: item.executed_by_tx,
                    chain_id: item.chain_id,
                });
            }
        } catch (e) {
            console.error(e);
        }
    }

    const getEndlessTransaction = async (transactionHash) => {
        const transaction = await endless.getTransactionByHash({transactionHash: transactionHash})
        await parseEndlessEvents(transaction);
    }

    const bridgeToPixie = async () => {
        const abi = {
            typeParameters: [],
            parameters: [new TypeTagU256(), parseTypeTag("0x1::string::String")],
        };

        const txData= {
            payload: {
                function: `${Package_Address}::token::lock_tokens_to_pixie`,
                functionArguments: [
                    BigInt(Number(sendAmount) * 1_000_000_000),
                    receiveAddress
                ],
                abi,
            },
        };

        const res = await jssdk.signAndSubmitTransaction(txData);
        if (res.status === UserResponseStatus.APPROVED) {
            const transaction = await endless.waitForTransaction({
                transactionHash: res.args.hash,
            });
            await parseEndlessEvents(transaction);
        }
    }

    const parseEndlessEvents = async (transaction) => {
        const {events} = transaction;

        for (const event of events) {
            const {type, data} = event;
            if (/token::TokensLockedEvent/.test(type)) {
                const {tx_hash } = data;
                await queryEndlessLockTransactions(tx_hash);
            }
        }
    }

    // Start bridging
    const startBridge = async () => {
        if (!isWalletConnected) {
            showNotification("Please connect your wallet first", "error");
            return;
        }

        if (!sendAmount || parseFloat(sendAmount) <= 0) {
            showNotification("Please enter a valid amount", "error");
            return;
        }

        if (!receiveAddress) {
            showNotification("Please enter a receiving address", "error");
            return;
        }

        setIsProcessing(true);
        showNotification("Processing bridge transaction...", "info");

        if (fromChain === "pixie") {
            bridgeToEndless().then(r => {
                bridgeSubmitted();
            });
        } else {
            bridgeToPixie().then(r => {
                bridgeSubmitted();
            })
        }
    };

    const bridgeSubmitted = () => {
        setIsProcessing(false);
        showNotification("Bridge transaction submitted successfully!", "success");
        setSendAmount("");
        setReceiveAddress("");
    }

    // Notification component
    const Notification = ({notification}) => {
        const bgColor = {
            success: "bg-gradient-to-r from-green-500 to-green-600",
            error: "bg-gradient-to-r from-red-500 to-red-600",
            info: "bg-gradient-to-r from-blue-500 to-blue-600"
        };

        return (
            <div
                className={`fixed top-4 right-4 ${bgColor[notification.type]} text-white px-6 py-3 rounded-xl shadow-lg z-50 animate-slide-in max-w-sm`}>
                {notification.message}
            </div>
        );
    };

    const loadAndShowHistory = async () => {
        const history = await db.loadTxHashes();
        setHistoryRecords(history);
        setShowHistory(true);
    }

    // Transaction history modal component
    const HistoryModal = () => {
        if (!showHistory) return null;

        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-7xl w-full max-h-[85vh] overflow-hidden">
                    {/* Modal header */}
                    <div className="flex items-center justify-between p-6 border-b border-gray-200">
                        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <History size={24} className="text-indigo-600"/>
                            Transaction History
                        </h3>
                        <button
                            onClick={() => setShowHistory(false)}
                            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            <X size={20} className="text-gray-500"/>
                        </button>
                    </div>

                    {/* Transaction history table */}
                    <div className="overflow-auto max-h-[70vh]">
                        {historyRecords.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <History size={48} className="mx-auto mb-4 text-gray-300"/>
                                <p>No transaction history found</p>
                            </div>
                        ) : (
                            <div className="p-6">
                                <div className="overflow-x-auto">
                                    <table
                                        className="w-full border-collapse bg-white rounded-xl overflow-hidden shadow-sm">
                                        <thead>
                                        <tr className="bg-gray-50">
                                            <th className="text-left p-4 font-semibold text-gray-700 border-b border-gray-200">TX Hash</th>
                                            <th className="text-left p-4 font-semibold text-gray-700 border-b border-gray-200">From Address</th>
                                            <th className="text-left p-4 font-semibold text-gray-700 border-b border-gray-200">Target Address</th>
                                            <th className="text-left p-4 font-semibold text-gray-700 border-b border-gray-200">Nonce</th>
                                            <th className="text-left p-4 font-semibold text-gray-700 border-b border-gray-200">Chain</th>
                                            <th className="text-left p-4 font-semibold text-gray-700 border-b border-gray-200">Amount</th>
                                            <th className="text-left p-4 font-semibold text-gray-700 border-b border-gray-200">Time</th>
                                            <th className="text-left p-4 font-semibold text-gray-700 border-b border-gray-200">Status</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {historyRecords.map((record, index) => (
                                            <tr key={index} className="hover:bg-gray-50 transition-colors">
                                                <td className="p-4 border-b border-gray-100">
                                                    <div className="flex items-center gap-2">
                                                        <code
                                                            className="text-indigo-600 font-mono text-sm bg-indigo-50 px-2 py-1 rounded">
                                                            {formatTxHash(record.hash)}
                                                        </code>
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(record.hash);
                                                                showNotification("Transaction hash copied!", "success");
                                                            }}
                                                            className="text-gray-400 hover:text-indigo-600 transition-colors p-1 rounded hover:bg-indigo-50"
                                                            title="Copy full hash"
                                                        >
                                                            <ExternalLink size={14}/>
                                                        </button>
                                                    </div>
                                                </td>

                                                <td className="p-4 border-b border-gray-100">
                                                    <div className="flex items-center gap-2">
                                                        <code
                                                            className="text-gray-700 font-mono text-sm bg-gray-50 px-2 py-1 rounded">
                                                            {formatAddress(record.from_address)}
                                                        </code>
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(record.from_address);
                                                                showNotification("User address copied!", "success");
                                                            }}
                                                            className="text-gray-400 hover:text-indigo-600 transition-colors p-1 rounded hover:bg-indigo-50"
                                                            title="Copy full address"
                                                        >
                                                            <ExternalLink size={14}/>
                                                        </button>
                                                    </div>
                                                </td>

                                                <td className="p-4 border-b border-gray-100">
                                                    <div className="flex items-center gap-2">
                                                        <code
                                                            className="text-gray-700 font-mono text-sm bg-gray-50 px-2 py-1 rounded">
                                                            {formatAddress(record.target_address)}
                                                        </code>
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(record.target_address);
                                                                showNotification("Target address copied!", "success");
                                                            }}
                                                            className="text-gray-400 hover:text-indigo-600 transition-colors p-1 rounded hover:bg-indigo-50"
                                                            title="Copy full address"
                                                        >
                                                            <ExternalLink size={14}/>
                                                        </button>
                                                    </div>
                                                </td>

                                                <td className="p-4 border-b border-gray-100">
                                                    <code
                                                        className="text-gray-700 font-mono text-sm bg-gray-50 px-2 py-1 rounded">
                                                        {record.nonce}
                                                    </code>
                                                </td>

                                                <td className="p-4 border-b border-gray-100">
                            <span className="inline-flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${
                                  record.chain_id === 6626 ? "bg-blue-500" :
                                      record.chain_id <= 223 ? "bg-yellow-500" :
                                          "bg-purple-500"
                              }`}></div>
                              <span className="font-medium text-gray-700">
                                {getChainName(record.chain_id)}
                              </span>
                            </span>
                                                </td>

                                                <td className="p-4 border-b border-gray-100">
                            <span className="font-semibold text-gray-800 bg-green-50 px-2 py-1 rounded text-sm">
                              {record.amount}
                            </span>
                                                </td>

                                                <td className="p-4 border-b border-gray-100">
                            <span className="text-sm text-gray-600">
                              {record.timestamp}
                            </span>
                                                </td>

                                                <td className="p-4 border-b border-gray-100">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                record.executed
                                    ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                            }`}>
                              {record.executed_by_tx}
                            </span>
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer information */}
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                        <p className="text-sm text-gray-500">
                            Total {historyRecords.length} transaction{historyRecords.length !== 1 ? "s" : ""}
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
            {/* Notification system */}
            {notifications.map((notification) => (
                <Notification key={notification.id} notification={notification}/>
            ))}

            {/* Transaction history modal */}
            <HistoryModal/>

            <div className="container mx-auto px-4 py-6">
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-center mb-10">
                    <div className="flex items-center gap-3 mb-4 md:mb-0">
                        <img
                            src="https://images.pixie.xyz/logos/pixie.png"
                            alt="Pixie Logo"
                            className="w-8 h-8"
                        />
                        <h1 className="text-2xl font-bold text-white">Pixie Bridge</h1>
                    </div>

                    <nav className="flex gap-8 mb-4 md:mb-0">
                        <a href="#" className="text-white/80 hover:text-white font-medium transition-colors">Bridge</a>
                        {/*<a href="#" className="text-white/80 hover:text-white font-medium transition-colors">Pool</a>*/}
                        {/*<a href="#" className="text-white/80 hover:text-white font-medium transition-colors">Faucet</a>*/}
                        <a
                            href="mailto:support@pixie.xyz"
                            target={"_blank"}
                            className="text-white/80 hover:text-white font-medium transition-colors"
                        >
                            Support
                        </a>
                    </nav>

                    <button
                        onClick={async () => { await connectWallet()}}
                        className="bg-white/20 hover:bg-white/30 border border-white/30 text-white px-6 py-2 rounded-xl font-medium transition-all duration-300 hover:-translate-y-0.5 backdrop-blur-sm"
                    >
                        {isWalletConnected ? formatAddress(walletAddress) : "Connect Wallet"}
                    </button>
                </header>

                {/* Bridge Container */}
                <div
                    className="max-w-xl mx-auto bg-white/95 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                            Bridge Assets
                        </h2>
                        <button
                            onClick={() => loadAndShowHistory()}
                            className="p-2 hover:bg-gray-100 rounded-xl transition-colors group"
                            title="Transaction History"
                        >
                            <History size={24} className="text-gray-600 group-hover:text-indigo-600 transition-colors"/>
                        </button>
                    </div>

                    {/* Chain Selector */}
                    <div className="flex items-center justify-between mb-6 gap-4">
                        <div
                            className={`flex-1 p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                                fromChain === "pixie" ? "border-blue-400 bg-blue-50" :
                                    fromChain === "endless" ? "border-yellow-400 bg-yellow-50" :
                                        "border-purple-400 bg-purple-50"
                            }`}>
                            <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg mx-auto mb-2 ${
                                    fromChain === "pixie" ? "from-blue-500 to-blue-600" :
                                        fromChain === "endless" ? "from-yellow-400 to-yellow-500" :
                                            "bg-gradient-to-r from-purple-500 to-purple-600"
                                }`}>
                                {/*{chains[fromChain].icon}*/}
                                <img src={chains[fromChain].icon}  alt={""}/>
                            </div>
                            <div className="text-center font-semibold text-gray-700">{chains[fromChain].name}</div>
                        </div>

                        <button
                            onClick={swapChains}
                            className="w-12 h-12 bg-white border-2 border-gray-200 rounded-full flex items-center justify-center hover:border-indigo-400 hover:shadow-md transition-all duration-300 hover:rotate-180"
                        >
                            <ArrowRight size={20} className="text-gray-600"/>
                        </button>

                        <div
                            className={`flex-1 p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                                toChain === "pixie" ? "border-blue-400 bg-blue-50" :
                                    toChain === "endless" ? "border-yellow-400 bg-yellow-50" :
                                        "border-purple-400 bg-purple-50"
                            }`}>
                            <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg mx-auto mb-2 ${
                                    toChain === "pixie" ? "from-blue-500 to-blue-600" :
                                        toChain === "endless" ? "from-yellow-400 to-yellow-500" :
                                            "bg-gradient-to-r from-purple-500 to-purple-600"
                                }`}>
                                {/*{chains[toChain].icon}*/}
                                <img src={chains[toChain].icon} alt={""}/>
                            </div>
                            <div className="text-center font-semibold text-gray-700">{chains[toChain].name}</div>
                        </div>
                    </div>

                    {/* Send Amount */}
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-3">
                            <span className="font-semibold text-gray-700">You Send</span>
                            <span className="text-sm text-gray-500">
                Balance: {balance} {chains[fromChain].symbol}
              </span>
                        </div>
                        <div
                            className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-5 focus-within:border-indigo-400 transition-colors">
                            <input
                                type="number"
                                placeholder="0.00"
                                value={sendAmount}
                                onChange={(e) => setSendAmount(e.target.value)}
                                className="w-full bg-transparent text-2xl font-semibold text-gray-800 outline-none placeholder-gray-400"
                            />
                            <div className="flex justify-between items-center mt-3">
                                <div
                                    className="flex items-center gap-2 bg-white/80 px-3 py-2 rounded-xl cursor-pointer hover:bg-white transition-colors">
                                    <div
                                        className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                                            fromChain === "pixie" ? "from-blue-500 to-blue-600" :
                                                fromChain === "endless" ? "from-yellow-400 to-yellow-500" :
                                                    "bg-gradient-to-r from-purple-500 to-purple-600"
                                        }`}>
                                        {/*{chains[fromChain].icon}*/}
                                        <img src={chains[fromChain].icon} alt={""}/>
                                    </div>
                                    <span className="font-medium">{chains[fromChain].symbol}</span>
                                    <ChevronDown size={16}/>
                                </div>
                                <button
                                    onClick={setMaxAmount}
                                    className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-3 py-1 rounded-lg text-sm font-semibold hover:-translate-y-0.5 transition-transform"
                                >
                                    MAX
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Receive Address */}
                    <div className="mb-6">
                        <div className="mb-3">
                            <span className="font-semibold text-gray-700">Receive Address</span>
                        </div>
                        <input
                            type="text"
                            placeholder="Enter destination address"
                            value={receiveAddress}
                            onChange={(e) => setReceiveAddress(e.target.value)}
                            className="w-full bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 text-gray-700 outline-none focus:border-indigo-400 transition-colors"
                        />
                    </div>

                    {/* Bridge Info */}
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-600">Exchange Rate</span>
                            <span className="font-semibold text-gray-800">
                1 {chains[fromChain].symbol} = {exchangeRate} {chains[toChain].symbol}
              </span>
                        </div>
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-600">Bridge Fee</span>
                            <span className="font-semibold text-gray-800">{bridgeFee} {chains[fromChain].symbol}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Estimated Time</span>
                            <span className="font-semibold text-gray-800">5-10 minutes</span>
                        </div>
                    </div>

                    {/* Bridge Button */}
                    <button
                        onClick={startBridge}
                        disabled={!isWalletConnected || isProcessing}
                        className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white py-4 rounded-2xl font-semibold text-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none mb-4"
                    >
                        {isProcessing
                            ? "Processing..."
                            : !isWalletConnected
                                ? "Connect Wallet to Bridge"
                                : "Bridge"
                        }
                    </button>

                    <div className="text-center text-xs text-gray-500">
                        Powered by Pixie Bridge Protocol
                    </div>
                </div>

                {/*/!* Stats *!/*/}
                {/*<div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-10 max-w-4xl mx-auto">*/}
                {/*    {[*/}
                {/*        { number: "$2.5B+", label: "Total Volume" },*/}
                {/*        { number: "150K+", label: "Transactions" },*/}
                {/*        { number: "5", label: "Supported Chains" },*/}
                {/*        { number: "99.9%", label: "Success Rate" }*/}
                {/*    ].map((stat, index) => (*/}
                {/*        <div key={index} className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 text-center">*/}
                {/*            <div className="text-2xl font-bold text-indigo-600 mb-2">{stat.number}</div>*/}
                {/*            <div className="text-sm text-gray-600">{stat.label}</div>*/}
                {/*        </div>*/}
                {/*    ))}*/}
                {/*</div>*/}
            </div>

            <style jsx>{`
                @keyframes slide-in {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }

                .animate-slide-in {
                    animation: slide-in 0.3s ease-out;
                }
            `}</style>
        </div>
    );
};

export default PixieBridge;