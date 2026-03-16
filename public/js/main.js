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
  } else if (tabName === "personal") {
    setupPersonalTab();
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

      // storedWalletData 처리 로직
      let storedWalletData = null;

      // 1. 개별 필드로 입력된 경우 조합
      if (
        body.storedWalletData_uid &&
        body.storedWalletData_wid &&
        body.storedWalletData_sid
      ) {
        storedWalletData = {
          uid: body.storedWalletData_uid,
          wid: parseInt(body.storedWalletData_wid),
          sid: body.storedWalletData_sid,
          pvencstr: body.storedWalletData_pvencstr || "",
          encryptDevicePassword:
            body.storedWalletData_encryptDevicePassword || "",
        };

        // 개별 필드 제거
        delete body.storedWalletData_uid;
        delete body.storedWalletData_wid;
        delete body.storedWalletData_sid;
        delete body.storedWalletData_pvencstr;
        delete body.storedWalletData_encryptDevicePassword;
      }
      // 2. JSON 문자열로 입력된 경우 파싱
      else if (body.storedWalletData && body.storedWalletData.trim() !== "") {
        try {
          storedWalletData = JSON.parse(body.storedWalletData);
        } catch (error) {
          console.error("Invalid storedWalletData JSON:", error);
          showResult(
            resultId,
            "저장된 지갑 데이터 형식이 올바르지 않습니다.",
            "error"
          );
          return;
        }
      }
      // 3. localStorage에서 가져오기
      else {
        const storedWalletDataFromStorage = getMpcWalletData();
        if (storedWalletDataFromStorage) {
          storedWalletData = storedWalletDataFromStorage;
        }
      }

      // 최종 storedWalletData 설정
      if (storedWalletData) {
        body.storedWalletData = storedWalletData;
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
    `${API_BASE_URL}/activate`,
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

  // 14. 역할별 플랫폼 수수료 조회
  handleGetRequest(
    "getPlatformFeeInfoBtn",
    "getPlatformFeeInfoResult",
    `${API_BASE_URL}/platform-fee-info`
  );

  // 14-1. 역할별 플랫폼 수수료 설정
  handleFormSubmit(
    "setPlatformFeeForm",
    "setPlatformFeeResult",
    `${API_BASE_URL}/platform-fee-info`,
    true
  );

  // 14-2. 크리에이터별 개별 수수료 조회
  const getCreatorFeeBtn = document.getElementById("getCreatorFeeBtn");
  if (getCreatorFeeBtn) {
    getCreatorFeeBtn.addEventListener("click", async () => {
      const form = getCreatorFeeBtn.closest("form");
      const creatorAddress = form.querySelector('input[name="creatorAddress"]').value;
      const role = form.querySelector('select[name="role"]').value;
      if (!creatorAddress) { showResult("getCreatorFeeResult", "크리에이터 주소를 입력하세요.", "error"); return; }
      try {
        const result = await makeRequest(`${API_BASE_URL}/creator-fee?creatorAddress=${creatorAddress}&role=${role}`);
        showResult("getCreatorFeeResult", result, result.success ? "success" : "error");
      } catch (e) { showResult("getCreatorFeeResult", `Error: ${e.message}`, "error"); }
    });
  }

  // 14-2. 크리에이터별 개별 수수료 설정
  handleFormSubmit("setCreatorFeeForm", "setCreatorFeeResult", `${API_BASE_URL}/creator-fee`, true);

  // 14-2. 크리에이터별 개별 수수료 제거
  const removeCreatorFeeForm = document.getElementById("removeCreatorFeeForm");
  if (removeCreatorFeeForm) {
    removeCreatorFeeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const body = Object.fromEntries(formData.entries());
      if (body.storedWalletData_uid && body.storedWalletData_wid && body.storedWalletData_sid) {
        body.storedWalletData = { uid: body.storedWalletData_uid, wid: parseInt(body.storedWalletData_wid), sid: body.storedWalletData_sid, pvencstr: body.storedWalletData_pvencstr || "", encryptDevicePassword: body.storedWalletData_encryptDevicePassword || "" };
        ["uid","wid","sid","pvencstr","encryptDevicePassword"].forEach(k => delete body[`storedWalletData_${k}`]);
      }
      const options = { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.accessToken}` }, body: JSON.stringify(body) };
      try {
        const res = await fetch(`${API_BASE_URL}/creator-fee`, options);
        const result = await res.json();
        showResult("removeCreatorFeeResult", result, result.success ? "success" : "error");
      } catch (e) { showResult("removeCreatorFeeResult", `Error: ${e.message}`, "error"); }
    });
  }

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

const setupPersonalTab = () => {
  const API_BASE_URL = "/api/nft/personal";

  // 1. 가격 계산 (미리보기)
  const calcBtn = document.getElementById("calculate-price-btn");
  if (calcBtn) {
    calcBtn.addEventListener("click", async () => {
      const form = document.getElementById("calculate-price-form");
      const brandTokenIdInput = form.querySelector(
        "input[name='brandTokenId']"
      );
      const artistTokenIdsInput = form.querySelector(
        "input[name='artistTokenIds']"
      );

      if (
        !brandTokenIdInput.value ||
        !artistTokenIdsInput.value ||
        artistTokenIdsInput.value.trim() === ""
      ) {
        showResult(
          "calculate-price-result",
          "Brand Token ID와 Artist Token IDs를 모두 입력해주세요.",
          "error"
        );
        return;
      }

      const artistTokenIds = artistTokenIdsInput.value
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id !== "");

      try {
        const response = await fetch(`${API_BASE_URL}/calculate-price`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandTokenId: Number(brandTokenIdInput.value),
            artistTokenIds,
          }),
        });
        const result = await response.json();
        showResult(
          "calculate-price-result",
          result,
          response.ok ? "success" : "error"
        );
      } catch (error) {
        showResult(
          "calculate-price-result",
          `Error: ${error.message}`,
          "error"
        );
      }
    });
  }

  // 2. 구매 요청 (DP 에스크로)
  const requestPurchaseForm = document.getElementById("request-purchase-form");
  if (requestPurchaseForm) {
    requestPurchaseForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const accessToken = formData.get("accessToken");

      // artistTokenIds 문자열을 배열로 변환
      const artistTokenIdsRaw = formData.get("artistTokenIds") || "";
      const artistTokenIds = artistTokenIdsRaw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id !== "");

      const body = Object.fromEntries(formData.entries());

      // storedWalletData 조합
      const storedWalletData = {
        uid: body.storedWalletData_uid,
        wid: Number(body.storedWalletData_wid),
        sid: body.storedWalletData_sid,
        pvencstr: body.storedWalletData_pvencstr,
        encryptDevicePassword: body.storedWalletData_encryptDevicePassword,
      };

      // 개별 필드 제거
      delete body.storedWalletData_uid;
      delete body.storedWalletData_wid;
      delete body.storedWalletData_sid;
      delete body.storedWalletData_pvencstr;
      delete body.storedWalletData_encryptDevicePassword;
      delete body.artistTokenIds;

      body.brandTokenId = Number(body.brandTokenId);
      body.artistTokenIds = artistTokenIds;
      body.storedWalletData = storedWalletData;

      const options = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: accessToken.startsWith("Bearer ")
            ? accessToken
            : `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      };

      try {
        const response = await fetch(
          `${API_BASE_URL}/request-purchase`,
          options
        );
        const result = await response.json();
        showResult(
          "request-purchase-result",
          result,
          response.ok ? "success" : "error"
        );
      } catch (error) {
        showResult(
          "request-purchase-result",
          `Error: ${error.message}`,
          "error"
        );
      }
    });
  }

  // 3. 구매 확정
  handleFormSubmit(
    "confirm-purchase-form",
    "confirm-purchase-result",
    `${API_BASE_URL}/confirm-purchase`,
    true
  );

  // 4. 구매 취소
  handleFormSubmit(
    "cancel-purchase-form",
    "cancel-purchase-result",
    `${API_BASE_URL}/cancel-purchase`,
    true
  );

  // 5. 내 구매 요청 목록
  handleGetRequest(
    "my-requests-btn",
    "my-requests-result",
    `${API_BASE_URL}/my-requests`,
    true
  );

  // 6. 구매 요청 상세 정보
  const getRequestInfoBtn = document.getElementById("get-request-info-btn");
  if (getRequestInfoBtn) {
    getRequestInfoBtn.addEventListener("click", async () => {
      const form = document.getElementById("get-request-info-form");
      const requestIdInput = form.querySelector("input[name='requestId']");
      if (!requestIdInput.value) {
        showResult(
          "get-request-info-result",
          "Request ID를 입력해주세요.",
          "error"
        );
        return;
      }

      const endpoint = `${API_BASE_URL}/request/${requestIdInput.value}`;
      try {
        const result = await makeRequest(endpoint);
        showResult(
          "get-request-info-result",
          result,
          result.success ? "success" : "error"
        );
      } catch (error) {
        showResult(
          "get-request-info-result",
          `Error: ${error.message}`,
          "error"
        );
      }
    });
  }

  // 7. 내 Personal NFT 목록
  handleGetRequest(
    "my-nfts-btn",
    "my-nfts-result",
    `${API_BASE_URL}/my`,
    true
  );

  // 8. Personal NFT 상세 정보
  const getNftInfoBtn = document.getElementById("get-nft-info-btn");
  if (getNftInfoBtn) {
    getNftInfoBtn.addEventListener("click", async () => {
      const form = document.getElementById("get-nft-info-form");
      const tokenIdInput = form.querySelector("input[name='tokenId']");
      if (!tokenIdInput.value) {
        showResult(
          "get-nft-info-result",
          "Token ID를 입력해주세요.",
          "error"
        );
        return;
      }

      const endpoint = `${API_BASE_URL}/${tokenIdInput.value}`;
      try {
        const result = await makeRequest(endpoint);
        showResult(
          "get-nft-info-result",
          result,
          result.success ? "success" : "error"
        );
      } catch (error) {
        showResult(
          "get-nft-info-result",
          `Error: ${error.message}`,
          "error"
        );
      }
    });
  }

  // 9. TxHash로 정산 내역 조회
  const getDistributionBtn = document.getElementById("get-distribution-btn");
  if (getDistributionBtn) {
    getDistributionBtn.addEventListener("click", async () => {
      const form = document.getElementById("get-distribution-form");
      const txHashInput = form.querySelector("input[name='txHash']");
      if (!txHashInput.value) {
        showResult(
          "get-distribution-result",
          "Transaction Hash를 입력해주세요.",
          "error"
        );
        return;
      }

      const endpoint = `${API_BASE_URL}/distribution/${txHashInput.value}`;
      try {
        const result = await makeRequest(endpoint);
        showResult(
          "get-distribution-result",
          result,
          result.success ? "success" : "error"
        );
      } catch (error) {
        showResult(
          "get-distribution-result",
          `Error: ${error.message}`,
          "error"
        );
      }
    });
  }

  // 10. 플랫폼 수수료 조회
  handleGetRequest(
    "get-fee-btn",
    "get-fee-result",
    `${API_BASE_URL}/platform-fee`
  );

  // 11. 플랫폼 수수료 설정 (관리자 전용)
  handleFormSubmit(
    "set-fee-form",
    "set-fee-result",
    `${API_BASE_URL}/platform-fee`,
    true
  );

  // 11. 크리에이터별 개별 수수료 조회
  const personalGetCreatorFeeBtn = document.getElementById("personal-get-creator-fee-btn");
  if (personalGetCreatorFeeBtn) {
    personalGetCreatorFeeBtn.addEventListener("click", async () => {
      const form = personalGetCreatorFeeBtn.closest("form");
      const creatorAddress = form.querySelector('input[name="creatorAddress"]').value;
      const role = form.querySelector('select[name="role"]').value;
      if (!creatorAddress) { showResult("personal-get-creator-fee-result", "크리에이터 주소를 입력하세요.", "error"); return; }
      try {
        const result = await makeRequest(`${API_BASE_URL}/creator-fee?creatorAddress=${creatorAddress}&role=${role}`);
        showResult("personal-get-creator-fee-result", result, result.success ? "success" : "error");
      } catch (e) { showResult("personal-get-creator-fee-result", `Error: ${e.message}`, "error"); }
    });
  }

  // 11. 크리에이터별 개별 수수료 설정
  handleFormSubmit("personal-set-creator-fee-form", "personal-set-creator-fee-result", `${API_BASE_URL}/creator-fee`, true);

  // 11. 크리에이터별 개별 수수료 제거
  const personalRemoveCreatorFeeForm = document.getElementById("personal-remove-creator-fee-form");
  if (personalRemoveCreatorFeeForm) {
    personalRemoveCreatorFeeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const body = Object.fromEntries(formData.entries());
      if (body.storedWalletData_uid && body.storedWalletData_wid && body.storedWalletData_sid) {
        body.storedWalletData = { uid: body.storedWalletData_uid, wid: parseInt(body.storedWalletData_wid), sid: body.storedWalletData_sid, pvencstr: body.storedWalletData_pvencstr || "", encryptDevicePassword: body.storedWalletData_encryptDevicePassword || "" };
        ["uid","wid","sid","pvencstr","encryptDevicePassword"].forEach(k => delete body[`storedWalletData_${k}`]);
      }
      const options = { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.accessToken}` }, body: JSON.stringify(body) };
      try {
        const res = await fetch(`${API_BASE_URL}/creator-fee`, options);
        const result = await res.json();
        showResult("personal-remove-creator-fee-result", result, result.success ? "success" : "error");
      } catch (e) { showResult("personal-remove-creator-fee-result", `Error: ${e.message}`, "error"); }
    });
  }
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
  // =================================================================
  // 이메일/비밀번호 인증 기능들
  // =================================================================

  // 1. 이메일 회원가입
  document
    .getElementById("email-register-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());

      // Checkbox values - 기본값 설정
      data.overage = !!data.overage;
      data.agree = !!data.agree;
      data.collect = !!data.collect;
      data.thirdParty = !!data.thirdParty || false; // 기본값 false
      data.advertise = !!data.advertise || false; // 기본값 false

      const result = await makeRequest("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      showResult(
        "email-register-result",
        result,
        result.status === "success" ? "success" : "error"
      );
    });

  // 2. 이메일 로그인
  document
    .getElementById("email-login-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());

      const result = await makeRequest("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      showResult(
        "email-login-result",
        result,
        result.status === "success" ? "success" : "error"
      );
    });

  // 3. 이메일 존재 확인
  document
    .getElementById("check-email-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("checkEmail").value;

      const result = await makeRequest(`/api/auth/${email}/verify-email`);
      showResult(
        "check-email-result",
        result,
        result.status === "success" ? "success" : "error"
      );
    });

  // 4. 이메일 인증 코드 발송
  document
    .getElementById("send-code-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("sendCodeEmail").value;
      const lang = document.getElementById("sendCodeLang").value;
      const template = document.getElementById("sendCodeTemplate").value;

      const result = await makeRequest(
        `/api/auth/${email}/send-code?lang=${lang}&template=${template}`
      );
      showResult(
        "send-code-result",
        result,
        result.status === "success" ? "success" : "error"
      );
    });

  // 5. 이메일 인증 코드 확인
  document
    .getElementById("verify-code-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("verifyCodeEmail").value;
      const code = document.getElementById("verifyCodeCode").value;

      const result = await makeRequest(`/api/auth/${email}/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      showResult(
        "verify-code-result",
        result,
        result.status === "success" ? "success" : "error"
      );
    });

  // 6. 비밀번호 재설정
  document
    .getElementById("reset-password-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());

      const result = await makeRequest("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      showResult(
        "reset-password-result",
        result,
        result.status === "success" ? "success" : "error"
      );
    });

  // =================================================================
  // 소셜 로그인 기능들 (기존 코드)
  // =================================================================

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
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ devicePassword, email }),
        }
      );
      if (result.success) {
        localStorage.setItem("MpcWalletData", JSON.stringify(result.data));

        // Postman용 데이터 복사 기능 추가
        const postmanData = {
          devicePassword: document.getElementById("devicePassword").value,
          storedWalletData: result.data,
        };

        // 클립보드에 복사
        navigator.clipboard
          .writeText(JSON.stringify(postmanData, null, 2))
          .then(() => {
            showResult(
              "create-wallet-result",
              {
                ...result,
                message: "Wallet data stored in localStorage.",
                postmanData: postmanData,
              },
              "success"
            );
          })
          .catch(() => {
            showResult(
              "create-wallet-result",
              {
                ...result,
                message:
                  "Wallet data stored in localStorage. Postman용 데이터: " +
                  JSON.stringify(postmanData, null, 2),
                postmanData: postmanData,
              },
              "success"
            );
          });
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

  // =================================================================
  // Dress Token 잔액 조회 (Polygon)
  // =================================================================
  const dressTokenBalanceForm = document.getElementById(
    "dress-token-balance-form"
  );
  if (dressTokenBalanceForm) {
    dressTokenBalanceForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const accessToken = formData.get("accessToken");

      const authHeader = accessToken.startsWith("Bearer ")
        ? accessToken
        : `Bearer ${accessToken}`;

      try {
        const response = await fetch("/api/utils/dress-token/balance", {
          method: "GET",
          headers: {
            Authorization: authHeader,
          },
        });
        const result = await response.json();

        // Raw result 표시
        showResult(
          "dress-balance-raw-result",
          result,
          response.ok ? "success" : "error"
        );

        // Summary 표시
        if (response.ok && result.data) {
          const summary = document.getElementById("dress-balance-summary");
          summary.style.display = "block";

          document.getElementById("summary-wallet-address").textContent =
            result.data.walletAddress;
          document.getElementById("summary-dress-balance").textContent =
            result.data.token.balance;
          document.getElementById("summary-matic-balance").textContent =
            result.data.matic.balance;

          const warningDiv = document.getElementById("summary-warning");
          if (result.data.matic.warning) {
            warningDiv.style.display = "block";
            document.getElementById("summary-warning-text").textContent =
              result.data.matic.warning;
          } else {
            warningDiv.style.display = "none";
          }
        } else {
          document.getElementById("dress-balance-summary").style.display =
            "none";
        }
      } catch (error) {
        showResult(
          "dress-balance-raw-result",
          `Error: ${error.message}`,
          "error"
        );
        document.getElementById("dress-balance-summary").style.display = "none";
      }
    });
  }

  // =================================================================
  // Dress → DP Token Swap (1:5)
  // =================================================================
  const swapDressToDpForm = document.getElementById("swap-dress-to-dp-form");
  if (swapDressToDpForm) {
    swapDressToDpForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      const txHash = formData.get("txHash");
      const fromAddress = formData.get("fromAddress");

      try {
        const response = await fetch("/api/utils/swap-dress-to-dp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            txHash,
            fromAddress,
          }),
        });
        const result = await response.json();

        showResult(
          "swap-raw-result",
          result,
          response.ok ? "success" : "error"
        );
      } catch (error) {
        showResult("swap-raw-result", `Error: ${error.message}`, "error");
      }
    });
  }

  // =================================================================
  // DP Token 전송 (MPC 패턴)
  // =================================================================
  const dpTokenTransferForm = document.getElementById("dp-token-transfer-form");
  if (dpTokenTransferForm) {
    dpTokenTransferForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      const accessToken = formData.get("accessToken");
      const to = formData.get("to");
      const amount = formData.get("amount");
      const devicePassword = formData.get("devicePassword");

      // localStorage의 MPC 지갑 데이터에서 개별 필드 수집
      const uid = formData.get("uid");
      const wid = formData.get("wid");
      const sid = formData.get("sid");
      const pvencstr = formData.get("pvencstr");
      const encryptDevicePassword = formData.get("encryptDevicePassword");

      // Bearer 접두사가 없으면 자동으로 추가
      const authHeader = accessToken.startsWith("Bearer ")
        ? accessToken
        : `Bearer ${accessToken}`;

      // storedWalletData 객체 생성
      const storedWalletData = {
        uid: uid,
        wid: parseInt(wid),
        sid: sid,
        pvencstr: pvencstr,
        encryptDevicePassword: encryptDevicePassword,
      };

      // 필수 필드 검증
      if (!uid || !wid || !sid || !pvencstr || !encryptDevicePassword) {
        showResult(
          "dp-transfer-raw-result",
          "모든 지갑 데이터 필드를 입력해주세요.",
          "error"
        );
        return;
      }

      try {
        const response = await fetch("/api/utils/dp-token/transfer", {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to,
            amount,
            devicePassword,
            storedWalletData,
          }),
        });
        const result = await response.json();

        showResult(
          "dp-transfer-raw-result",
          result,
          response.ok ? "success" : "error"
        );
      } catch (error) {
        showResult(
          "dp-transfer-raw-result",
          `Error: ${error.message}`,
          "error"
        );
      }
    });
  }

  // localStorage에서 DP 지갑 데이터 불러오기 버튼
  const loadDPWalletDataBtn = document.getElementById("loadDPWalletDataBtn");
  if (loadDPWalletDataBtn) {
    loadDPWalletDataBtn.addEventListener("click", () => {
      const walletData = getMpcWalletData();
      if (walletData) {
        document.getElementById("dpTransferUid").value = walletData.uid || "";
        document.getElementById("dpTransferWid").value = walletData.wid || "";
        document.getElementById("dpTransferSid").value = walletData.sid || "";
        document.getElementById("dpTransferPvencstr").value =
          walletData.pvencstr || "";
        document.getElementById("dpTransferEncryptDevicePassword").value =
          walletData.encryptDevicePassword || "";
        showResult(
          "dp-transfer-raw-result",
          "지갑 데이터를 불러왔습니다.",
          "success"
        );
      } else {
        showResult(
          "dp-transfer-raw-result",
          "저장된 지갑 데이터가 없습니다.",
          "error"
        );
      }
    });
  }

  // DP 지갑 데이터 필드 초기화 버튼
  const clearDPWalletDataBtn = document.getElementById("clearDPWalletDataBtn");
  if (clearDPWalletDataBtn) {
    clearDPWalletDataBtn.addEventListener("click", () => {
      document.getElementById("dpTransferUid").value = "";
      document.getElementById("dpTransferWid").value = "";
      document.getElementById("dpTransferSid").value = "";
      document.getElementById("dpTransferPvencstr").value = "";
      document.getElementById("dpTransferEncryptDevicePassword").value = "";
      showResult(
        "dp-transfer-raw-result",
        "지갑 데이터 필드를 초기화했습니다.",
        "info"
      );
    });
  }

  // =================================================================
  // Dress Token 전송 (Polygon, MPC 패턴) - 순수 전송 기능
  // =================================================================
  const dressTokenTransferForm = document.getElementById(
    "dress-token-transfer-form"
  );
  if (dressTokenTransferForm) {
    dressTokenTransferForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      const accessToken = formData.get("accessToken");
      const to = formData.get("to");
      const amount = formData.get("amount");
      const devicePassword = formData.get("devicePassword");

      const uid = formData.get("uid");
      const wid = formData.get("wid");
      const sid = formData.get("sid");
      const pvencstr = formData.get("pvencstr");
      const encryptDevicePassword = formData.get("encryptDevicePassword");

      const authHeader = accessToken.startsWith("Bearer ")
        ? accessToken
        : `Bearer ${accessToken}`;

      const storedWalletData = {
        uid: uid,
        wid: parseInt(wid),
        sid: sid,
        pvencstr: pvencstr,
        encryptDevicePassword: encryptDevicePassword,
      };

      if (!uid || !wid || !sid || !pvencstr || !encryptDevicePassword) {
        showResult(
          "dress-transfer-raw-result",
          "모든 지갑 데이터 필드를 입력해주세요.",
          "error"
        );
        return;
      }

      try {
        // Dress Token 전송 (순수 기능)
        showResult(
          "dress-transfer-raw-result",
          "🔄 Dress Token 전송 중...",
          "info"
        );

        const response = await fetch("/api/utils/dress-token/transfer", {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to,
            amount,
            devicePassword,
            storedWalletData,
          }),
        });
        const result = await response.json();

        // 결과 표시
        showResult(
          "dress-transfer-raw-result",
          result,
          response.ok ? "success" : "error"
        );
      } catch (error) {
        showResult(
          "dress-transfer-raw-result",
          `Error: ${error.message}`,
          "error"
        );
      }
    });
  }

  const loadDressWalletDataBtn = document.getElementById(
    "loadDressWalletDataBtn"
  );
  if (loadDressWalletDataBtn) {
    loadDressWalletDataBtn.addEventListener("click", () => {
      const walletData = getMpcWalletData();
      if (walletData) {
        document.getElementById("dressTransferUid").value =
          walletData.uid || "";
        document.getElementById("dressTransferWid").value =
          walletData.wid || "";
        document.getElementById("dressTransferSid").value =
          walletData.sid || "";
        document.getElementById("dressTransferPvencstr").value =
          walletData.pvencstr || "";
        document.getElementById("dressTransferEncryptDevicePassword").value =
          walletData.encryptDevicePassword || "";
        showResult(
          "dress-transfer-raw-result",
          "지갑 데이터를 불러왔습니다.",
          "success"
        );
      } else {
        showResult(
          "dress-transfer-raw-result",
          "저장된 지갑 데이터가 없습니다.",
          "error"
        );
      }
    });
  }

  const clearDressWalletDataBtn = document.getElementById(
    "clearDressWalletDataBtn"
  );
  if (clearDressWalletDataBtn) {
    clearDressWalletDataBtn.addEventListener("click", () => {
      document.getElementById("dressTransferUid").value = "";
      document.getElementById("dressTransferWid").value = "";
      document.getElementById("dressTransferSid").value = "";
      document.getElementById("dressTransferPvencstr").value = "";
      document.getElementById("dressTransferEncryptDevicePassword").value = "";
      showResult(
        "dress-transfer-raw-result",
        "지갑 데이터 필드를 초기화했습니다.",
        "info"
      );
    });
  }

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

  // =================================================================
  // Dress Token 전송 + 자동 스왑 통합 API (플랫폼 전용)
  // =================================================================
  const swapIntegratedForm = document.getElementById(
    "dress-token-transfer-and-swap-form"
  );
  if (swapIntegratedForm) {
    swapIntegratedForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      const accessToken = formData.get("accessToken");
      const amount = formData.get("amount");
      const devicePassword = formData.get("devicePassword");

      const uid = formData.get("uid");
      const wid = formData.get("wid");
      const sid = formData.get("sid");
      const pvencstr = formData.get("pvencstr");
      const encryptDevicePassword = formData.get("encryptDevicePassword");

      const authHeader = accessToken.startsWith("Bearer ")
        ? accessToken
        : `Bearer ${accessToken}`;

      const storedWalletData = {
        uid: uid,
        wid: parseInt(wid),
        sid: sid,
        pvencstr: pvencstr,
        encryptDevicePassword: encryptDevicePassword,
      };

      if (!uid || !wid || !sid || !pvencstr || !encryptDevicePassword) {
        showResult(
          "swap-integrated-raw-result",
          "모든 지갑 데이터 필드를 입력해주세요.",
          "error"
        );
        return;
      }

      try {
        // 진행 상태 표시
        showResult(
          "swap-integrated-raw-result",
          "🔄 Dress Token 전송 + 자동 스왑 진행 중...",
          "info"
        );
        document.getElementById("swap-integrated-summary").style.display =
          "none";

        const response = await fetch(
          "/api/utils/dress-token/transfer-and-swap",
          {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              amount,
              devicePassword,
              storedWalletData,
            }),
          }
        );
        const result = await response.json();

        if (response.ok) {
          // Raw result 표시
          showResult("swap-integrated-raw-result", result, "success");

          // Summary 표시
          if (result.data && result.data.summary) {
            const summary = document.getElementById("swap-integrated-summary");
            summary.style.display = "block";

            document.getElementById("summary-swap-dress-amount").textContent =
              result.data.summary.dressAmount + " DRESS";
            document.getElementById("summary-swap-dp-amount").textContent =
              result.data.summary.dpAmount + " DP";
            document.getElementById("summary-swap-polygon-tx").textContent =
              result.data.polygon.txHash;
            document.getElementById("summary-swap-besu-tx").textContent =
              result.data.besu.txHash;
          }
        } else {
          showResult("swap-integrated-raw-result", result, "error");
          document.getElementById("swap-integrated-summary").style.display =
            "none";
        }
      } catch (error) {
        showResult(
          "swap-integrated-raw-result",
          `Error: ${error.message}`,
          "error"
        );
        document.getElementById("swap-integrated-summary").style.display =
          "none";
      }
    });
  }

  // localStorage에서 통합 스왑 지갑 데이터 불러오기 버튼
  const loadSwapIntegratedWalletDataBtn = document.getElementById(
    "loadSwapIntegratedWalletDataBtn"
  );
  if (loadSwapIntegratedWalletDataBtn) {
    loadSwapIntegratedWalletDataBtn.addEventListener("click", () => {
      const walletData = getMpcWalletData();
      if (walletData) {
        document.getElementById("swapIntegratedUid").value =
          walletData.uid || "";
        document.getElementById("swapIntegratedWid").value =
          walletData.wid || "";
        document.getElementById("swapIntegratedSid").value =
          walletData.sid || "";
        document.getElementById("swapIntegratedPvencstr").value =
          walletData.pvencstr || "";
        document.getElementById("swapIntegratedEncryptDevicePassword").value =
          walletData.encryptDevicePassword || "";
        showResult(
          "swap-integrated-raw-result",
          "지갑 데이터를 불러왔습니다.",
          "success"
        );
      } else {
        showResult(
          "swap-integrated-raw-result",
          "저장된 지갑 데이터가 없습니다.",
          "error"
        );
      }
    });
  }

  // 통합 스왑 지갑 데이터 필드 초기화 버튼
  const clearSwapIntegratedWalletDataBtn = document.getElementById(
    "clearSwapIntegratedWalletDataBtn"
  );
  if (clearSwapIntegratedWalletDataBtn) {
    clearSwapIntegratedWalletDataBtn.addEventListener("click", () => {
      document.getElementById("swapIntegratedUid").value = "";
      document.getElementById("swapIntegratedWid").value = "";
      document.getElementById("swapIntegratedSid").value = "";
      document.getElementById("swapIntegratedPvencstr").value = "";
      document.getElementById("swapIntegratedEncryptDevicePassword").value = "";
      showResult(
        "swap-integrated-raw-result",
        "지갑 데이터 필드를 초기화했습니다.",
        "info"
      );
    });
  }
};
