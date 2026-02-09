# 🎨 DressDio - 블록체인 기반 패션 크리에이터 플랫폼

> **프로젝트 기간**: 2024-2025  
> **개발자**: 홍종남 (퓨처센스)  
> **역할**: Full-Stack Blockchain Developer  
> **기술 스택**: Node.js, Express.js, Solidity, Web3.js, Hardhat, MPC Wallet

---

## 📌 프로젝트 개요

DressDio는 패션 디자이너, 인플루언서, 브랜드를 연결하는 **블록체인 기반 IP 거래 플랫폼**입니다.
Web3 기술을 활용하여 지적재산권(IP) NFT 발행, 상품화 프로세스, 수익 분배를 자동화한 탈중앙화 플랫폼을 구축했습니다.

### 🎯 핵심 가치

- **투명한 수익 분배**: 스마트 컨트랙트 기반 자동 로열티 정산
- **IP 보호**: 블록체인 기반 지적재산권 증명 및 관리
- **크리에이터 이코노미**: 디자이너, 인플루언서, 브랜드 간 협업 생태계 구축
- **보안 강화**: MPC(Multi-Party Computation) 패턴으로 개인키 유출 방지

---

## 🏆 주요 성과

### 기술적 성과

✅ **8개의 RESTful API 모듈** 설계 및 구현 (총 60+ 엔드포인트)  
✅ **9개의 Solidity 스마트 컨트랙트** 개발 및 배포  
✅ **MPC 지갑 시스템** 구현으로 서버에 개인키 미저장 (보안 강화)  
✅ **이중 블록체인 네트워크** 통합 (Besu Private + Polygon Mainnet)  
✅ **자동 토큰 스왑 시스템** 구현 (1:5 미러링)  
✅ **IPFS 기반 탈중앙화 스토리지** 통합  
✅ **완전한 API 문서화** (Swagger + Postman Collection)

### 비즈니스 성과

- 완전한 크리에이터 인증 시스템 (SBT)
- IP NFT 발행 및 거래 플랫폼
- Merchandise 프로젝트 생성 및 구매 시스템
- 자동화된 수익 분배 (인플루언서, 브랜드, 플랫폼)

---

## 🛠 기술 스택

### Backend

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: JavaScript (ES6+)

### Blockchain

- **Networks**:
  - Besu Private Network (Chain ID: 2741)
  - Polygon Mainnet (Chain ID: 137)
- **Smart Contracts**: Solidity 0.8.28
- **Web3 Library**: Web3.js v4.x, Ethers.js v6.x
- **Development**: Hardhat
- **Token Standard**: ERC-20, ERC-721, Soulbound Token (SBT)

### Security & Wallet

- **Wallet System**: ABC Wallet WaaS API (MPC Pattern)
- **Authentication**: JWT (Access + Refresh Token)
- **Encryption**: bcryptjs, crypto-js

### Storage & Infrastructure

- **Decentralized Storage**: IPFS (Pinata)
- **API Documentation**: Swagger, Postman
- **Logging**: Winston, Pino
- **Process Management**: PM2

### DevOps

- **Version Control**: Git
- **Testing**: Jest, Supertest
- **Security**: Helmet, express-rate-limit, CORS

---

## 🏗 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                       │
│                  MPC Wallet (localStorage)                  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS / JWT
┌───────────────────────────▼─────────────────────────────────┐
│                   Express.js Backend API                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Controllers Layer                                 │    │
│  │  • Auth (15+ endpoints)                           │    │
│  │  • SBT (5+ endpoints)                             │    │
│  │  • IP NFT (7+ endpoints)                          │    │
│  │  • Merchandise (19+ endpoints)                    │    │
│  │  • Platform (6+ endpoints)                        │    │
│  │  • Utils (4+ endpoints)                           │    │
│  └────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Services Layer                                    │    │
│  │  • blockchainMPC.js - MPC 트랜잭션 서명          │    │
│  │  • blockchain.js - 트랜잭션 전송                 │    │
│  │  • mpcWallet.js - ABC Wallet 연동                │    │
│  │  • wallet.js - 지갑 관리                         │    │
│  │  • upload.js - IPFS 업로드                       │    │
│  │  • auth.js - 인증 로직                           │    │
│  └────────────────────────────────────────────────────┘    │
└──────┬─────────────┬──────────────┬──────────────┬─────────┘
       │             │              │              │
   ┌───▼───┐  ┌──────▼──────┐  ┌───▼──────┐  ┌───▼────┐
   │ Besu  │  │   Polygon   │  │ABC Wallet│  │  IPFS  │
   │Private│  │   Mainnet   │  │ WaaS API │  │(Pinata)│
   └───────┘  └─────────────┘  └──────────┘  └────────┘
```

---

## 💎 핵심 기능 상세

### 1. 🔐 인증 시스템 (Auth Module)

**구현 기능** (15개 API)

- 이메일 기반 회원가입/로그인
- 소셜 로그인 (Google, Facebook 등)
- JWT 기반 인증 (Access + Refresh Token)
- MPC 지갑 생성/복구
- 비밀번호 재설정 및 변경
- 계정 정보 조회 및 잔액 조회

**기술적 하이라이트**

```javascript
// MPC 지갑 생성 - 개인키를 서버에 저장하지 않음
POST /api/auth/mpc/wallet/create-or-recover
• ABC Wallet WaaS API 연동
• devicePassword + email로 지갑 복구
• storedWalletData를 클라이언트 localStorage에 저장
• 서버는 트랜잭션 서명만 중개
```

**보안 강점**

- ✅ 개인키 서버 미저장 (MPC 패턴)
- ✅ 암호화된 지갑 데이터 (AES-256)
- ✅ Rate Limiting
- ✅ JWT Refresh Token Rotation

---

### 2. 🎭 SBT (Soulbound Token) 시스템

**개념**: 양도 불가능한 크리에이터 신원 증명 토큰

**구현 기능** (5개 API + 1개 컨트랙트)

- SBT 발행 (Brand, Creator, Designer 타입별)
- SBT 정보 조회 및 목록 조회
- 관리자 전용 발행 권한 관리

**스마트 컨트랙트** (`CreatorSBT.sol`)

```solidity
// 핵심 기능
• safeMint() - 관리자만 발행 가능
• _transfer() - 전송 불가 (Soulbound)
• 3가지 크리에이터 타입 지원 (Brand/Creator/Designer)
• tokenURI() - IPFS 메타데이터 연동
```

**사용 시나리오**

1. 브랜드가 플랫폼에 등록 요청
2. 관리자가 검증 후 Brand SBT 발행
3. SBT 보유자만 IP NFT 발행 및 프로젝트 생성 가능
4. 크리에이터 신원 증명 및 권한 관리

---

### 3. 🎨 IP NFT 시스템

**개념**: 디자이너의 지적재산권을 NFT로 발행

**구현 기능** (7개 API + 2개 컨트랙트)

- IP NFT 발행 (이미지 + 메타데이터)
- IPFS 이미지 업로드
- IP NFT 목록 조회 (전체/내 NFT)
- IP NFT 상세 정보 조회
- 민팅 수수료 조회 및 설정

**스마트 컨트랙트**

- `IPNFTFactory.sol` - Factory 패턴으로 IPNFT 컨트랙트 생성
- `IPNFT.sol` - ERC-721 기반 IP NFT 컨트랙트

```solidity
// IPNFT.sol 핵심 구조
struct IPNFTInfo {
    uint256 tokenId;
    address creator;
    string ipfsImage;
    string name;
    string description;
    uint256 price;
    uint256 supplyPrice;
    string creatorType;
    uint256 mintedAt;
}

function mintIPNFT(
    address _creator,
    string memory _ipfsImage,
    string memory _name,
    string memory _description,
    uint256 _price,
    uint256 _supplyPrice,
    string memory _creatorType
) external payable returns (uint256);
```

**데이터 흐름**

```
1. 디자이너가 이미지 업로드 → IPFS
2. IPFS URI + 메타데이터 전송
3. 스마트 컨트랙트에서 IP NFT 발행
4. 블록체인에 영구 기록
5. 토큰 ID 반환 → 프론트엔드 표시
```

---

### 4. 🛍️ Merchandise 시스템

**개념**: 인플루언서가 IP NFT를 활용해 상품 프로젝트 생성

**구현 기능** (19개 API + 2개 컨트랙트)

- 프로젝트 생성 (인플루언서)
- 프로젝트 활성화 (브랜드)
- 구매 요청 (구매자)
- 구매 확정/취소
- 영수증 생성 (JSON + PDF)
- NFT 민팅 및 수익 분배

**스마트 컨트랙트**

- `MerchandiseFactory.sol` - 프로젝트 관리
- `MerchandiseNFT.sol` - ERC-721 상품 NFT

**비즈니스 로직**

```javascript
// 프로젝트 생성 플로우
1. 인플루언서: 프로젝트 생성 + IP NFT 선택
   POST /api/nft/merchandise/create

2. 브랜드: 프로젝트 검토 및 활성화
   POST /api/nft/merchandise/activate

3. 구매자: 구매 요청 (DP Token 전송)
   POST /api/nft/merchandise/request-purchase

4. 구매자: 구매 확정 (NFT 민팅 + 수익 분배)
   POST /api/nft/merchandise/confirm-purchase

   수익 분배:
   • 인플루언서: 45%
   • 브랜드: 45%
   • 플랫폼: 10%
```

**자동화된 영수증 시스템**

- JSON 영수증 자동 생성 (`/receipts` 폴더)
- PDF 영수증 자동 생성 (PDFKit)
- 구매 내역, 수익 분배 내역 포함

---

### 5. 🔗 블록체인 통합

#### 이중 네트워크 구조

| 네트워크            | 용도                               | 트랜잭션 타입 | Gas 비용       |
| ------------------- | ---------------------------------- | ------------- | -------------- |
| **Besu Private**    | IP NFT, SBT, Merchandise, DP Token | Legacy        | 무료 (Private) |
| **Polygon Mainnet** | Dress Token 전송, 토큰 스왑        | EIP-1559      | MATIC 필요     |

#### 자동 토큰 스왑 시스템 (1:5 미러링)

**개념**: Polygon의 Dress Token → Besu의 DP Token 자동 교환

```javascript
// API: POST /api/utils/dress-token/transfer-and-swap
// 플로우
1. 사용자가 Polygon에서 Dress Token 전송 (1 DRESS)
   → 플랫폼 지갑 (0x2C686C46D3622d60CCAbEfb757158c8904312871)

2. Transfer 이벤트 파싱 및 검증
   • 실제 전송 금액 확인 (블록체인 데이터 기준)
   • 받는 주소 확인 (플랫폼 지갑인지)

3. DP Token 계산 (1:5 비율)
   1 DRESS × 5 = 5 DP

4. DP Token 자동 지급 (Besu)
   플랫폼 지갑 → 사용자 지갑 (5 DP)

5. 완료 (양쪽 TxHash 반환)
```

**보안 검증**

```javascript
// Transfer 이벤트 파싱으로 실제 금액 확인
const transferEventSignature = web3.utils.keccak256(
  "Transfer(address,address,uint256)",
);

const transferLog = txReceipt.logs.find(
  (log) => log.topics[0] === transferEventSignature,
);

// 사용자가 입력한 금액이 아닌, 실제 전송된 금액 사용
const actualAmount = BigInt(transferLog.data);
const dpAmount = actualAmount * 5n;
```

---

### 6. 🔒 MPC 트랜잭션 서명

**기술적 배경**

기존 방식의 문제점:

- ❌ 서버에 개인키 저장 → 해킹 시 모든 지갑 탈취 위험
- ❌ 중앙화된 키 관리

MPC 패턴의 장점:

- ✅ 개인키를 여러 조각으로 분산 저장
- ✅ 서버는 트랜잭션 서명만 중개
- ✅ ABC Wallet WaaS API가 보안 채널에서 서명 수행

**구현 상세** (`src/services/blockchainMPC.js`)

```javascript
// Besu 네트워크 트랜잭션 서명
async function executeTransactionWithStoredData(
  storedWalletData,
  devicePassword,
  txData,
  accessToken,
) {
  // 1. 보안 채널 생성 (ABC Wallet)
  const channelData = await walletService.createSecureChannel(
    storedWalletData,
    devicePassword,
    accessToken,
  );

  // 2. 트랜잭션 해시 계산
  const txHash = web3.utils.keccak256(encodedTx);

  // 3. ABC Wallet에 서명 요청
  const { r, s, v } = await walletService.signTransactionHash(
    channelData,
    txHash,
  );

  // 4. 서명된 트랜잭션 RLP 인코딩
  const signedTxData = [nonce, gasPrice, gasLimit, to, value, data, v, r, s];
  const rawTx = rlp.encode(signedTxData);

  // 5. 블록체인으로 전송
  const receipt = await web3.eth.sendSignedTransaction("0x" + rawTx);
  return receipt;
}
```

**Polygon (EIP-1559) 별도 처리**

```javascript
// EIP-1559 트랜잭션 (Type 2)
const txData = [
  chainId,
  nonce,
  maxPriorityFeePerGas,
  maxFeePerGas,
  gasLimit,
  to,
  value,
  data,
  [], // accessList
];

// Type 2 prefix (0x02) 추가
const encodedTx = "0x02" + rlp.encode(txData).toString("hex");
```

---

### 7. 🏢 플랫폼 관리 시스템

**구현 기능** (6개 API)

- 컨트랙트 소유권 이전
- 팩토리 주소 설정
- 플랫폼 상태 조회
- 컨트랙트 주소 조회

**스마트 컨트랙트** (`PlatformRegistry.sol`)

```solidity
// 중앙화된 컨트랙트 주소 관리
contract PlatformRegistry is Ownable {
    address public sbtContract;
    address public merchandiseFactory;
    address public ipnftFactory;
    address public dpToken;

    function setSBTContract(address _sbt) external onlyOwner;
    function setMerchandiseFactory(address _factory) external onlyOwner;
    function setIPNFTFactory(address _factory) external onlyOwner;
}
```

**관리 편의성**

- 모든 컨트랙트 주소를 한 곳에서 관리
- 업그레이드 시 Registry만 수정하면 됨
- 각 컨트랙트에서 Registry 참조

---

### 8. 🛠 유틸리티 기능

**구현 기능** (4개 API)

- Faucet (테스트용 DP Token 에어드랍)
- IPFS 파일/JSON 업로드
- IP NFT 디버그

**Faucet 시스템**

```javascript
// POST /api/utils/faucet
// 누구나 사용 가능 (인증 불필요)
// 테스트 환경에서 DP Token 무료 지급

{
  "walletAddress": "0x...",
  "amount": "100"  // 100 DP Token
}

// 관리자 프라이빗 키로 직접 전송
const tx = await web3.eth.sendTransaction({
  from: ADMIN_WALLET,
  to: walletAddress,
  value: web3.utils.toWei(amount, 'ether')
});
```

---

## 📊 스마트 컨트랙트 구조

### 배포된 컨트랙트 목록

| 컨트랙트               | 타입     | 주요 기능                 | 표준                   |
| ---------------------- | -------- | ------------------------- | ---------------------- |
| **DPToken**            | Token    | 플랫폼 내 결제 토큰       | ERC-20                 |
| **CreatorSBT**         | NFT      | 크리에이터 신원 증명      | SBT (Non-transferable) |
| **IPNFTFactory**       | Factory  | IP NFT 컨트랙트 생성      | Factory Pattern        |
| **IPNFT**              | NFT      | 지적재산권 NFT            | ERC-721                |
| **MerchandiseFactory** | Factory  | Merchandise 프로젝트 관리 | Factory Pattern        |
| **MerchandiseNFT**     | NFT      | 상품 NFT                  | ERC-721                |
| **PlatformRegistry**   | Registry | 컨트랙트 주소 관리        | Ownable                |
| **PersonalNFT**        | NFT      | 개인 NFT (미사용)         | ERC-721                |

### 컨트랙트 의존성 다이어그램

```
┌─────────────────────────────────────────────────────────┐
│                   PlatformRegistry                      │
│  (모든 컨트랙트 주소 중앙 관리)                           │
└────────┬───────────────────────┬───────────────────────┘
         │                       │
    ┌────▼────────┐         ┌────▼────────┐
    │ CreatorSBT  │         │  DPToken    │
    │   (SBT)     │         │  (ERC-20)   │
    └────┬────────┘         └──────┬──────┘
         │                         │
    ┌────▼─────────────────────────▼──────┐
    │       IPNFTFactory                  │
    │  ┌──────────────────────────┐      │
    │  │     IPNFT (ERC-721)      │      │
    │  └──────────────────────────┘      │
    └────┬────────────────────────────────┘
         │
    ┌────▼─────────────────────────────────┐
    │     MerchandiseFactory               │
    │  ┌──────────────────────────┐       │
    │  │ MerchandiseNFT (ERC-721) │       │
    │  └──────────────────────────┘       │
    │                                      │
    │  • Project 생성/활성화               │
    │  • Purchase Request 관리             │
    │  • 수익 분배 (45% / 45% / 10%)       │
    └──────────────────────────────────────┘
```

### Hardhat 배포 스크립트

```javascript
// scripts/deploy.js
async function main() {
  // 1. CreatorSBT 배포
  const CreatorSBT = await ethers.getContractFactory("CreatorSBT");
  const sbt = await CreatorSBT.deploy(adminWallet);

  // 2. PlatformRegistry 배포
  const Registry = await ethers.getContractFactory("PlatformRegistry");
  const registry = await Registry.deploy(adminWallet);

  // 3. IPNFTFactory 배포
  const IPNFTFactory = await ethers.getContractFactory("IPNFTFactory");
  const ipnftFactory = await IPNFTFactory.deploy(
    registry.target,
    dpTokenAddress,
  );

  // 4. MerchandiseFactory 배포
  const MerchandiseFactory = await ethers.getContractFactory(
    "MerchandiseFactory",
  );
  const merchFactory = await MerchandiseFactory.deploy(
    ipnftAddress,
    sbt.target,
    dpTokenAddress,
  );

  // 5. Registry에 모든 컨트랙트 등록
  await registry.setSBTContract(sbt.target);
  await registry.setIPNFTFactory(ipnftFactory.target);
  await registry.setMerchandiseFactory(merchFactory.target);

  // 6. 소유권 이전 (MPC 지갑으로)
  await sbt.transferOwnership(adminWallet);
  await registry.transferOwnership(adminWallet);
  await ipnftFactory.transferOwnership(adminWallet);
  await merchFactory.transferOwnership(adminWallet);
}
```

---

## 📁 프로젝트 구조

```
dressdio_be/
├── contracts/                    # Solidity 스마트 컨트랙트
│   ├── CreatorSBT.sol           # SBT 컨트랙트
│   ├── DPToken.sol              # ERC-20 토큰
│   ├── IPNFT.sol                # IP NFT
│   ├── IPNFTFactory.sol         # IP NFT Factory
│   ├── MerchandiseNFT.sol       # Merchandise NFT
│   ├── MerchandiseFactory.sol   # Merchandise Factory
│   ├── PersonalNFT.sol          # Personal NFT
│   ├── PlatformRegistry.sol     # Registry
│   └── interfaces/
│       └── IIPNFT.sol
│
├── scripts/                      # Hardhat 배포 스크립트
│   ├── deploy.js                # 전체 배포
│   ├── deploy-factory-only.js   # Factory만 배포
│   ├── mint-dp.js               # DP Token 민팅
│   ├── check-ownership.js       # 소유권 확인
│   └── transfer-ownership.js    # 소유권 이전
│
├── src/
│   ├── abi/                     # 컴파일된 ABI 파일
│   │   ├── DPToken.json
│   │   ├── CreatorSBT.json
│   │   ├── IPNFT.json
│   │   ├── IPNFTFactory.json
│   │   ├── MerchandiseNFT.json
│   │   ├── MerchandiseFactory.json
│   │   └── PlatformRegistry.json
│   │
│   ├── config/                  # 설정 파일
│   │   ├── web3.js             # Web3 초기화
│   │   └── swagger.js          # Swagger 설정
│   │
│   ├── controllers/             # 컨트롤러 레이어
│   │   ├── auth/
│   │   │   └── authController.js      # 인증 (15개 API)
│   │   ├── nft/
│   │   │   ├── sbtController.js       # SBT (5개 API)
│   │   │   ├── ipController.js        # IP NFT (7개 API)
│   │   │   ├── merchandiseController.js  # Merchandise (19개 API)
│   │   │   ├── platformController.js  # Platform (6개 API)
│   │   │   └── personalController.js  # Personal NFT
│   │   └── utils/
│   │       └── utilController.js      # Utils (4개 API)
│   │
│   ├── middleware/
│   │   └── auth.js             # JWT 인증 미들웨어
│   │
│   ├── routes/                  # 라우터
│   │   ├── auth/
│   │   │   └── auth.js
│   │   ├── nft/
│   │   │   ├── index.js
│   │   │   ├── sbtRoutes.js
│   │   │   ├── ipRoutes.js
│   │   │   ├── merchandiseRoutes.js
│   │   │   ├── platformRoutes.js
│   │   │   └── personalRoutes.js
│   │   └── utils/
│   │       ├── index.js
│   │       └── faucet.js
│   │
│   ├── services/                # 비즈니스 로직 레이어
│   │   ├── auth.js             # 인증 서비스
│   │   ├── blockchain.js       # 블록체인 트랜잭션
│   │   ├── blockchainMPC.js    # MPC 트랜잭션 서명
│   │   ├── mpcWallet.js        # MPC 지갑 관리
│   │   ├── wallet.js           # ABC Wallet 연동
│   │   └── upload.js           # IPFS 업로드
│   │
│   ├── utils/                   # 유틸리티
│   │   ├── constants.js        # 상수 정의
│   │   ├── logger.js           # 로깅 (Winston)
│   │   ├── validator.js        # 입력 검증
│   │   ├── receiptGenerator.js # JSON 영수증 생성
│   │   ├── pdfReceiptGenerator.js  # PDF 영수증 생성
│   │   └── utils.js
│   │
│   └── server.js               # Express 서버 진입점
│
├── public/                      # Frontend UI (테스트용)
│   ├── index.html              # 메인 페이지
│   ├── tab-auth.html           # 인증 테스트
│   ├── tab-sbt.html            # SBT 테스트
│   ├── tab-ipnft.html          # IP NFT 테스트
│   ├── tab-merchandise.html    # Merchandise 테스트
│   ├── tab-platform.html       # Platform 테스트
│   ├── tab-blockchain.html     # 블록체인 유틸
│   ├── tab-personal.html       # Personal NFT
│   ├── js/
│   │   └── main.js
│   ├── style.css
│   └── Logo.png
│
├── postman/                     # API 테스트
│   ├── dressdio_api_collection.json
│   ├── Blockchain_Utils_APIs.json
│   ├── README.md
│   ├── USAGE_GUIDE.md
│   └── QUICK_START.md
│
├── docs/                        # 문서
│   ├── POLYGON_ERROR_HANDLING_SUMMARY.md
│   └── POLYGON_DRESS_TOKEN_TRANSFER_ERRORS.md
│
├── receipts/                    # 생성된 영수증
│   ├── receipt_*.json
│   └── receipt_*.pdf
│
├── .env                         # 환경 변수
├── .gitignore
├── package.json
├── hardhat.config.js           # Hardhat 설정
├── README.md
├── HANDOVER.md                 # 인수인계서
├── DressDio_API_Documentation.md  # API 문서
└── PORTFOLIO.md                # 포트폴리오 (본 문서)
```

---

## 🔌 API 엔드포인트 요약

### Auth APIs (인증) - 15개

| Method | Endpoint                                 | 설명                    | Auth |
| ------ | ---------------------------------------- | ----------------------- | ---- |
| GET    | `/api/auth/:email/verify-email`          | 이메일 확인             | ❌   |
| GET    | `/api/auth/:email/send-code`             | 인증 코드 발송          | ❌   |
| POST   | `/api/auth/:email/verify-code`           | 인증 코드 확인          | ❌   |
| POST   | `/api/auth/register`                     | 회원가입                | ❌   |
| POST   | `/api/auth/login`                        | 로그인                  | ❌   |
| POST   | `/api/auth/refresh-token`                | 토큰 갱신               | ❌   |
| POST   | `/api/auth/reset-password`               | 비밀번호 재설정         | ❌   |
| GET    | `/api/auth/account`                      | 계정 정보 조회          | ✅   |
| GET    | `/api/auth/balance`                      | 잔액 조회               | ✅   |
| GET    | `/api/auth/social/login-url`             | 소셜 로그인 URL         | ❌   |
| POST   | `/api/auth/social/finalize`              | 소셜 로그인 완료        | ❌   |
| POST   | `/api/auth/social/register`              | 소셜 회원가입           | ❌   |
| POST   | `/api/auth/social/login-full`            | 소셜 로그인 전체 플로우 | ❌   |
| POST   | `/api/auth/mpc/wallet/create-or-recover` | MPC 지갑 생성/복구      | ✅   |
| POST   | `/api/auth/change-password`              | 비밀번호 변경           | ✅   |

### SBT APIs - 5개

| Method | Endpoint                          | 설명             | Auth |
| ------ | --------------------------------- | ---------------- | ---- |
| GET    | `/api/nft/sbt/list`               | 전체 SBT 목록    | ❌   |
| GET    | `/api/nft/sbt/:tokenId`           | SBT 정보 조회    | ❌   |
| GET    | `/api/nft/sbt/admin-balance`      | 관리자 잔액 조회 | ❌   |
| POST   | `/api/nft/sbt/mint`               | SBT 발행         | ✅   |
| POST   | `/api/nft/sbt/transfer-ownership` | 소유권 이전      | ✅   |

### IP NFT APIs - 7개

| Method | Endpoint                      | 설명             | Auth |
| ------ | ----------------------------- | ---------------- | ---- |
| POST   | `/api/nft/ip/mint`            | IP NFT 발행      | ✅   |
| GET    | `/api/nft/ip/list`            | 전체 목록 조회   | ❌   |
| GET    | `/api/nft/ip/my`              | 내 IP NFT 조회   | ✅   |
| GET    | `/api/nft/ip/info/:tokenId`   | IP NFT 정보 조회 | ❌   |
| GET    | `/api/nft/ip/minting-fee`     | 민팅 수수료 조회 | ❌   |
| POST   | `/api/nft/ip/set-minting-fee` | 수수료 설정      | ✅   |
| POST   | `/api/nft/ip/upload-image`    | 이미지 업로드    | ✅   |

### Merchandise APIs - 19개

| Method | Endpoint                                                      | 설명                 | Auth |
| ------ | ------------------------------------------------------------- | -------------------- | ---- |
| POST   | `/api/nft/merchandise/create`                                 | 프로젝트 생성        | ✅   |
| GET    | `/api/nft/merchandise/my`                                     | 내 프로젝트 목록     | ✅   |
| GET    | `/api/nft/merchandise/list`                                   | 전체 프로젝트 목록   | ❌   |
| POST   | `/api/nft/merchandise/request-purchase`                       | 구매 요청            | ✅   |
| POST   | `/api/nft/merchandise/confirm-purchase`                       | 구매 확정            | ✅   |
| POST   | `/api/nft/merchandise/cancel-purchase`                        | 구매 취소            | ✅   |
| GET    | `/api/nft/merchandise/my-purchase-requests`                   | 내 구매 요청 목록    | ✅   |
| GET    | `/api/nft/merchandise/purchase-requests/:projectId`           | 프로젝트별 구매 요청 | ❌   |
| GET    | `/api/nft/merchandise/brand-pending`                          | 브랜드 대기 프로젝트 | ✅   |
| POST   | `/api/nft/merchandise/activate`                               | 프로젝트 활성화      | ✅   |
| GET    | `/api/nft/merchandise/my-nfts`                                | 내 Merchandise NFT   | ✅   |
| GET    | `/api/nft/merchandise/all-nfts`                               | 전체 Merchandise NFT | ❌   |
| GET    | `/api/nft/merchandise/nft/:tokenId`                           | NFT 정보 조회        | ❌   |
| GET    | `/api/nft/merchandise/platform-fee-info`                      | 플랫폼 수수료 정보   | ❌   |
| GET    | `/api/nft/merchandise/receipts`                               | 전체 영수증 목록     | ❌   |
| GET    | `/api/nft/merchandise/receipt/:receiptId`                     | 영수증 조회          | ❌   |
| GET    | `/api/nft/merchandise/receipts/project/:projectId`            | 프로젝트별 영수증    | ❌   |
| GET    | `/api/nft/merchandise/receipt/:receiptId/pdf`                 | PDF 영수증 다운로드  | ❌   |
| GET    | `/api/nft/merchandise/purchase-request/:projectId/:requestId` | 구매 요청 정보       | ❌   |

### Platform APIs - 6개

| Method | Endpoint                                   | 설명             | Auth |
| ------ | ------------------------------------------ | ---------------- | ---- |
| POST   | `/api/nft/platform/transfer-all-ownership` | 통합 소유권 이전 | ✅   |
| POST   | `/api/nft/platform/transfer-ownership`     | 소유권 이전      | ✅   |
| GET    | `/api/nft/platform/owner`                  | 소유자 조회      | ❌   |
| GET    | `/api/nft/platform/status`                 | 상태 조회        | ❌   |
| POST   | `/api/nft/platform/set-factory`            | 팩토리 설정      | ✅   |
| GET    | `/api/nft/platform/addresses`              | 주소 조회        | ❌   |

### Utils APIs - 4개

| Method | Endpoint                          | 설명             | Auth |
| ------ | --------------------------------- | ---------------- | ---- |
| POST   | `/api/utils/faucet`               | Faucet (DP 토큰) | ❌   |
| POST   | `/api/utils/ipfs/upload-file`     | IPFS 파일 업로드 | ❌   |
| POST   | `/api/utils/ipfs/upload-json`     | IPFS JSON 업로드 | ❌   |
| GET    | `/api/utils/debug/ipnft/:tokenId` | IP NFT 디버그    | ✅   |

**총 API 엔드포인트**: **56개**

---

## 🧪 테스트 및 문서화

### API 문서

- **Swagger UI**: `https://fs.dressdio.me/api-docs`
- **Postman Collection**: `/postman` 폴더에 전체 API Collection 포함
- **빠른 시작 가이드**: `/postman/QUICK_START.md`
- **사용 가이드**: `/postman/USAGE_GUIDE.md`

### 테스트 UI

프로젝트 루트에서 서버 실행 후 `http://localhost:5000`에서 웹 UI 사용 가능

- Auth 테스트
- SBT 테스트
- IP NFT 테스트
- Merchandise 테스트
- Platform 관리
- Blockchain Utils

### 환경 변수 설정

```env
# 서버
PORT=5000
NODE_ENV=production

# ABC Wallet WaaS
ABC_WALLET_API_KEY=your_api_key
ABC_WALLET_API_URL=https://api.abcwallet.com

# Besu Network
BESU_RPC_URL=https://besu.dressdio.me
DP_TOKEN_ADDRESS=0x...
CREATOR_SBT_ADDRESS=0x...
PLATFORM_REGISTRY_ADDRESS=0x...
MERCHANDISE_FACTORY_ADDRESS=0x...
IPNFT_FACTORY_ADDRESS=0x...

# Polygon Network
POLYGON_RPC_URL=https://polygon-rpc.com
POLYGON_DRESS_TOKEN_ADDRESS=0x5Fc44144218353584FC36Aaa3C0C401348870230

# Platform Admin
PLATFORM_ADMIN_WALLET_ADDRESS=0x2C686C46D3622d60CCAbEfb757158c8904312871
DRESSDIO_ADMIN_WALLET_ADDRESS=0x2C686C46D3622d60CCAbEfb757158c8904312871
DRESSDIO_ADMIN_PRIVATE_KEY=0x...

# Swap
SWAP_RATE=5

# IPFS (Pinata)
PINATA_API_KEY=your_api_key
PINATA_SECRET_KEY=your_secret_key

# JWT
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
```

---

## 🚀 배포 및 실행

### 로컬 개발

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# 개발 서버 실행 (nodemon)
npm run dev

# 또는 일반 실행
npm start
```

### 스마트 컨트랙트 배포

```bash
# Besu 네트워크에 전체 배포
npx hardhat run scripts/deploy.js --network besu

# Factory만 재배포
npx hardhat run scripts/deploy-factory-only.js --network besu

# DP Token 민팅
npx hardhat run scripts/mint-dp.js --network besu

# 소유권 확인
npx hardhat run scripts/check-ownership.js --network besu
```

### 프로덕션 배포

```bash
# PM2 사용
pm2 start src/server.js --name dressdio-api
pm2 logs dressdio-api
pm2 restart dressdio-api

# Docker 사용
docker build -t dressdio-api .
docker run -d \
  -p 5000:5000 \
  --env-file .env \
  --name dressdio-api \
  dressdio-api
```

---

## 📈 성능 및 보안

### 보안 조치

✅ **인증 및 권한**

- JWT 기반 인증 (Access + Refresh Token)
- Bearer Token 인증
- Rate Limiting (express-rate-limit)
- CORS 설정

✅ **데이터 보호**

- MPC 패턴 (개인키 서버 미저장)
- 암호화된 지갑 데이터 (AES-256)
- bcryptjs 비밀번호 해싱
- Helmet.js 보안 헤더

✅ **블록체인 검증**

- Transfer 이벤트 파싱으로 실제 금액 검증
- 컨트랙트 소유권 검증
- 트랜잭션 Receipt 확인

### 성능 최적화

- 비동기 트랜잭션 처리
- 효율적인 RLP 인코딩
- Factory 패턴으로 컨트랙트 재사용
- IPFS 캐싱

---

## 🎓 배운 점 및 기술적 도전

### 1. MPC 지갑 통합

**도전 과제**

- ABC Wallet WaaS API 연동
- 보안 채널 생성 및 트랜잭션 서명
- RLP 인코딩 시 `0` 값 처리 (`"0x"` vs `"0x0"`)

**해결 방법**

- `toHexOrEmpty` 헬퍼 함수로 `0` 값을 `"0x"`로 처리
- 두 네트워크(Besu, Polygon)에 대한 별도 서명 로직 구현
- 상세한 에러 로그 및 디버깅

### 2. 이중 네트워크 통합

**도전 과제**

- Besu (Legacy 트랜잭션) + Polygon (EIP-1559) 동시 지원
- 서로 다른 Gas Price 메커니즘
- 네트워크별 트랜잭션 타입 처리

**해결 방법**

- 네트워크별 별도 서비스 함수 구현
- EIP-1559 트랜잭션 Type 2 prefix (`0x02`) 추가
- `maxFeePerGas`, `maxPriorityFeePerGas` 동적 계산

### 3. 자동 토큰 스왑

**도전 과제**

- 사용자가 입력한 금액과 실제 전송 금액이 다를 수 있음
- Polygon → Besu 간 비동기 처리
- 실패 시 롤백 처리

**해결 방법**

- Transfer 이벤트 파싱으로 실제 금액 확인
- 트랜잭션 실패 시 명확한 에러 메시지
- 양쪽 TxHash 반환으로 추적 가능

### 4. Factory 패턴 설계

**도전 과제**

- IP NFT와 Merchandise NFT를 동적으로 생성
- 각 컨트랙트 간 의존성 관리
- 업그레이드 가능한 구조

**해결 방법**

- PlatformRegistry로 중앙화된 주소 관리
- Factory 패턴으로 컨트랙트 생성
- Ownable 패턴으로 권한 관리

### 5. 영수증 시스템

**도전 과제**

- 구매 내역을 JSON + PDF로 자동 생성
- 수익 분배 내역 포함
- 파일 저장 및 조회

**해결 방법**

- PDFKit으로 PDF 생성
- 구매 확정 시 자동 생성
- `/receipts` 폴더에 저장 및 API로 조회

---

## 🔮 향후 개선 방향

### 기능 확장

- [ ] 오프체인 데이터베이스 통합 (PostgreSQL)
- [ ] GraphQL API 추가
- [ ] WebSocket으로 실시간 알림
- [ ] Admin Dashboard 개발
- [ ] 크리에이터 대시보드 (수익 분석)

### 블록체인 개선

- [ ] Layer 2 솔루션 통합 (Optimism, Arbitrum)
- [ ] 멀티체인 지원 확대
- [ ] 컨트랙트 업그레이드 패턴 (Proxy 패턴)
- [ ] 가스 최적화

### 보안 강화

- [ ] 멀티시그 지갑
- [ ] Time-lock 메커니즘
- [ ] 감사(Audit) 수행
- [ ] Bug Bounty 프로그램

---

## 📞 연락처

**개발자**: 홍종남  
**소속**: 퓨처센스  
**GitHub**: [프로젝트 링크]  
**Email**: [연락처]

---

## 📄 라이선스

이 프로젝트는 DressDio의 소유이며, 상업적 사용은 허가가 필요합니다.

---

## 🙏 감사의 말

이 프로젝트를 통해 블록체인 기술, 스마트 컨트랙트 개발, MPC 지갑 시스템 등
다양한 최신 기술을 실무에 적용할 수 있었습니다.

특히 이중 네트워크 통합, Factory 패턴 설계, 자동 토큰 스왑 시스템 구현 등
복잡한 문제를 해결하며 많은 것을 배웠습니다.

DressDio 플랫폼이 크리에이터 경제에 기여할 수 있기를 기대합니다.

---

**마지막 업데이트**: 2026년 1월 27일  
**문서 버전**: 1.0.0
