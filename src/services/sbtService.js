// const logger = require("./logger");
// const { ethers } = require("ethers");
// const fs = require("fs");
// const path = require("path");

// class SBTService {
//   constructor() {
//     this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
//     this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);

//     // 컨트랙트 ABI와 주소 로드
//     const contractPath = path.join(__dirname, "../contracts/SBT.json");
//     const contractJson = JSON.parse(fs.readFileSync(contractPath, "utf8"));
//     this.contract = new ethers.Contract(
//       process.env.SBT_CONTRACT_ADDRESS,
//       contractJson.abi,
//       this.wallet
//     );
//   }

//   async mintSBT(data) {
//     try {
//       logger.debug("Starting SBT minting process:", {
//         walletAddress: data.walletAddress,
//         sbtType: data.sbtType,
//       });

//       // 메타데이터를 IPFS에 업로드하는 로직 추가 필요
//       const metadataUri = await this.uploadMetadata(data.metadata);

//       // SBT 민팅 트랜잭션 실행
//       const tx = await this.contract.mint(
//         data.walletAddress,
//         data.sbtType,
//         metadataUri
//       );

//       // 트랜잭션 완료 대기
//       const receipt = await tx.wait();

//       logger.debug("SBT minted successfully:", {
//         transactionHash: receipt.hash,
//         blockNumber: receipt.blockNumber,
//       });

//       return {
//         tokenId: receipt.logs[0].topics[3], // 토큰 ID는 이벤트 로그에서 추출
//         transactionHash: receipt.hash,
//         metadataUri: metadataUri,
//       };
//     } catch (error) {
//       logger.error("SBT minting failed:", {
//         error: error.message,
//         code: error.code,
//         stack: error.stack,
//       });
//       throw error;
//     }
//   }

//   async uploadMetadata(metadata) {
//     // IPFS 업로드 로직 구현 필요
//     // 임시로 더미 URI 반환
//     return "ipfs://dummy-uri";
//   }
// }

// module.exports = new SBTService();
