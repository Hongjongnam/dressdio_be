document.addEventListener("DOMContentLoaded", () => {
  const sidebarNav = document.querySelector(".sidebar-nav");
  const tabContent = document.getElementById("tab-content");
  const contentTitle = document.getElementById("content-title");
  const navItems = document.querySelectorAll(".nav-item");

  const loadTabContent = (tabName) => {
    fetch(`tab-${tabName}.html`)
      .then((response) => (response.ok ? response.text() : ""))
      .then((html) => {
        tabContent.innerHTML = html;
        initializeTabScripts(tabName);
      })
      .catch((error) => console.error(`Error loading ${tabName}.html:`, error));
  };

  const setActiveTab = (tabItem) => {
    navItems.forEach((item) => item.classList.remove("active"));
    tabItem.classList.add("active");
    const tabName = tabItem.dataset.tab;
    const titleText = tabItem.querySelector("span")?.textContent || "Dashboard";
    contentTitle.textContent = titleText;
    loadTabContent(tabName);
  };

  sidebarNav.addEventListener("click", (e) => {
    e.preventDefault();
    const navItem = e.target.closest(".nav-item");
    if (navItem) {
      setActiveTab(navItem);
    }
  });

  const initialTab = document.querySelector(".nav-item.active");
  if (initialTab) {
    setActiveTab(initialTab);
  }
});

const showResult = (elementId, message, type = "info") => {
  const resultElement = document.getElementById(elementId);
  if (resultElement) {
    if (typeof message === "object") {
      resultElement.textContent = JSON.stringify(message, null, 2);
    } else {
      resultElement.textContent = message;
    }
    resultElement.className = `result ${type}`;
    resultElement.style.display = "block";
  }
};

const makeRequest = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "API request failed");
    }
    return result;
  } catch (error) {
    console.error("Request failed:", error);
    return { status: "error", message: error.message, data: null };
  }
};

// 각 탭의 스크립트를 초기화하는 함수
const initializeTabScripts = (tabName) => {
  console.log(`${tabName} tab loaded and scripts initialized.`);
  if (tabName === "auth") {
    setupAuthTab();
  } else if (tabName === "sbt") {
    setupSbtTab();
  } else if (tabName === "ipnft") {
    setupIpNftTab();
  } else if (tabName === "merchandise") {
    setupMerchandiseTab();
  } else if (tabName === "platform") {
    setupPlatformTab();
  } else if (tabName === "blockchain") {
    setupBlockchainTab();
  }
  // 다른 탭들의 초기화 함수도 여기에 추가
};

const getMpcWalletData = () => {
  const data = localStorage.getItem("MpcWalletData");
  return data ? JSON.parse(data) : null;
};

// =================================================================
//  공용 헬퍼 함수 (전역 스코프로 이동)
// =================================================================

const handleFormSubmit = async (
  formId,
  resultId,
  endpoint,
  requiresAuth = false
) => {
  const form = document.getElementById(formId);
  if (form) {
    form.addEventListener("submit", async (e) => {
      console.log(
        `[FORM SUBMIT] Form '${formId}' submitted. Endpoint: '${endpoint}'`
      );
      e.preventDefault();
      const formData = new FormData(e.target);
      const body = Object.fromEntries(formData.entries());

      // 폼에 storedWalletData가 없으면, 로컬 스토리지에서 가져오도록 수정
      if (!body.storedWalletData) {
        const storedWalletDataFromStorage = getMpcWalletData();
        if (storedWalletDataFromStorage) {
          body.storedWalletData = storedWalletDataFromStorage;
        }
      }

      const options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      };

      if (requiresAuth && body.accessToken) {
        options.headers.Authorization = `Bearer ${body.accessToken}`;
      }

      let finalEndpoint = endpoint;
      if (endpoint.includes(":projectId")) {
        finalEndpoint = endpoint.replace(":projectId", body.projectId);
      }
      if (endpoint.includes(":requestId")) {
        finalEndpoint = endpoint.replace(":requestId", body.requestId);
      }

      try {
        console.log(`[FETCH] Sending POST request to: ${finalEndpoint}`);
        const response = await fetch(finalEndpoint, options);
        console.log(`[FETCH] Response status: ${response.status}`);
        const result = await response.json();
        showResult(resultId, result, response.ok ? "success" : "error");
      } catch (error) {
        console.error(`[FETCH] Error for endpoint ${finalEndpoint}:`, error);
        showResult(resultId, `Error: ${error.message}`, "error");
      }
    });
  }
};

const handleGetRequest = async (btnId, resultId, endpoint) => {
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.addEventListener("click", async () => {
      let finalEndpoint = endpoint;
      const options = { headers: {} };
      const form = btn.closest("form");

      if (form) {
        const accessTokenElement = form.querySelector(
          "textarea[name='accessToken']"
        );
        if (accessTokenElement && accessTokenElement.value) {
          options.headers.Authorization = `Bearer ${accessTokenElement.value}`;
        }

        if (endpoint.includes(":tokenId")) {
          const tokenIdElement = form.querySelector("input[name='tokenId']");
          if (!tokenIdElement || !tokenIdElement.value) {
            showResult(resultId, "토큰 ID가 필요합니다.", "error");
            return;
          }
          finalEndpoint = endpoint.replace(":tokenId", tokenIdElement.value);
        }
        if (endpoint.includes(":sbtId")) {
          const sbtIdElement = form.querySelector("input[name='sbtId']");
          if (!sbtIdElement || !sbtIdElement.value) {
            showResult(resultId, "SBT ID가 필요합니다.", "error");
            return;
          }
          finalEndpoint = endpoint.replace(":sbtId", sbtIdElement.value);
        }
        if (endpoint.includes(":address")) {
          const addressElement = form.querySelector("input[name='address']");
          if (!addressElement || !addressElement.value) {
            showResult(resultId, "지갑 주소가 필요합니다.", "error");
            return;
          }
          finalEndpoint = endpoint.replace(":address", addressElement.value);
        }
        if (endpoint.includes(":projectId")) {
          const projectIdElement = form.querySelector(
            "input[name='projectId']"
          );
          if (!projectIdElement || !projectIdElement.value) {
            showResult(resultId, "프로젝트 ID가 필요합니다.", "error");
            return;
          }
          finalEndpoint = endpoint.replace(
            ":projectId",
            projectIdElement.value
          );
        }
        if (endpoint.includes(":receiptId")) {
          const receiptIdElement = form.querySelector(
            "input[name='receiptId']"
          );
          if (!receiptIdElement || !receiptIdElement.value) {
            showResult(resultId, "영수증 ID가 필요합니다.", "error");
            return;
          }
          finalEndpoint = endpoint.replace(
            ":receiptId",
            receiptIdElement.value
          );
        }
      }

      try {
        const result = await makeRequest(finalEndpoint, options);
        showResult(resultId, result, result.success ? "success" : "error");
      } catch (error) {
        showResult(resultId, `Error: ${error.message}`, "error");
      }
    });
  }
};

const setupMerchandiseTab = () => {
  const API_BASE_URL = "/api/nft/merchandise";

  // 1. 상품 프로젝트 생성
  handleFormSubmit(
    "createProjectForm",
    "createProjectResult",
    `${API_BASE_URL}/create`,
    true
  );

  // 2. 내 프로젝트 목록
  handleGetRequest(
    "getMyProjectsBtn",
    "getMyProjectsResult",
    `${API_BASE_URL}/my`,
    true
  );

  // 3. 전체 프로젝트 목록
  handleGetRequest(
    "getAllProjectsBtn",
    "getAllProjectsResult",
    `${API_BASE_URL}/list`
  );

  // 4. 브랜드 활성화 대기 프로젝트
  handleGetRequest(
    "getBrandPendingProjectsBtn",
    "getBrandPendingProjectsResult",
    `${API_BASE_URL}/brand-pending`,
    true
  );

  // 5. 프로젝트 활성화
  handleFormSubmit(
    "activateProjectForm",
    "activateProjectResult",
    `${API_BASE_URL}/activate/:projectId`, // :projectId 추가
    true
  );

  // 6. 상품 구매 요청
  handleFormSubmit(
    "requestPurchaseForm",
    "requestPurchaseResult",
    `${API_BASE_URL}/request-purchase`,
    true
  );

  // 7. 내 구매 요청 목록
  handleGetRequest(
    "getMyPurchaseRequestsBtn",
    "getMyPurchaseRequestsResult",
    `${API_BASE_URL}/my-purchase-requests`,
    true
  );

  // 8. 구매 확정
  handleFormSubmit(
    "confirmPurchaseForm",
    "confirmPurchaseResult",
    `${API_BASE_URL}/confirm-purchase`,
    true
  );

  // 9. 내가 소유한 NFT 조회
  handleGetRequest(
    "getMyNftsBtn",
    "getMyNftsResult",
    `${API_BASE_URL}/my-nfts`,
    true
  );

  // 10. 전체 Merchandise NFT 조회
  handleGetRequest(
    "getAllNftsBtn",
    "getAllNftsResult",
    `${API_BASE_URL}/all-nfts`
  );

  // 11. 특정 NFT 상세 조회
  handleGetRequest(
    "getNftInfoBtn",
    "getNftInfoResult",
    `${API_BASE_URL}/nft/:tokenId`
  );

  // 12. 구매 취소
  handleFormSubmit(
    "cancelPurchaseForm",
    "cancelPurchaseResult",
    `${API_BASE_URL}/cancel-purchase`,
    true
  );

  // 13. 프로젝트별 구매 요청 목록
  handleGetRequest(
    "getProjectPurchaseRequestsBtn",
    "getProjectPurchaseRequestsResult",
    `${API_BASE_URL}/purchase-requests/:projectId`
  );

  // 14. 플랫폼 수수료 정보
  handleGetRequest(
    "getPlatformFeeInfoBtn",
    "getPlatformFeeInfoResult",
    `${API_BASE_URL}/platform-fee-info`
  );

  // 15. 모든 영수증 목록
  handleGetRequest(
    "getAllReceiptsBtn",
    "getAllReceiptsResult",
    `${API_BASE_URL}/receipts`
  );

  // 16. 특정 영수증 조회
  handleGetRequest(
    "getReceiptByIdBtn",
    "getReceiptByIdResult",
    `${API_BASE_URL}/receipt/:receiptId`
  );

  // 17. 프로젝트별 영수증 목록
  handleGetRequest(
    "getReceiptsByProjectBtn",
    "getReceiptsByProjectResult",
    `${API_BASE_URL}/receipts/project/:projectId`
  );

  // 18. PDF 영수증 다운로드
  const downloadPdfBtn = document.getElementById("downloadPdfBtn");
  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener("click", async () => {
      const form = downloadPdfBtn.closest("form");
      const receiptId = form.querySelector('input[name="receiptId"]').value;
      const resultElementId = "downloadPdfResult";

      if (!receiptId) {
        showResult(resultElementId, "Receipt ID is required.", "error");
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/receipt/${receiptId}/pdf`
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Download failed");
        }
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        const contentDisposition = response.headers.get("content-disposition");
        let fileName = `receipt-${receiptId}.pdf`;
        if (contentDisposition) {
          const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
          if (fileNameMatch && fileNameMatch.length === 2)
            fileName = fileNameMatch[1];
        }
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        showResult(
          resultElementId,
          { success: true, message: `File ${fileName} downloaded.` },
          "success"
        );
      } catch (error) {
        showResult(resultElementId, `Error: ${error.message}`, "error");
      }
    });
  }

  // 19. PDF 영수증 생성
  handleFormSubmit(
    "generatePdfForm",
    "generatePdfResult",
    `${API_BASE_URL}/receipt/:receiptId/generate-pdf`
  );
};

function setupSbtTab() {
  handleFormSubmit(
    "mint-sbt-form",
    "mint-sbt-result",
    "/api/nft/sbt/mint",
    true
  );

  handleGetRequest(
    "get-all-sbt-btn",
    "get-all-sbt-result",
    "/api/nft/sbt/list"
  );

  handleGetRequest(
    "get-sbt-info-btn",
    "get-sbt-info-result",
    "/api/nft/sbt/info/:sbtId"
  );

  handleGetRequest(
    "get-sbt-by-address-btn",
    "get-sbt-by-address-result",
    "/api/nft/sbt/:address"
  );
}

function setupIpNftTab() {
  handleFormSubmit(
    "mint-ipnft-form",
    "mint-ipnft-result",
    "/api/nft/ip/mint",
    true
  );
  handleFormSubmit(
    "set-minting-fee-form",
    "set-minting-fee-result",
    "/api/nft/ip/set-minting-fee",
    true
  );

  handleGetRequest(
    "list-all-ipnfts-btn",
    "list-all-ipnfts-result",
    "/api/nft/ip/list"
  );

  handleGetRequest(
    "get-my-ipnfts-btn",
    "get-my-ipnfts-result",
    "/api/nft/ip/my"
  );

  handleGetRequest(
    "get-ipnft-info-btn",
    "get-ipnft-info-result",
    "/api/nft/ip/info/:tokenId"
  );

  handleGetRequest(
    "get-minting-fee-btn",
    "get-minting-fee-result",
    "/api/nft/ip/minting-fee"
  );
}

const setupPlatformTab = () => {
  const API_BASE_URL = "/api/nft/platform";

  // 1. 통합 소유권 이전
  handleFormSubmit(
    "transferAllOwnershipForm",
    "transferAllOwnershipResponse",
    `${API_BASE_URL}/transfer-all-ownership`,
    true
  );

  // 2. 현재 소유자 조회
  handleGetRequest(
    "get-owner-btn",
    "get-owner-result",
    `${API_BASE_URL}/owner`
  );

  // 3. PlatformRegistry 상태 조회
  handleGetRequest(
    "get-status-btn",
    "get-status-result",
    `${API_BASE_URL}/status`
  );

  // 4. 팩토리 설정
  handleFormSubmit(
    "set-factory-form",
    "set-factory-result",
    `${API_BASE_URL}/set-factory`,
    true
  );

  // 5. 주요 컨트랙트 주소 조회
  handleGetRequest(
    "get-addresses-btn",
    "get-addresses-result",
    `${API_BASE_URL}/addresses`
  );

  // 6. 개별 소유권 이전
  handleFormSubmit(
    "transferOwnershipForm",
    "transferOwnershipResponse",
    `${API_BASE_URL}/transfer-ownership`,
    true
  );
};

const setupAuthTab = () => {
  // 1. 소셜 로그인 URL 요청
  document
    .getElementById("social-login-url-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const provider = document.getElementById("loginProvider").value;
      const callbackUrl = document.getElementById("loginCallbackUrl").value;
      const result = await makeRequest(
        `/api/auth/social/login-url?provider=${provider}&callbackUrl=${encodeURIComponent(
          callbackUrl
        )}`
      );
      showResult(
        "social-login-url-result",
        result.url || result.message,
        result.success ? "success" : "error"
      );
    });

  // 2. 소셜 로그인 완료
  document
    .getElementById("finalize-login-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("authIdInput").value;
      const result = await makeRequest("/api/auth/social/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      showResult("finalize-login-result", result, "success");
    });

  // 3. MPC 지갑 생성/복구
  document
    .getElementById("create-wallet-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const devicePassword = document.getElementById("devicePassword").value;
      const email = document.getElementById("createWalletEmail").value;
      const accessToken = document.getElementById(
        "createWalletAccessToken"
      ).value;
      const result = await makeRequest(
        "/api/auth/mpc/wallet/create-or-recover",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ devicePassword, email, accessToken }),
        }
      );
      if (result.success) {
        localStorage.setItem("MpcWalletData", JSON.stringify(result.data));
        showResult(
          "create-wallet-result",
          { ...result, message: "Wallet data stored in localStorage." },
          "success"
        );
      } else {
        showResult("create-wallet-result", result.message, "error");
      }
    });

  // 4. 계정 정보 조회
  document
    .getElementById("get-account-info-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const accessToken = document.getElementById(
        "accountInfoAccessToken"
      ).value;
      const result = await makeRequest("/api/auth/account", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      showResult("get-account-info-result", result, "success");
    });

  // 5. 잔액 조회
  document
    .getElementById("get-balance-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const accessToken = document.getElementById("balanceAccessToken").value;
      const result = await makeRequest("/api/auth/balance", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      showResult("get-balance-result", result, "success");
    });

  // 6. 토큰 리프레시
  document
    .getElementById("refresh-token-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const refreshToken = document.getElementById("refreshTokenInput").value;
      const result = await makeRequest("/api/auth/refresh-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      showResult("refresh-token-result", result, "success");
    });

  // 7. 소셜 회원가입
  document
    .getElementById("social-register-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      // Checkbox values
      data.overage = !!data.overage;
      data.agree = !!data.agree;
      data.collect = !!data.collect;
      data.thirdParty = !!data.thirdParty;
      data.advertise = !!data.advertise;

      const result = await makeRequest("/api/auth/social/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      showResult("social-register-result", result, "success");
    });

  // '계정 정보' 카드 내 버튼 이벤트 핸들러
  const accountInfoCard = document.getElementById("account-info-card");
  if (accountInfoCard) {
    const accessTokenTextarea = accountInfoCard.querySelector(
      "#accountInfoAccessToken"
    );

    // 계정 정보 조회 버튼
    const getAccountInfoBtn = accountInfoCard.querySelector(
      "#get-account-info-btn"
    );
    if (getAccountInfoBtn) {
      getAccountInfoBtn.addEventListener("click", async () => {
        const accessToken = accessTokenTextarea.value;
        if (!accessToken) {
          showResult(
            "get-account-info-result",
            "액세스 토큰을 입력하세요.",
            "error"
          );
          return;
        }
        const result = await makeRequest("/api/auth/account", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        showResult(
          "get-account-info-result",
          result,
          result.success ? "success" : "error"
        );
      });
    }

    // 잔액 조회 버튼
    const getBalanceBtn = accountInfoCard.querySelector("#get-balance-btn");
    if (getBalanceBtn) {
      getBalanceBtn.addEventListener("click", async () => {
        const accessToken = accessTokenTextarea.value;
        if (!accessToken) {
          showResult(
            "get-balance-result",
            "액세스 토큰을 입력하세요.",
            "error"
          );
          return;
        }
        const result = await makeRequest("/api/auth/balance", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        showResult(
          "get-balance-result",
          result,
          result.success ? "success" : "error"
        );
      });
    }
  }
};

const setupBlockchainTab = () => {
  console.log("Blockchain tab initialized");
  handleFormSubmit("faucet-form", "faucet-result", "/api/utils/faucet", false);

  // IPFS 파일 업로드 (FormData 사용)
  const ipfsUploadFileForm = document.getElementById("ipfs-upload-file-form");
  if (ipfsUploadFileForm) {
    ipfsUploadFileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      try {
        const response = await fetch("/api/utils/ipfs/upload-file", {
          method: "POST",
          body: formData,
        });
        const result = await response.json();
        showResult(
          "ipfs-upload-file-result",
          result,
          response.ok ? "success" : "error"
        );
      } catch (error) {
        showResult(
          "ipfs-upload-file-result",
          `Error: ${error.message}`,
          "error"
        );
      }
    });
  }

  handleFormSubmit(
    "ipfs-upload-json-form",
    "ipfs-upload-json-result",
    "/api/utils/ipfs/upload-json",
    false
  );
};
