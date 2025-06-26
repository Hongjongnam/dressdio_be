const fs = require("fs");
const path = require("path");

// 복사할 ABI 파일들
const abiFiles = [
  {
    source: "artifacts/contracts/CreatorSBT.sol/CreatorSBT.json",
    target: "src/abi/SbtContract.json",
  },
  {
    source: "artifacts/contracts/PlatformRegistry.sol/PlatformRegistry.json",
    target: "src/abi/PlatformRegistry.json",
  },
  {
    source:
      "artifacts/contracts/MerchandiseFactory.sol/MerchandiseFactory.json",
    target: "src/abi/MerchandiseFactory.json",
  },
  {
    source: "artifacts/contracts/IPNFTFactory.sol/IPNFTFactory.json",
    target: "src/abi/IPNFTFactory.json",
  },
  {
    source: "artifacts/contracts/IPNFT.sol/IPNFT.json",
    target: "src/abi/IPNFT.json",
  },
  {
    source: "artifacts/contracts/MerchandiseNFT.sol/MerchandiseNFT.json",
    target: "src/abi/MerchandiseNFT.json",
  },
];

// ABI 복사 함수
function copyABI(sourcePath, targetPath) {
  try {
    const sourceContent = fs.readFileSync(sourcePath, "utf8");
    const sourceJson = JSON.parse(sourceContent);

    // ABI 배열만 추출하여 직접 저장
    const abiArray = sourceJson.abi;

    // 타겟 파일에 ABI 배열만 저장
    fs.writeFileSync(targetPath, JSON.stringify(abiArray, null, 2));
    console.log(`✅ ${sourcePath} -> ${targetPath}`);
  } catch (error) {
    console.error(`❌ ${sourcePath} 복사 실패:`, error.message);
  }
}

// 모든 ABI 파일 복사
console.log("ABI 파일 복사 시작...");
abiFiles.forEach((file) => {
  copyABI(file.source, file.target);
});
console.log("ABI 파일 복사 완료!");
