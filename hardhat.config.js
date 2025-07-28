require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {},
    besu: {
      url: "https://besu.dressdio.me",
      chainId: 2741,
      accounts: [
        "0x08ea430735cdb2b440e20b5bad77354ebdcbba85eeb509774de29c6ee1fc25b0",
      ],
    },
  },
};
