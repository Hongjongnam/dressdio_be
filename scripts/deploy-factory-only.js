require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Factory contract with:", deployer.address);

  // 환경 변수에서 주소들 가져오기
  const platformRegistryAddress = process.env.PLATFORM_REGISTRY_ADDRESS;
  const sbtContractAddress = process.env.SBT_CONTRACT_ADDRESS;
  const dpTokenAddress = process.env.DP_TOKEN_ADDRESS;

  console.log("PlatformRegistry:", platformRegistryAddress);
  console.log("SBT Contract:", sbtContractAddress);
  console.log("DP Token:", dpTokenAddress);

  // MerchandiseFactory 배포
  const MerchandiseFactory = await ethers.getContractFactory(
    "MerchandiseFactory"
  );
  const merchFactory = await MerchandiseFactory.deploy(
    platformRegistryAddress,
    sbtContractAddress,
    dpTokenAddress
  );
  await merchFactory.waitForDeployment();
  console.log("MerchandiseFactory deployed to:", merchFactory.target);

  // PlatformRegistry에 새로운 Factory 주소 등록
  const PlatformRegistry = await ethers.getContractFactory("PlatformRegistry");
  const registry = PlatformRegistry.attach(platformRegistryAddress);

  console.log("Updating Factory address in PlatformRegistry...");
  const tx = await registry.setMerchandiseFactory(merchFactory.target);
  await tx.wait();
  console.log("✅ Factory address updated in PlatformRegistry");

  // 소유권 이전
  const ABC_ADMIN_ADDRESS = process.env.PLATFORM_ADMIN_WALLET_ADDRESS;
  console.log("Transferring Factory ownership to:", ABC_ADMIN_ADDRESS);

  const ownershipTx = await merchFactory.transferOwnership(ABC_ADMIN_ADDRESS);
  await ownershipTx.wait();
  console.log("✅ Factory ownership transferred");

  console.log("\nNew Factory Address:", merchFactory.target);
  console.log("Please update your environment variable:");
  console.log(`MERCH_FACTORY_ADDRESS=${merchFactory.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
