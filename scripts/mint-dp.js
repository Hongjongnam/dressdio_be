require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();

  // .env에서 주소 읽기
  const DP_TOKEN_ADDRESS = process.env.DP_TOKEN_ADDRESS;
  const ADMIN_ADDRESS = process.env.DRESSDIO_ADMIN_WALLET_ADDRESS;

  if (!DP_TOKEN_ADDRESS || !ADMIN_ADDRESS) {
    throw new Error(
      "DP_TOKEN_ADDRESS 또는 DRESSDIO_ADMIN_WALLET_ADDRESS가 .env에 설정되어 있어야 합니다."
    );
  }

  const DPToken = await ethers.getContractFactory("DPToken");
  const dpToken = await DPToken.attach(DP_TOKEN_ADDRESS);

  const amount = ethers.parseUnits("1000000000", 18); // 10억 DP

  const tx = await dpToken.mint(ADMIN_ADDRESS, amount);
  await tx.wait();
  console.log(`Minted 1,000,000,000 DP to ${ADMIN_ADDRESS}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
