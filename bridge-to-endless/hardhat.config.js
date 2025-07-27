require("@nomicfoundation/hardhat-toolbox");

module.exports = {
    solidity: "0.8.0",
    networks: {
        hardhat: {},
        pixie: {
            url: "https://http-mainnet.chain.pixie.xyz",
            accounts: [
                ''
            ]
        }
    }
};
