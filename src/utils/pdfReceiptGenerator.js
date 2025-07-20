const PDFDocument = require("pdfkit");
const fs = require("fs").promises;
const path = require("path");

// 색상 팔레트
const COLORS = {
  primary: "#2c3e50",
  secondary: "#34495e",
  accent: "#3498db",
  success: "#27ae60",
  warning: "#f39c12",
  danger: "#e74c3c",
  light: "#ecf0f1",
  dark: "#2c3e50",
  brand: "#e74c3c",
  artist: "#3498db",
  influencer: "#f39c12",
  platform: "#9b59b6",
};

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
 * 영수증 JSON 데이터를 기반으로 PDF 영수증 생성
 * @param {Object} receiptData - 영수증 JSON 데이터
 * @returns {Object} 생성 결과
 */
const generatePDFReceipt = async (receiptData) => {
  try {
    console.log("PDF 생성 시작:", receiptData.receiptId);

    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
    });

    // PDF 파일 경로 설정
    const receiptsDir = path.join(__dirname, "../../receipts");
    const pdfFileName = `${receiptData.receiptId}.pdf`;
    const pdfFilePath = path.join(receiptsDir, pdfFileName);

    console.log("PDF 파일 경로:", pdfFilePath);

    // PDF 파일 스트림 생성
    const writeStream = require("fs").createWriteStream(pdfFilePath);
    doc.pipe(writeStream);

    console.log("PDF 내용 작성 시작...");

    // PDF 내용 작성 (await 제거)
    createReceiptContent(doc, receiptData);

    console.log("PDF 내용 작성 완료, PDF 종료 중...");

    // PDF 완료
    doc.end();

    return new Promise((resolve, reject) => {
      writeStream.on("finish", () => {
        console.log("PDF 파일 쓰기 완료:", pdfFileName);
        resolve({
          success: true,
          pdfPath: pdfFilePath,
          pdfFileName: pdfFileName,
        });
      });
      writeStream.on("error", (error) => {
        console.error("PDF 파일 쓰기 오류:", error);
        reject({
          success: false,
          error: error.message,
        });
      });
    });
  } catch (error) {
    console.error("PDF 생성 중 오류:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * PDF 영수증 내용 생성
 * @param {PDFDocument} doc - PDF 문서 객체
 * @param {Object} receiptData - 영수증 데이터
 */
const createReceiptContent = (doc, receiptData) => {
  let currentY = 150; // 헤더 이후 시작 위치
  const pageHeight = doc.page.height;
  const margin = 50;

  // 헤더 섹션
  currentY = createHeader(doc, receiptData, currentY);

  // 구매 정보 섹션
  currentY = createPurchaseInfo(doc, receiptData, currentY);

  // NFT 정보 섹션
  currentY = createNFTInfo(doc, receiptData, currentY);

  // 분배 정보 섹션
  currentY = createDistributionInfo(doc, receiptData, currentY);

  // 트랜잭션 정보 섹션
  currentY = createTransactionInfo(doc, receiptData, currentY);

  // 요약 정보 섹션
  currentY = createSummaryInfo(doc, receiptData, currentY);

  // 푸터 섹션 (페이지 하단에 고정)
  const footerY = pageHeight - 100;
  createFooter(doc, footerY);
};

/**
 * 헤더 섹션 생성
 */
const createHeader = (doc, receiptData, startY) => {
  // 배경 박스
  doc.rect(0, 0, doc.page.width, 120).fill(COLORS.primary);

  // 로고 영역 (텍스트로 대체)
  doc
    .fillColor("white")
    .fontSize(24)
    .font("Helvetica-Bold")
    .text("DRESSDIO", 50, 30, { align: "left" });

  doc
    .fillColor("white")
    .fontSize(12)
    .font("Helvetica")
    .text("NFT Marketplace", 50, 55, { align: "left" });

  // 영수증 제목
  doc
    .fillColor("white")
    .fontSize(20)
    .font("Helvetica-Bold")
    .text("PURCHASE RECEIPT", doc.page.width - 200, 30, { align: "right" });

  // 영수증 ID와 날짜
  doc
    .fillColor("white")
    .fontSize(10)
    .font("Helvetica")
    .text(`Receipt ID: ${receiptData.receiptId}`, doc.page.width - 200, 55, {
      align: "right",
    });

  doc
    .fillColor("white")
    .fontSize(10)
    .font("Helvetica")
    .text(
      `Date: ${new Date(receiptData.timestamp).toLocaleString("en-US")}`,
      doc.page.width - 200,
      70,
      { align: "right" }
    );

  // 구분선
  doc
    .moveTo(50, 120)
    .lineTo(doc.page.width - 50, 120)
    .strokeColor(COLORS.accent)
    .lineWidth(2)
    .stroke();

  return 150; // 헤더 이후 Y 위치 반환
};

/**
 * 구매 정보 섹션 생성
 */
const createPurchaseInfo = (doc, receiptData, startY) => {
  // 섹션 제목
  doc
    .fillColor(COLORS.primary)
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("PURCHASE INFORMATION", 50, startY);

  // 정보 박스
  const boxY = startY + 20;
  const boxHeight = 80;

  doc
    .rect(50, boxY, doc.page.width - 100, boxHeight)
    .fillColor(COLORS.light)
    .fill();

  // 구매 정보
  const infoX = 60;
  const infoY = boxY + 15;
  const colWidth = (doc.page.width - 120) / 2;

  doc.fillColor(COLORS.dark).fontSize(10).font("Helvetica-Bold");

  doc.text("Project ID:", infoX, infoY);
  doc.text("Request ID:", infoX, infoY + 15);
  doc.text("Buyer:", infoX, infoY + 30);
  doc.text("Token ID:", infoX, infoY + 45);
  doc.text("Amount:", infoX, infoY + 60);

  doc.fillColor(COLORS.primary).font("Helvetica");

  doc.text(receiptData.purchase.projectId, infoX + colWidth, infoY);
  doc.text(receiptData.purchase.requestId, infoX + colWidth, infoY + 15);
  doc.text(receiptData.purchase.buyer, infoX + colWidth, infoY + 30);
  doc.text(
    receiptData.purchase.tokenId.toString(),
    infoX + colWidth,
    infoY + 45
  );
  doc.text(
    `${receiptData.purchase.amountInDP} DP`,
    infoX + colWidth,
    infoY + 60
  );

  return boxY + boxHeight + 40; // 다음 섹션 시작 위치
};

/**
 * NFT 정보 섹션 생성
 */
const createNFTInfo = (doc, receiptData, startY) => {
  // 섹션 제목
  doc
    .fillColor(COLORS.primary)
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("NFT INFORMATION", 50, startY);

  // 정보 박스
  const boxY = startY + 20;
  const boxHeight = 60;

  doc
    .rect(50, boxY, doc.page.width - 100, boxHeight)
    .fillColor(COLORS.light)
    .fill();

  // NFT 정보
  const infoX = 60;
  const infoY = boxY + 15;

  doc.fillColor(COLORS.dark).fontSize(10).font("Helvetica-Bold");

  doc.text("Project Name:", infoX, infoY);
  doc.text("Description:", infoX, infoY + 25);

  doc.fillColor(COLORS.primary).font("Helvetica");

  doc.text(receiptData.nft.projectName, infoX + 100, infoY);
  doc.text(receiptData.nft.description, infoX + 100, infoY + 25);

  return boxY + boxHeight + 40; // 다음 섹션 시작 위치
};

/**
 * 분배 정보 섹션 생성
 */
const createDistributionInfo = (doc, receiptData, startY) => {
  // 섹션 제목
  doc
    .fillColor(COLORS.primary)
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("DISTRIBUTION DETAILS", 50, startY);

  // 테이블 헤더
  const tableY = startY + 20;
  const headerY = tableY;
  const pageHeight = doc.page.height;

  // 헤더 배경
  doc
    .rect(50, headerY, doc.page.width - 100, 25)
    .fillColor(COLORS.accent)
    .fill();

  // 헤더 텍스트
  doc
    .fillColor("white")
    .fontSize(10)
    .font("Helvetica-Bold")
    .text("Role", 60, headerY + 8)
    .text("Recipient", 190, headerY + 8)
    .text("Net Amount", 350, headerY + 8)
    .text("Platform Fee", 440, headerY + 8)
    .text("Status", 530, headerY + 8);

  // 분배 데이터
  let rowY = headerY + 25;
  receiptData.distribution.forEach((dist, index) => {
    // 페이지 나누기 체크
    if (rowY > pageHeight - 200) {
      doc.addPage();
      rowY = 50; // 새 페이지 시작 위치

      // 새 페이지에 헤더 다시 그리기
      doc
        .rect(50, rowY, doc.page.width - 100, 25)
        .fillColor(COLORS.accent)
        .fill();

      doc
        .fillColor("white")
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("Role", 60, rowY + 8)
        .text("Recipient", 190, rowY + 8)
        .text("Net Amount", 350, rowY + 8)
        .text("Platform Fee", 440, rowY + 8)
        .text("Status", 530, rowY + 8);

      rowY += 25;
    }

    const isEven = index % 2 === 0;
    const bgColor = isEven ? COLORS.light : "white";

    // 행 배경
    doc
      .rect(50, rowY, doc.page.width - 100, 25)
      .fillColor(bgColor)
      .fill();

    // 역할별 색상
    const roleColor = getRoleColor(dist.role.toLowerCase());

    // 데이터 텍스트
    doc
      .fillColor(roleColor)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(dist.role, 60, rowY + 8);

    doc
      .fillColor(COLORS.primary)
      .font("Helvetica")
      .text(dist.recipient, 190, rowY + 8)
      .text(
        `${formatNumber(parseFloat(dist.netAmount) / 1e18)} DP`,
        350,
        rowY + 8
      )
      .text(`${formatNumber(parseFloat(dist.fee) / 1e18)} DP`, 440, rowY + 8);

    // 상태 표시
    const statusColor = dist.isMatched ? COLORS.success : COLORS.danger;
    const statusText = dist.isMatched ? "✓ Verified" : "✗ Error";

    doc
      .fillColor(statusColor)
      .font("Helvetica-Bold")
      .text(statusText, 530, rowY + 8);

    rowY += 25;
  });

  return rowY + 40; // 다음 섹션 시작 위치
};

/**
 * 트랜잭션 정보 섹션 생성
 */
const createTransactionInfo = (doc, receiptData, startY) => {
  // 섹션 제목
  doc
    .fillColor(COLORS.primary)
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("BLOCKCHAIN TRANSACTION", 50, startY);

  // 정보 박스
  const boxY = startY + 20;
  const boxHeight = 80;

  doc
    .rect(50, boxY, doc.page.width - 100, boxHeight)
    .fillColor(COLORS.light)
    .fill();

  // 트랜잭션 정보
  const infoX = 60;
  const infoY = boxY + 15;

  doc.fillColor(COLORS.dark).fontSize(10).font("Helvetica-Bold");

  doc.text("Transaction Hash:", infoX, infoY);
  doc.text("Block Number:", infoX, infoY + 20);
  doc.text("Gas Used:", infoX, infoY + 40);

  doc.fillColor(COLORS.primary).font("Helvetica").fontSize(8);

  doc.text(receiptData.transaction.hash, infoX + 120, infoY);
  doc.text(
    receiptData.transaction.blockNumber.toString(),
    infoX + 120,
    infoY + 20
  );
  doc.text(receiptData.transaction.gasUsed.toString(), infoX + 120, infoY + 40);

  return boxY + boxHeight + 40; // 다음 섹션 시작 위치
};

/**
 * 요약 정보 섹션 생성
 */
const createSummaryInfo = (doc, receiptData, startY) => {
  // 섹션 제목
  doc
    .fillColor(COLORS.primary)
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("SUMMARY", 50, startY);

  // 요약 박스
  const boxY = startY + 20;
  const boxHeight = 100;

  doc
    .rect(50, boxY, doc.page.width - 100, boxHeight)
    .fillColor(COLORS.primary)
    .fill();

  // 요약 정보
  const infoX = 60;
  const infoY = boxY + 15;
  const colWidth = (doc.page.width - 120) / 2;

  doc.fillColor("white").fontSize(10).font("Helvetica-Bold");

  doc.text("Total Amount:", infoX, infoY);
  doc.text("Total Platform Fees:", infoX, infoY + 20);
  doc.text("Total Net Distribution:", infoX, infoY + 40);
  doc.text("Participants:", infoX, infoY + 60);
  doc.text("Transaction Status:", infoX, infoY + 80);

  doc.fillColor("white").font("Helvetica");

  doc.text(
    `${formatNumber(parseFloat(receiptData.summary.totalAmount) / 1e18)} DP`,
    infoX + colWidth,
    infoY
  );
  doc.text(
    `${formatNumber(parseFloat(receiptData.summary.totalFees) / 1e18)} DP`,
    infoX + colWidth,
    infoY + 20
  );
  doc.text(
    `${formatNumber(
      parseFloat(receiptData.summary.totalNetDistribution) / 1e18
    )} DP`,
    infoX + colWidth,
    infoY + 40
  );
  doc.text(
    receiptData.summary.participants.toString(),
    infoX + colWidth,
    infoY + 60
  );

  // 트랜잭션 상태
  const allVerified = receiptData.distribution.every((dist) => dist.isMatched);
  const statusColor = allVerified ? COLORS.success : COLORS.danger;
  const statusText = allVerified ? "✓ Completed" : "✗ Failed";

  doc
    .fillColor(statusColor)
    .font("Helvetica-Bold")
    .text(statusText, infoX + colWidth, infoY + 80);

  return boxY + boxHeight + 40; // 다음 섹션 시작 위치
};

/**
 * 푸터 섹션 생성
 */
const createFooter = (doc, startY) => {
  // 구분선
  doc
    .moveTo(50, startY)
    .lineTo(doc.page.width - 50, startY)
    .strokeColor(COLORS.accent)
    .lineWidth(1)
    .stroke();

  // 푸터 텍스트
  doc
    .fillColor(COLORS.secondary)
    .fontSize(8)
    .font("Helvetica")
    .text(
      "This receipt is automatically generated by the DressDio NFT Marketplace.",
      50,
      startY + 20,
      { align: "center" }
    );

  doc
    .fillColor(COLORS.secondary)
    .fontSize(8)
    .font("Helvetica")
    .text(
      "For support, please contact our customer service team.",
      50,
      startY + 35,
      { align: "center" }
    );

  // QR 코드 영역 (텍스트로 대체)
  doc
    .fillColor(COLORS.primary)
    .fontSize(6)
    .font("Helvetica")
    .text(
      "Powered by Blockchain Technology",
      doc.page.width - 150,
      startY + 50,
      { align: "right" }
    );
};

// 역할별 색상
const getRoleColor = (role) => {
  const colors = {
    brand: COLORS.brand,
    artist: COLORS.artist,
    influencer: COLORS.influencer,
    platform: COLORS.platform,
  };

  // 역할 이름에서 키워드 매칭
  if (role.includes("brand") || role.includes("Brand")) return COLORS.brand;
  if (role.includes("artist") || role.includes("Artist")) return COLORS.artist;
  if (role.includes("influencer") || role.includes("Influencer"))
    return COLORS.influencer;
  if (role.includes("platform") || role.includes("Platform"))
    return COLORS.platform;

  return COLORS.secondary;
};

/**
 * 영수증 ID로 PDF 파일 경로 조회
 * @param {string} receiptId - 영수증 ID
 * @returns {string} PDF 파일 경로
 */
const getPDFPath = (receiptId) => {
  const receiptsDir = path.join(__dirname, "../../receipts");
  return path.join(receiptsDir, `${receiptId}.pdf`);
};

/**
 * PDF 파일 존재 여부 확인
 * @param {string} receiptId - 영수증 ID
 * @returns {boolean} 파일 존재 여부
 */
const checkPDFExists = async (receiptId) => {
  try {
    const pdfPath = getPDFPath(receiptId);
    await fs.access(pdfPath);
    return true;
  } catch {
    return false;
  }
};

/**
 * 영수증 JSON 데이터를 기반으로 PDF 생성 (없는 경우에만)
 * @param {Object} receiptData - 영수증 JSON 데이터
 * @returns {Object} 생성 결과
 */
const generatePDFIfNotExists = async (receiptData) => {
  try {
    // PDF가 이미 존재하는지 확인
    const exists = await checkPDFExists(receiptData.receiptId);

    if (exists) {
      return {
        success: true,
        pdfPath: getPDFPath(receiptData.receiptId),
        pdfFileName: `${receiptData.receiptId}.pdf`,
        message: "PDF already exists",
      };
    }

    // PDF 생성
    return await generatePDFReceipt(receiptData);
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  generatePDFReceipt,
  generatePDFIfNotExists,
  getPDFPath,
  checkPDFExists,
};
