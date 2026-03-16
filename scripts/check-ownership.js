require("dotenv").config();

async function main() {
  const registryAddress = "0x5E7800Aa04b4DA4E3D4233223C91F65De6A64340"; // 현재 배포된 주소
  const ABC_ADMIN_ADDRESS = "0x78bBD87Ad705C67837CD5616995E1d67B36693c3";

  const PlatformRegistry = await ethers.getContractFactory("PlatformRegistry");
  const registry = PlatformRegistry.attach(registryAddress);

  console.log("Checking PlatformRegistry ownership...");
  console.log("Registry Address:", registryAddress);

  const currentOwner = await registry.owner();
  console.log("Current Owner:", currentOwner);
  console.log("Expected Owner:", ABC_ADMIN_ADDRESS);
  console.log("Ownership Match:", currentOwner === ABC_ADMIN_ADDRESS);

  // 배포자 계정 정보
  const [deployer] = await ethers.getSigners();
  console.log("Deployer Address:", deployer.address);
  console.log("Deployer is Owner:", currentOwner === deployer.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
