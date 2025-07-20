const fs = require("fs").promises;
const path = require("path");
const { web3 } = require("../config/web3");

/**
 * 숫자를 읽기 쉬운 형태로 포맷팅하는 함수
 * @param {string|number} value - 포맷팅할 값
 * @returns {string} 포맷팅된 문자열
 */
const formatNumber = (value) => {
  if (!value) return "0";

  // 문자열을 숫자로 변환
  const num = parseFloat(value);

  // 매우 작은 값 (1e-10 미만)은 0으로 처리
  if (Math.abs(num) < 1e-10) {
    return "0.00";
  }

  // 과학적 표기법을 일반 소수점으로 변환
  if (Math.abs(num) < 0.01 && num !== 0) {
    // 매우 작은 값은 소수점 8자리까지 표시
    return num.toFixed(8).replace(/\.?0+$/, "");
  }

  // 일반적인 값은 소수점 2자리까지 표시
  return num.toFixed(2);
};

/**
 * 구매 영수증 생성 및 저장
 * @param {Object} purchaseData - 구매 데이터
 * @param {Array} distributionData - 분배 데이터 배열
 * @param {Object} transactionData - 트랜잭션 데이터
 * @returns {Object} 생성된 영수증 정보
 */
const generateReceipt = async (
  purchaseData,
  distributionData,
  transactionData
) => {
  const timestamp = new Date().toISOString();
  const receiptId = `receipt_${purchaseData.projectId}_${
    purchaseData.requestId
  }_${Date.now()}`;

  // 영수증 데이터 구성
  const receipt = {
    receiptId: receiptId,
    timestamp: timestamp,
    purchase: {
      projectId: purchaseData.projectId.toString(),
      requestId: purchaseData.requestId.toString(),
      buyer: purchaseData.buyer,
      tokenId: purchaseData.tokenId.toString(),
      amount: purchaseData.amount.toString(),
      amountInDP: purchaseData.amountInDP,
    },
    distribution: distributionData.map((dist) => ({
      role: dist.role,
      recipient: dist.recipient,
      expectedAmount: formatNumber(dist.expectedAmount),
      fee: formatNumber(dist.fee),
      netAmount: formatNumber(dist.netAmount),
      beforeBalance: dist.beforeBalance.toString(),
      afterBalance: dist.afterBalance.toString(),
      actualIncrease: formatNumber(dist.actualIncrease),
      isMatched: dist.isMatched,
    })),
    transaction: {
      hash: transactionData.hash,
      blockNumber: transactionData.blockNumber.toString(),
      gasUsed: transactionData.gasUsed.toString(),
      timestamp: transactionData.timestamp || timestamp,
    },
    nft: {
      projectName: purchaseData.projectName,
      description: purchaseData.description,
      imageUri: purchaseData.imageUri,
      tokenUri: purchaseData.tokenUri,
    },
    summary: {
      totalAmount: formatNumber(purchaseData.amount),
      totalFees: formatNumber(
        distributionData
          .filter((dist) => dist.role.includes("Platform Fee"))
          .reduce((sum, dist) => {
            // DP 단위 문자열을 숫자로 변환하여 계산
            const feeAmount = parseFloat(dist.fee);
            return sum + feeAmount;
          }, 0)
      ),
      totalNetDistribution: formatNumber(
        distributionData
          .filter((dist) => !dist.role.includes("Platform Fee"))
          .reduce((sum, dist) => {
            // DP 단위 문자열을 숫자로 변환하여 계산
            const netAmount = parseFloat(dist.netAmount);
            return sum + netAmount;
          }, 0)
      ),
      participants: distributionData.filter(
        (dist) => !dist.role.includes("Platform Fee")
      ).length,
    },
  };

  // 영수증 파일 저장
  const receiptsDir = path.join(__dirname, "../../receipts");
  const fileName = `${receiptId}.json`;
  const filePath = path.join(receiptsDir, fileName);

  try {
    // receipts 디렉토리가 없으면 생성
    await fs.mkdir(receiptsDir, { recursive: true });

    // 영수증 파일 저장
    await fs.writeFile(filePath, JSON.stringify(receipt, null, 2), "utf8");

    console.log(`영수증 생성 완료: ${fileName}`);

    return {
      success: true,
      receiptId: receiptId,
      filePath: filePath,
      receipt: receipt,
    };
  } catch (error) {
    console.error("영수증 저장 실패:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * 영수증 조회
 * @param {string} receiptId - 영수증 ID
 * @returns {Object} 영수증 데이터
 */
const getReceipt = async (receiptId) => {
  try {
    const receiptsDir = path.join(__dirname, "../../receipts");
    const filePath = path.join(receiptsDir, `${receiptId}.json`);

    const receiptData = await fs.readFile(filePath, "utf8");
    return {
      success: true,
      receipt: JSON.parse(receiptData),
    };
  } catch (error) {
    console.error("영수증 조회 실패:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * 모든 영수증 목록 조회
 * @returns {Array} 영수증 목록
 */
const getAllReceipts = async () => {
  try {
    const receiptsDir = path.join(__dirname, "../../receipts");

    // receipts 디렉토리가 없으면 빈 배열 반환
    try {
      await fs.access(receiptsDir);
    } catch {
      return { success: true, receipts: [] };
    }

    const files = await fs.readdir(receiptsDir);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    const receipts = [];
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(receiptsDir, file);
        const receiptData = await fs.readFile(filePath, "utf8");
        const receipt = JSON.parse(receiptData);
        receipts.push({
          receiptId: receipt.receiptId,
          timestamp: receipt.timestamp,
          projectId: receipt.purchase.projectId,
          buyer: receipt.purchase.buyer,
          amount: receipt.purchase.amountInDP,
          tokenId: receipt.purchase.tokenId,
        });
      } catch (error) {
        console.error(`영수증 파일 ${file} 읽기 실패:`, error);
      }
    }

    // 최신 순으로 정렬
    receipts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {
      success: true,
      receipts: receipts,
    };
  } catch (error) {
    console.error("영수증 목록 조회 실패:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * 프로젝트별 영수증 조회
 * @param {number} projectId - 프로젝트 ID
 * @returns {Array} 해당 프로젝트의 영수증 목록
 */
const getReceiptsByProject = async (projectId) => {
  try {
    const allReceipts = await getAllReceipts();
    if (!allReceipts.success) {
      return allReceipts;
    }

    const projectReceipts = allReceipts.receipts.filter(
      (receipt) => receipt.projectId == projectId
    );

    return {
      success: true,
      receipts: projectReceipts,
    };
  } catch (error) {
    console.error("프로젝트별 영수증 조회 실패:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  generateReceipt,
  getReceipt,
  getAllReceipts,
  getReceiptsByProject,
};
