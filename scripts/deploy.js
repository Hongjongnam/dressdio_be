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

  // 3. MerchandiseFactory 배포
  const MerchandiseFactory = await ethers.getContractFactory(
    "MerchandiseFactory"
  );
  const merchFactory = await MerchandiseFactory.deploy();
  await merchFactory.waitForDeployment();
  console.log("MerchandiseFactory deployed to:", merchFactory.target);

  // 4. IPNFTFactory 배포
  const IPNFTFactory = await ethers.getContractFactory("IPNFTFactory");
  const ipnftFactory = await IPNFTFactory.deploy();
  await ipnftFactory.waitForDeployment();
  console.log("IPNFTFactory deployed to:", ipnftFactory.target);

  // 5. Registry에 주소 등록
  await registry.setSBTContract(sbt.target);
  await registry.setMerchandiseFactory(merchFactory.target);
  await registry.setIPNFTFactory(ipnftFactory.target);

  console.log("All contracts registered in PlatformRegistry.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
