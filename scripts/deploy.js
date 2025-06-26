require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  // ABC Wallet 관리자 주소 설정
  const ABC_ADMIN_ADDRESS = process.env.PLATFORM_ADMIN_WALLET_ADDRESS;
  if (!ABC_ADMIN_ADDRESS) {
    throw new Error("PLATFORM_ADMIN_WALLET_ADDRESS is not set in .env");
  }
  console.log("ABC Wallet Admin Address:", ABC_ADMIN_ADDRESS);

  // DP 토큰 주소 환경변수 체크 및 출력
  const dpTokenAddress = process.env.DP_TOKEN_ADDRESS;
  if (!dpTokenAddress) {
    throw new Error("DP_TOKEN_ADDRESS is not set in .env");
  }
  console.log("DP_TOKEN_ADDRESS:", dpTokenAddress);

  // 1. SBT 컨트랙트 배포
  const CreatorSBT = await ethers.getContractFactory("CreatorSBT");
  const sbt = await CreatorSBT.deploy();
  await sbt.waitForDeployment();
  console.log("SBT deployed to:", sbt.target);

  // 2. PlatformRegistry 배포
  const PlatformRegistry = await ethers.getContractFactory("PlatformRegistry");
  const registry = await PlatformRegistry.deploy();
  await registry.waitForDeployment();
  console.log("Registry deployed to:", registry.target);

  // 3. Registry에 SBT 주소 등록 (MerchandiseFactory 배포 전에 필요)
  console.log("Registering SBT contract in PlatformRegistry...");
  await registry.setSBTContract(sbt.target);
  console.log("✅ SBT contract registered in PlatformRegistry.");

  // 4. MerchandiseFactory 배포 (PlatformRegistry, SBT, DP 토큰 주소 필요)
  const MerchandiseFactory = await ethers.getContractFactory(
    "MerchandiseFactory"
  );
  const merchFactory = await MerchandiseFactory.deploy(
    registry.target,
    sbt.target,
    dpTokenAddress
  );
  await merchFactory.waitForDeployment();
  console.log("MerchandiseFactory deployed to:", merchFactory.target);

  // 5. IPNFTFactory 배포 (name, symbol, PlatformRegistry, DP 토큰 주소 필요)
  const IPNFTFactory = await ethers.getContractFactory("IPNFTFactory");
  const ipnftFactory = await IPNFTFactory.deploy(
    "Dressdio IP NFT", // name
    "DIPNFT", // symbol
    registry.target, // platformRegistry address
    dpTokenAddress, // DP token address
    {} // ethers v6: overrides 파라미터 추가
  );
  await ipnftFactory.waitForDeployment();
  console.log("IPNFTFactory deployed to:", ipnftFactory.target);

  // IPNFT 컨트랙트 주소 가져오기
  const ipnftAddress = await ipnftFactory.getIPNFTAddress();
  console.log("IPNFT deployed to:", ipnftAddress);

  // 6. Registry에 나머지 주소 등록
  console.log("Registering remaining contracts in PlatformRegistry...");
  await registry.setMerchandiseFactory(merchFactory.target);
  await registry.setIPNFTFactory(ipnftFactory.target);
  console.log("✅ All contracts registered in PlatformRegistry.");

  // 7. 각 컨트랙트 소유권을 ABC Wallet 관리자로 이전
  console.log("Transferring ownership to ABC Wallet admin...");

  // PlatformRegistry 소유권 이전
  try {
    const tx = await registry.transferOwnership(ABC_ADMIN_ADDRESS);
    console.log("PlatformRegistry ownership transfer tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log(
      "PlatformRegistry ownership confirmed in block:",
      receipt.blockNumber
    );
    const newOwner = await registry.owner();
    console.log("Current PlatformRegistry owner:", newOwner);
    if (newOwner !== ABC_ADMIN_ADDRESS) {
      throw new Error(
        `PlatformRegistry ownership transfer failed! Expected: ${ABC_ADMIN_ADDRESS}, Got: ${newOwner}`
      );
    }
    console.log("✅ PlatformRegistry ownership transfer confirmed!");
  } catch (error) {
    console.error("❌ PlatformRegistry ownership transfer failed:");
    console.error(error.message);
    throw error;
  }

  // SBT 소유권 이전
  try {
    const tx = await sbt.transferOwnership(ABC_ADMIN_ADDRESS);
    console.log("SBT ownership transfer tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("SBT ownership confirmed in block:", receipt.blockNumber);
    const newOwner = await sbt.owner();
    console.log("Current SBT owner:", newOwner);
    if (newOwner !== ABC_ADMIN_ADDRESS) {
      throw new Error(
        `SBT ownership transfer failed! Expected: ${ABC_ADMIN_ADDRESS}, Got: ${newOwner}`
      );
    }
    console.log("✅ SBT ownership transfer confirmed!");
  } catch (error) {
    console.error("❌ SBT ownership transfer failed:");
    console.error(error.message);
    throw error;
  }

  // MerchandiseFactory 소유권 이전
  try {
    const tx = await merchFactory.transferOwnership(ABC_ADMIN_ADDRESS);
    console.log("MerchandiseFactory ownership transfer tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log(
      "MerchandiseFactory ownership confirmed in block:",
      receipt.blockNumber
    );
    const newOwner = await merchFactory.owner();
    console.log("Current MerchandiseFactory owner:", newOwner);
    if (newOwner !== ABC_ADMIN_ADDRESS) {
      throw new Error(
        `MerchandiseFactory ownership transfer failed! Expected: ${ABC_ADMIN_ADDRESS}, Got: ${newOwner}`
      );
    }
    console.log("✅ MerchandiseFactory ownership transfer confirmed!");
  } catch (error) {
    console.error("❌ MerchandiseFactory ownership transfer failed:");
    console.error(error.message);
    throw error;
  }

  // IPNFTFactory 소유권 이전
  try {
    const tx = await ipnftFactory.transferOwnership(ABC_ADMIN_ADDRESS);
    console.log("IPNFTFactory ownership transfer tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log(
      "IPNFTFactory ownership confirmed in block:",
      receipt.blockNumber
    );
    const newOwner = await ipnftFactory.owner();
    console.log("Current IPNFTFactory owner:", newOwner);
    if (newOwner !== ABC_ADMIN_ADDRESS) {
      throw new Error(
        `IPNFTFactory ownership transfer failed! Expected: ${ABC_ADMIN_ADDRESS}, Got: ${newOwner}`
      );
    }
    console.log("✅ IPNFTFactory ownership transfer confirmed!");
  } catch (error) {
    console.error("❌ IPNFTFactory ownership transfer failed:");
    console.error(error.message);
    throw error;
  }

  // 배포된 주소 정보 출력
  console.log("\nDeployed Contract Addresses:");
  console.log("-----------------------------");
  console.log("CreatorSBT:", sbt.target);
  console.log("PlatformRegistry:", registry.target);
  console.log("MerchandiseFactory:", merchFactory.target);
  console.log("IPNFTFactory:", ipnftFactory.target);
  console.log("IPNFT:", ipnftAddress);
  console.log("DP Token:", dpTokenAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
