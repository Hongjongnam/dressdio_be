document.addEventListener("DOMContentLoaded", function () {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContent = document.getElementById("tab-content");

  const tabFiles = {
    auth: "tab-auth.html",
    sbt: "tab-sbt.html",
    ipnft: "tab-ipnft.html",
    merchandise: "tab-merchandise.html",
    platform: "tab-platform.html",
    blockchain: "tab-blockchain.html",
  };

  function loadTab(tab) {
    const file = tabFiles[tab] || tabFiles["auth"];
    fetch(file)
      .then((res) => res.text())
      .then((html) => {
        tabContent.innerHTML = html;
        // 탭 로드 후 이벤트 핸들러 등록
        registerTabHandlers(tab);
      });
  }

  function registerTabHandlers(tab) {
    switch (tab) {
      case "auth":
        registerAuthHandlers();
        break;
      case "sbt":
        registerSBTHandlers();
        break;
      case "ipnft":
        registerIPNFTHandlers();
        break;
      case "merchandise":
        registerMerchandiseHandlers();
        break;
      case "platform":
        registerPlatformHandlers();
        break;
      case "blockchain":
        registerBlockchainHandlers();
        break;
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", function () {
      tabButtons.forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      const tab = this.getAttribute("data-tab");
      loadTab(tab);
    });
  });

  // 최초 로드시 auth 탭
  loadTab("auth");
});

// 공통 API 호출 함수
async function callAPI(
  endpoint,
  method = "GET",
  data = null,
  isFormData = false,
  accessToken = null
) {
  const options = {
    method: method,
    headers: {},
  };

  // Authorization 헤더는 항상 추가
  if (accessToken) {
    options.headers["Authorization"] = `Bearer ${accessToken}`;
  }

  if (data && !isFormData) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(data);
  } else if (data && isFormData) {
    options.body = data;
    // Content-Type은 직접 지정하지 않음
  }

  try {
    const response = await fetch(`/api${endpoint}`, options);
    const result = await response.json();
    return { success: response.ok, data: result, status: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Auth 핸들러들
function registerAuthHandlers() {
  // 회원가입
  const registerForm = document.getElementById("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(registerForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI("/auth/register", "POST", data);
      document.getElementById("register-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 로그인
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(loginForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI("/auth/login", "POST", data);
      document.getElementById("login-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 토큰 리프레시
  const refreshForm = document.getElementById("refresh-form");
  if (refreshForm) {
    refreshForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(refreshForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI("/auth/refresh-token", "POST", data);
      document.getElementById("refresh-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 인증코드 발송
  const sendCodeForm = document.getElementById("send-code-form");
  if (sendCodeForm) {
    sendCodeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(sendCodeForm);
      const data = Object.fromEntries(formData);

      // 쿼리 파라미터 구성
      const params = new URLSearchParams();
      if (data.lang) params.append("lang", data.lang);
      if (data.template) params.append("template", data.template);

      const queryString = params.toString();
      const url = `/auth/${data.email}/send-code${
        queryString ? `?${queryString}` : ""
      }`;

      const result = await callAPI(url, "GET");
      document.getElementById("send-code-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 인증코드 확인
  const verifyCodeForm = document.getElementById("verify-code-form");
  if (verifyCodeForm) {
    verifyCodeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(verifyCodeForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        `/auth/${data.email}/verify-code`,
        "POST",
        data
      );
      document.getElementById("verify-code-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 이메일 인증
  const verifyEmailForm = document.getElementById("verify-email-form");
  if (verifyEmailForm) {
    verifyEmailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(verifyEmailForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(`/auth/${data.email}/verify-email`, "GET");
      document.getElementById("verify-email-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 비밀번호 재설정
  const resetPasswordForm = document.getElementById("reset-password-form");
  if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(resetPasswordForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI("/auth/reset-password", "POST", data);
      document.getElementById("reset-password-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 비밀번호 변경
  const changePasswordForm = document.getElementById("change-password-form");
  if (changePasswordForm) {
    changePasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(changePasswordForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI("/auth/change-password", "POST", data);
      document.getElementById("change-password-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 내 계정 정보
  const accountForm = document.getElementById("account-form");
  if (accountForm) {
    accountForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(accountForm);
      const data = Object.fromEntries(formData);
      const result = await callAPI(
        "/auth/account",
        "GET",
        null,
        false,
        data.accessToken
      );
      document.getElementById("account-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 잔액 조회
  const balanceForm = document.getElementById("balance-form");
  if (balanceForm) {
    balanceForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(balanceForm);
      const data = Object.fromEntries(formData);
      const result = await callAPI(
        "/auth/balance",
        "GET",
        null,
        false,
        data.accessToken
      );
      document.getElementById("balance-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }
}

// SBT 핸들러들
function registerSBTHandlers() {
  // SBT 발급
  const mintSbtForm = document.getElementById("mint-sbt-form");
  if (mintSbtForm) {
    mintSbtForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(mintSbtForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/nft/sbt/mint",
        "POST",
        data,
        false,
        data.accessToken
      );
      document.getElementById("mint-sbt-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 전체 SBT 목록 조회
  const getAllSbtBtn = document.getElementById("get-all-sbt-btn");
  if (getAllSbtBtn) {
    getAllSbtBtn.addEventListener("click", async () => {
      const result = await callAPI("/nft/sbt", "GET");
      document.getElementById("get-all-sbt-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // SBT 정보 조회
  const getSbtInfoForm = document.getElementById("get-sbt-info-form");
  if (getSbtInfoForm) {
    getSbtInfoForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(getSbtInfoForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(`/nft/sbt/info/${data.sbtId}`, "GET");
      document.getElementById("get-sbt-info-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 주소별 SBT 목록 조회
  const getSbtByAddressForm = document.getElementById(
    "get-sbt-by-address-form"
  );
  if (getSbtByAddressForm) {
    getSbtByAddressForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(getSbtByAddressForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(`/nft/sbt/${data.address}`, "GET");
      document.getElementById("get-sbt-by-address-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }
}

// IPNFT 핸들러들
function registerIPNFTHandlers() {
  // IPNFT 발급
  const mintIpnftForm = document.getElementById("mint-ipnft-form");
  const ipfsImageInput = document.getElementById("ipfsImageInput");
  const ipfsImagePreview = document.getElementById("ipfsImagePreview");

  // 이미지 미리보기 기능 추가
  if (ipfsImageInput && ipfsImagePreview) {
    ipfsImageInput.addEventListener("change", function () {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
          ipfsImagePreview.src = e.target.result;
          ipfsImagePreview.style.display = "block";
        };
        reader.readAsDataURL(file);
      } else {
        ipfsImagePreview.src = "";
        ipfsImagePreview.style.display = "none";
      }
    });
  }

  if (mintIpnftForm) {
    mintIpnftForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(mintIpnftForm);
      const accessToken = formData.get("accessToken");
      formData.delete("accessToken"); // FormData에서 제거
      const result = await callAPI(
        "/nft/ip/mint",
        "POST",
        formData,
        true,
        accessToken
      );
      document.getElementById("mint-ipnft-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 내 IPNFT 조회
  const myIpnftForm = document.getElementById("my-ipnft-form");
  if (myIpnftForm) {
    myIpnftForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(myIpnftForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        `/nft/ip/my`,
        "GET",
        null,
        false,
        data.accessToken
      );
      document.getElementById("my-ipnft-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 전체 IPNFT 조회
  const getAllIpnftBtn = document.getElementById("get-all-ipnft-btn");
  if (getAllIpnftBtn) {
    getAllIpnftBtn.addEventListener("click", async () => {
      const result = await callAPI("/nft/ip/list", "GET");
      document.getElementById("all-ipnft-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // IPNFT 정보 조회
  const getIpnftInfoForm = document.getElementById("get-ipnft-info-form");
  if (getIpnftInfoForm) {
    getIpnftInfoForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(getIpnftInfoForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(`/nft/ip/info/${data.tokenId}`, "GET");
      document.getElementById("get-ipnft-info-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 민팅 수수료 조회
  const getMintingFeeBtn = document.getElementById("get-minting-fee-btn");
  if (getMintingFeeBtn) {
    getMintingFeeBtn.addEventListener("click", async () => {
      const result = await callAPI("/nft/ip/minting-fee", "GET");
      document.getElementById("minting-fee-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 민팅 수수료 변경
  const setMintingFeeForm = document.getElementById("set-minting-fee-form");
  if (setMintingFeeForm) {
    setMintingFeeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(setMintingFeeForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI("/nft/ip/minting-fee", "POST", data);
      document.getElementById("set-minting-fee-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }
}

// Merchandise 핸들러들
function registerMerchandiseHandlers() {
  // 프로젝트 생성
  const createProjectForm = document.getElementById("create-project-form");
  if (createProjectForm) {
    createProjectForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(createProjectForm);
      const accessToken = formData.get("accessToken");

      const result = await callAPI(
        "/nft/merchandise/create",
        "POST",
        formData,
        true,
        accessToken
      );
      document.getElementById("create-project-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 내 프로젝트 목록
  const myProjectsForm = document.getElementById("my-projects-form");
  if (myProjectsForm) {
    myProjectsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(myProjectsForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/nft/merchandise/my",
        "GET",
        null,
        false,
        data.accessToken
      );
      document.getElementById("my-projects-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 3. 전체 프로젝트 목록 카드 렌더링 함수
  async function renderMerchandiseProjects() {
    try {
      const res = await fetch("/api/nft/merchandise/list");
      const result = await res.json();
      // 응답 구조에 따라 아래 라인 조정 (data.data 또는 data)
      const list = result.data?.data || result.data || [];
      const container = document.getElementById("project-list");
      if (!container) return;
      container.innerHTML = "";
      if (!Array.isArray(list) || list.length === 0) {
        container.innerHTML =
          '<div style="color:#888;padding:2em;">No projects found.</div>';
        return;
      }
      list.forEach((project) => {
        const card = document.createElement("div");
        card.style.border = "1px solid #ddd";
        card.style.borderRadius = "8px";
        card.style.padding = "16px";
        card.style.width = "280px";
        card.style.background = "#fafbfc";
        card.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
        card.style.marginBottom = "8px";
        card.innerHTML = `
          <div style="text-align:center;">
            <img src="${
              project.projectImageURI || ""
            }" alt="project image" style="max-width:100%;max-height:160px;border-radius:6px;object-fit:cover;background:#eee;">
          </div>
          <h3 style="margin:12px 0 4px 0;">${project.projectName || ""}</h3>
          <div style="color:#666;font-size:13px;margin-bottom:8px;">${
            project.description || ""
          }</div>
          <div><b>Project ID:</b> ${project.projectId ?? ""}</div>
          <div><b>Influencer:</b> ${project.influencer || ""}</div>
          <div><b>Brand IPNFT:</b> ${project.brandIPNFTTokenId ?? ""}</div>
          <div><b>Artist IPNFTs:</b> ${(project.artistIPNFTTokenIds || []).join(
            ", "
          )}</div>
          <div><b>Total Supply:</b> ${project.totalSupply ?? ""}</div>
          <div><b>Sale Price:</b> ${project.salePrice ?? ""} DP</div>
          <div><b>Minted:</b> ${project.mintedCount ?? ""}</div>
          <div><b>Active:</b> ${project.isActive ? "✅" : "❌"}</div>
          <div style="font-size:11px;color:#aaa;margin-top:6px;">Created: ${
            project.createdAt
              ? new Date(Number(project.createdAt) * 1000).toLocaleString()
              : ""
          }</div>
        `;
        container.appendChild(card);
      });
    } catch (e) {
      const container = document.getElementById("project-list");
      if (container)
        container.innerHTML =
          '<div style="color:red;">Error loading projects</div>';
    }
  }

  // 3. 전체 프로젝트 목록 버튼 이벤트 등록
  const loadProjectsBtn = document.getElementById("load-projects-btn");
  if (loadProjectsBtn) {
    loadProjectsBtn.onclick = renderMerchandiseProjects;
  }
  // 외부에서 호출 가능하도록 window에 등록
  window.renderMerchandiseProjects = renderMerchandiseProjects;

  // 브랜드 활성화 대기 프로젝트
  const brandPendingForm = document.getElementById("brand-pending-form");
  if (brandPendingForm) {
    brandPendingForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(brandPendingForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/nft/merchandise/brand-pending",
        "GET",
        null,
        false,
        data.accessToken
      );
      document.getElementById("brand-pending-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 프로젝트 활성화
  const activateProjectForm = document.getElementById("activate-project-form");
  if (activateProjectForm) {
    activateProjectForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(activateProjectForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        `/nft/merchandise/activate/${data.projectId}`,
        "POST",
        null,
        false,
        data.accessToken
      );
      document.getElementById("activate-project-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 구매 요청
  const requestPurchaseForm = document.getElementById("request-purchase-form");
  if (requestPurchaseForm) {
    requestPurchaseForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(requestPurchaseForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/nft/merchandise/request-purchase",
        "POST",
        data,
        false,
        data.accessToken
      );
      document.getElementById("request-purchase-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 구매 확정
  const confirmPurchaseForm = document.getElementById("confirm-purchase-form");
  if (confirmPurchaseForm) {
    confirmPurchaseForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(confirmPurchaseForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/nft/merchandise/confirm-purchase",
        "POST",
        data,
        false,
        data.accessToken
      );
      document.getElementById("confirm-purchase-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 내가 소유한 NFT 조회
  const myNftsForm = document.getElementById("my-nfts-form");
  if (myNftsForm) {
    myNftsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(myNftsForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/nft/merchandise/my-nfts",
        "GET",
        null,
        false,
        data.accessToken
      );
      document.getElementById("my-nfts-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 전체 Merchandise NFT 조회
  const allNftsBtn = document.getElementById("all-nfts-btn");
  if (allNftsBtn) {
    allNftsBtn.addEventListener("click", async () => {
      const result = await callAPI("/nft/merchandise/all-nfts", "GET");
      document.getElementById("all-nfts-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 특정 NFT 상세 조회
  const nftDetailForm = document.getElementById("nft-detail-form");
  if (nftDetailForm) {
    nftDetailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(nftDetailForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        `/nft/merchandise/nft/${data.tokenId}`,
        "GET"
      );
      document.getElementById("nft-detail-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 구매 취소
  const cancelPurchaseForm = document.getElementById("cancel-purchase-form");
  if (cancelPurchaseForm) {
    cancelPurchaseForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(cancelPurchaseForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/nft/merchandise/cancel-purchase",
        "POST",
        data,
        false,
        data.accessToken
      );
      document.getElementById("cancel-purchase-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 내 구매 요청 목록
  const myPurchaseRequestsForm = document.getElementById(
    "my-purchase-requests-form"
  );
  if (myPurchaseRequestsForm) {
    myPurchaseRequestsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(myPurchaseRequestsForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/nft/merchandise/my-purchase-requests",
        "GET",
        null,
        false,
        data.accessToken
      );
      document.getElementById("my-purchase-requests-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 프로젝트별 구매 요청 목록
  const projectPurchaseRequestsForm = document.getElementById(
    "project-purchase-requests-form"
  );
  if (projectPurchaseRequestsForm) {
    projectPurchaseRequestsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(projectPurchaseRequestsForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        `/nft/merchandise/purchase-requests/${data.projectId}`,
        "GET"
      );
      document.getElementById("project-purchase-requests-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 플랫폼 수수료 정보
  const platformFeeInfoBtn = document.getElementById("platform-fee-info-btn");
  if (platformFeeInfoBtn) {
    platformFeeInfoBtn.addEventListener("click", async () => {
      const result = await callAPI("/nft/merchandise/platform-fee-info", "GET");
      document.getElementById("platform-fee-info-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 모든 영수증 목록
  const allReceiptsBtn = document.getElementById("all-receipts-btn");
  if (allReceiptsBtn) {
    allReceiptsBtn.addEventListener("click", async () => {
      const result = await callAPI("/nft/merchandise/receipts", "GET");
      document.getElementById("all-receipts-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 특정 영수증 조회
  const receiptDetailForm = document.getElementById("receipt-detail-form");
  if (receiptDetailForm) {
    receiptDetailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(receiptDetailForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        `/nft/merchandise/receipt/${data.receiptId}`,
        "GET"
      );
      document.getElementById("receipt-detail-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 프로젝트별 영수증 목록
  const projectReceiptsForm = document.getElementById("project-receipts-form");
  if (projectReceiptsForm) {
    projectReceiptsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(projectReceiptsForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        `/nft/merchandise/receipts/project/${data.projectId}`,
        "GET"
      );
      document.getElementById("project-receipts-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // PDF 영수증 다운로드
  const pdfDownloadForm = document.getElementById("pdf-download-form");
  if (pdfDownloadForm) {
    pdfDownloadForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(pdfDownloadForm);
      const data = Object.fromEntries(formData);

      try {
        const response = await fetch(
          `/api/nft/merchandise/receipt/${data.receiptId}/pdf`,
          {
            method: "GET",
          }
        );

        if (response.ok) {
          // PDF 파일 다운로드
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${data.receiptId}.pdf`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          document.getElementById("pdf-download-result").innerHTML =
            '<div style="color: green;">PDF 영수증이 성공적으로 다운로드되었습니다!</div>';
        } else {
          const errorData = await response.json();
          document.getElementById(
            "pdf-download-result"
          ).innerHTML = `<div style="color: red;">다운로드 실패: ${errorData.message}</div>`;
        }
      } catch (error) {
        document.getElementById(
          "pdf-download-result"
        ).innerHTML = `<div style="color: red;">오류: ${error.message}</div>`;
      }
    });
  }

  // PDF 영수증 생성
  const pdfGenerateForm = document.getElementById("pdf-generate-form");
  if (pdfGenerateForm) {
    pdfGenerateForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(pdfGenerateForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        `/nft/merchandise/receipt/${data.receiptId}/generate-pdf`,
        "POST"
      );
      document.getElementById("pdf-generate-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }
}

// Platform 핸들러들
function registerPlatformHandlers() {
  // 현재 소유자 조회
  const getOwnerBtn = document.getElementById("get-owner-btn");
  if (getOwnerBtn) {
    getOwnerBtn.addEventListener("click", async () => {
      const result = await callAPI("/nft/platform/owner", "GET");
      document.getElementById("get-owner-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // PlatformRegistry 상태 조회
  const getStatusBtn = document.getElementById("get-status-btn");
  if (getStatusBtn) {
    getStatusBtn.addEventListener("click", async () => {
      const result = await callAPI("/nft/platform/status", "GET");
      document.getElementById("get-status-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 팩토리 설정
  const setFactoryForm = document.getElementById("set-factory-form");
  if (setFactoryForm) {
    setFactoryForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(setFactoryForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/nft/platform/set-factory",
        "POST",
        data,
        false,
        data.accessToken
      );
      document.getElementById("set-factory-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 주요 컨트랙트 주소 조회
  const getAddressesBtn = document.getElementById("get-addresses-btn");
  if (getAddressesBtn) {
    getAddressesBtn.addEventListener("click", async () => {
      const result = await callAPI("/nft/platform/addresses", "GET");
      document.getElementById("get-addresses-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 통합 소유권 이전
  document
    .getElementById("transferAllOwnershipForm")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const accessToken = formData.get("accessToken");

      try {
        const response = await fetch(
          "/api/nft/platform/transfer-all-ownership",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              newOwner: formData.get("newOwner"),
            }),
          }
        );

        const result = await response.json();
        const responseArea = document.getElementById(
          "transferAllOwnershipResponse"
        );
        responseArea.innerHTML = `<pre>${JSON.stringify(
          result,
          null,
          2
        )}</pre>`;
      } catch (error) {
        console.error("Error:", error);
        document.getElementById(
          "transferAllOwnershipResponse"
        ).innerHTML = `<pre>Error: ${error.message}</pre>`;
      }
    });

  // 개별 소유권 이전
  document
    .getElementById("transferOwnershipForm")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const accessToken = formData.get("accessToken");

      try {
        const response = await fetch("/api/nft/platform/transfer-ownership", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            contractType: formData.get("contractType"),
            newOwner: formData.get("newOwner"),
          }),
        });

        const result = await response.json();
        const responseArea = document.getElementById(
          "transferOwnershipResponse"
        );
        responseArea.innerHTML = `<pre>${JSON.stringify(
          result,
          null,
          2
        )}</pre>`;
      } catch (error) {
        console.error("Error:", error);
        document.getElementById(
          "transferOwnershipResponse"
        ).innerHTML = `<pre>Error: ${error.message}</pre>`;
      }
    });
}

// Blockchain 핸들러들
function registerBlockchainHandlers() {
  // Faucet (DP 토큰 받기)
  const faucetForm = document.getElementById("faucet-form");
  if (faucetForm) {
    faucetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(faucetForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI("/utils/faucet", "POST", data);
      document.getElementById("faucet-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // IPFS 파일 업로드
  const ipfsUploadFileForm = document.getElementById("ipfs-upload-file-form");
  if (ipfsUploadFileForm) {
    ipfsUploadFileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(ipfsUploadFileForm);

      const result = await callAPI(
        "/utils/ipfs/upload-file",
        "POST",
        formData,
        true
      );
      document.getElementById("ipfs-upload-file-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // IPFS JSON 업로드
  const ipfsUploadJsonForm = document.getElementById("ipfs-upload-json-form");
  if (ipfsUploadJsonForm) {
    ipfsUploadJsonForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(ipfsUploadJsonForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI("/utils/ipfs/upload-json", "POST", data);
      document.getElementById("ipfs-upload-json-result").textContent =
        JSON.stringify(result, null, 2);
    });
  }

  // 내 계정 정보
  const accountForm = document.getElementById("account-form");
  if (accountForm) {
    accountForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(accountForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/auth/account",
        "GET",
        null,
        false,
        data.accessToken
      );
      document.getElementById("account-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 잔액 조회
  const balanceForm = document.getElementById("balance-form");
  if (balanceForm) {
    balanceForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(balanceForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/auth/balance",
        "GET",
        null,
        false,
        data.accessToken
      );
      document.getElementById("balance-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 트랜잭션 서명
  const signTxForm = document.getElementById("sign-tx-form");
  if (signTxForm) {
    signTxForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(signTxForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/auth/blockchain/sign/transaction",
        "POST",
        data,
        false,
        data.accessToken
      );
      document.getElementById("sign-tx-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }

  // 트랜잭션 전송
  const sendTxForm = document.getElementById("send-tx-form");
  if (sendTxForm) {
    sendTxForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(sendTxForm);
      const data = Object.fromEntries(formData);

      const result = await callAPI(
        "/auth/blockchain/raw-tx/send",
        "POST",
        data
      );
      document.getElementById("send-tx-result").textContent = JSON.stringify(
        result,
        null,
        2
      );
    });
  }
}
