require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    hardhat: {},
    besu: {
      url: "http://3.38.125.193:8545",
      chainId: 1337,
      accounts: [
        "0x08ea430735cdb2b440e20b5bad77354ebdcbba85eeb509774de29c6ee1fc25b0",
      ],
    },
  },
};
