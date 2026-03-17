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
        "0xf2ce12c09406b119eba7047de71e8c798bfa804bf471569d5c28beca8aa4b634",
      ],
    },
  },
};
