require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

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

  // 3. MerchandiseFactory 배포 (PlatformRegistry 주소 필요)
  const MerchandiseFactory = await ethers.getContractFactory(
    "MerchandiseFactory"
  );
  const merchFactory = await MerchandiseFactory.deploy(registry.target);
  await merchFactory.waitForDeployment();
  console.log("MerchandiseFactory deployed to:", merchFactory.target);

  // DP 토큰 주소 환경변수 체크 및 출력
  const dpTokenAddress = process.env.DP_TOKEN_ADDRESS;
  if (!dpTokenAddress) {
    throw new Error("DP_TOKEN_ADDRESS is not set in .env");
  }
  console.log("DP_TOKEN_ADDRESS:", dpTokenAddress);

  // 4. IPNFTFactory 배포 (name, symbol, PlatformRegistry, DP 토큰 주소 필요)
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

  // 5. Registry에 주소 등록
  await registry.setSBTContract(sbt.target);
  await registry.setMerchandiseFactory(merchFactory.target);
  await registry.setIPNFTFactory(ipnftFactory.target);

  console.log("All contracts registered in PlatformRegistry.");

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
