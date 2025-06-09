const { Web3 } = require("web3");
const { privateKeyToAccount } = require("web3-eth-accounts");
const dotenv = require("dotenv");
const sbtContractABI = require("../abi/SbtContract.json");

dotenv.config();

const CHAIN_ID = process.env.CHAIN_ID || "1337";
const RPC_URL = process.env.RPC_URL || "http://3.38.125.193:8545";

// Dressdio Admin 계정 (컨트랙트 실행용)
const DRESSDIO_ADMIN_WALLET_ADDRESS = process.env.DRESSDIO_ADMIN_WALLET_ADDRESS;
const DRESSDIO_ADMIN_PRIVATE_KEY = process.env.DRESSDIO_ADMIN_PRIVATE_KEY;

// 플랫폼 어드민 계정 (하드코딩)
const PLATFORM_ADMIN_WALLET_ADDRESS =
  "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73";

const SBT_CONTRACT_ADDRESS = process.env.SBT_CONTRACT_ADDRESS;

// Web3 인스턴스 생성
const web3 = new Web3(RPC_URL);

// Dressdio Admin 계정 설정
const dressdioAdminAccount = {
  address: DRESSDIO_ADMIN_WALLET_ADDRESS,
  privateKey: DRESSDIO_ADMIN_PRIVATE_KEY.startsWith("0x")
    ? DRESSDIO_ADMIN_PRIVATE_KEY
    : `0x${DRESSDIO_ADMIN_PRIVATE_KEY}`,
};

// 관리자 계정 추가
if (dressdioAdminAccount.privateKey) {
  web3.eth.accounts.wallet.add(dressdioAdminAccount.privateKey);
}

// 컨트랙트 인스턴스 생성 (Dressdio Admin 계정으로)
const sbtContract = new web3.eth.Contract(sbtContractABI, SBT_CONTRACT_ADDRESS);

// 네트워크 연결 확인 함수
const checkConnection = async () => {
  try {
    const networkId = Number(await web3.eth.net.getId());
    if (networkId !== Number(CHAIN_ID)) {
      throw new Error(`Expected chain ID ${CHAIN_ID}, but got ${networkId}`);
    }
    console.log("Web3 connection successful");
    return true;
  } catch (error) {
    console.error("Web3 connection error:", error);
    return false;
  }
};

// 초기 연결 확인
checkConnection();

module.exports = {
  web3,
  dressdioAdminAccount,
  PLATFORM_ADMIN_WALLET_ADDRESS,
  sbtContract,
  checkConnection,
};
