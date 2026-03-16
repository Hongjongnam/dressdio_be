require("dotenv").config();

async function main() {
  const registryAddress = "0x5E7800Aa04b4DA4E3D4233223C91F65De6A64340"; // 현재 배포된 주소
  const ABC_ADMIN_ADDRESS = "0x78bBD87Ad705C67837CD5616995E1d67B36693c3";

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const PlatformRegistry = await ethers.getContractFactory("PlatformRegistry");
  const registry = PlatformRegistry.attach(registryAddress);

  // 현재 소유자 확인
  const currentOwner = await registry.owner();
  console.log("Current owner:", currentOwner);

  if (currentOwner === ABC_ADMIN_ADDRESS) {
    console.log("✅ Ownership already transferred!");
    return;
  }

  // 소유권 이전 시도
  console.log("Attempting ownership transfer...");
  console.log("From:", currentOwner);
  console.log("To:", ABC_ADMIN_ADDRESS);

  try {
    // 트랜잭션 실행 (가스 제한 없이)
    const tx = await registry.transferOwnership(ABC_ADMIN_ADDRESS);

    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");

    // 트랜잭션 완료 대기
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // 소유권 확인
    const newOwner = await registry.owner();
    console.log("New owner:", newOwner);

    if (newOwner === ABC_ADMIN_ADDRESS) {
      console.log("✅ Ownership transfer successful!");
    } else {
      console.log("❌ Ownership transfer failed!");
      console.log("Expected:", ABC_ADMIN_ADDRESS);
      console.log("Got:", newOwner);
    }
  } catch (error) {
    console.error("❌ Error during ownership transfer:");
    console.error(error.message);

    // 에러 상세 정보
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
