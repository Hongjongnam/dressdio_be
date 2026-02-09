# DressDio 스마트 컨트랙트 문서

> **작성일**: 2026년 1월 27일  
> **Solidity 버전**: 0.8.28  
> **네트워크**: Hyperledger Besu (IBFT 2.0)  
> **Chain ID**: 2741

---

## 📋 목차

1. [개요](#1-개요)
2. [배포 구조](#2-배포-구조)
3. [컨트랙트 아키텍처](#3-컨트랙트-아키텍처)
4. [컨트랙트 상세](#4-컨트랙트-상세)
5. [배포 가이드](#5-배포-가이드)
6. [컨트랙트 간 상호작용](#6-컨트랙트-간-상호작용)

---

## 1. 개요

### 1.1 프로젝트 구조

DressDio 플랫폼은 총 **7개의 스마트 컨트랙트**로 구성되어 있습니다:

| 컨트랙트 | 타입 | 표준 | 역할 |
|---------|------|------|------|
| **DPToken** | ERC-20 | Token | 플랫폼 내 결제 토큰 |
| **CreatorSBT** | ERC-721 | Soulbound Token | 크리에이터 신원 증명 (양도 불가) |
| **PlatformRegistry** | Registry | Ownable | 모든 컨트랙트 주소 관리 |
| **IPNFT** | ERC-721 | NFT | 지적재산권 NFT |
| **IPNFTFactory** | Factory | Ownable | IPNFT 생성 및 관리 |
| **MerchandiseFactory** | ERC-721 | NFT + Factory | 상품 프로젝트 및 NFT 관리 |
| **PersonalNFT** | ERC-721 | NFT | 개인 맞춤형 NFT |

### 1.2 OpenZeppelin 의존성

모든 컨트랙트는 OpenZeppelin 라이브러리 v5.3.0을 기반으로 개발되었습니다:

- `@openzeppelin/contracts/token/ERC721/ERC721.sol`
- `@openzeppelin/contracts/token/ERC20/ERC20.sol`
- `@openzeppelin/contracts/access/Ownable.sol`
- `@openzeppelin/contracts/utils/Strings.sol`

---

## 2. 배포 구조

### 2.1 Hardhat 설정

**파일**: `hardhat.config.js`

```javascript
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,      // 가스 최적화 활성화
        runs: 200,          // 최적화 실행 횟수
      },
      viaIR: true,          // IR 기반 컴파일 (고급 최적화)
    },
  },
  networks: {
    besu: {
      url: "https://besu.dressdio.me",
      chainId: 2741,
      accounts: ["0x08ea430735cdb2b440e20b5bad77354ebdcbba85eeb509774de29c6ee1fc25b0"]
    }
  }
};
```

**최적화 설정 이유**:
- `optimizer.enabled: true` → 가스 비용 절감
- `runs: 200` → 배포 비용과 실행 비용의 균형
- `viaIR: true` → 스택 깊이 오류 방지, 더 효율적인 바이트코드 생성

### 2.2 배포 순서

**파일**: `scripts/deploy.js`

#### 단계별 배포 프로세스

```
1. CreatorSBT 배포
   ↓
2. PlatformRegistry 배포
   ↓
3. IPNFTFactory 배포 (Registry, DPToken 주소 전달)
   ↓
4. IPNFT 주소 획득 (Factory에서 자동 생성)
   ↓
5. MerchandiseFactory 배포 (IPNFT, SBT, DPToken 주소 전달)
   ↓
6. Registry에 모든 컨트랙트 등록
   - setSBTContract()
   - setIPNFTFactory()
   - setMerchandiseFactory()
   ↓
7. 소유권 이전 (모든 컨트랙트 → MPC 관리자 지갑)
   - transferOwnership(PLATFORM_ADMIN_WALLET_ADDRESS)
```

#### 환경 변수 필요 항목

```env
# .env 파일
PLATFORM_ADMIN_WALLET_ADDRESS=0x2C686C46D3622d60CCAbEfb757158c8904312871
DP_TOKEN_ADDRESS=0x...  (사전에 배포된 DP Token 주소)
```

### 2.3 배포 명령어

```bash
# 1. 의존성 설치
npm install

# 2. 컴파일
npx hardhat compile

# 3. Besu 네트워크에 배포
npx hardhat run scripts/deploy.js --network besu

# 4. 배포 결과 확인
# 콘솔에 다음 정보 출력:
# - CreatorSBT 주소
# - PlatformRegistry 주소
# - IPNFTFactory 주소
# - IPNFT 주소
# - MerchandiseFactory 주소
```

### 2.4 배포 후 검증

```bash
# 소유권 확인 스크립트
npx hardhat run scripts/check-ownership.js --network besu

# 예상 출력:
# ✅ CreatorSBT owner: 0x2C686C46...
# ✅ PlatformRegistry owner: 0x2C686C46...
# ✅ IPNFTFactory owner: 0x2C686C46...
# ✅ MerchandiseFactory owner: 0x2C686C46...
```

---

## 3. 컨트랙트 아키텍처

### 3.1 의존성 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                     PlatformRegistry                        │
│          (중앙화된 주소 관리 레지스트리)                      │
│  • sbtContract                                              │
│  • ipnftFactory                                             │
│  • merchandiseFactory                                       │
│  • validIPNFTTokenIds mapping                               │
└────────┬──────────────────────┬──────────────────────┬──────┘
         │                      │                      │
    ┌────▼────────┐       ┌─────▼─────────┐    ┌─────▼──────┐
    │ CreatorSBT  │       │   DPToken     │    │ IPNFTFactory│
    │  (ERC-721)  │       │   (ERC-20)    │    │             │
    │             │       │               │    │   Factory   │
    └─────┬───────┘       └───────┬───────┘    │   Pattern   │
          │                       │            └──────┬───────┘
          │                       │                   │
          │                       │            ┌──────▼───────┐
          │                       │            │    IPNFT     │
          │                       │            │  (ERC-721)   │
          │                       │            └──────┬───────┘
          │                       │                   │
          └───────────┬───────────┴───────────────────┘
                      │
          ┌───────────▼──────────────────────────────┐
          │        MerchandiseFactory                │
          │    (ERC-721 + Factory Pattern)           │
          │                                           │
          │  • 프로젝트 생성 (인플루언서)            │
          │  • 프로젝트 활성화 (브랜드)              │
          │  • 구매 요청/확정/취소                   │
          │  • NFT 민팅 + 수익 자동 분배             │
          └──────────────────────────────────────────┘

          ┌──────────────────────────────────────────┐
          │           PersonalNFT                    │
          │         (ERC-721)                        │
          │                                          │
          │  • 개인 맞춤형 NFT 구매                  │
          │  • 브랜드 + 아티스트 IP 결합             │
          │  • 직접 구매 (인플루언서 없이)           │
          └──────────────────────────────────────────┘
```

### 3.2 데이터 흐름

#### IP NFT 발행 플로우

```
사용자 (Brand/Artist SBT 보유)
  │
  ├─→ IPNFTFactory.createToken()
  │      ↓
  │   1. SBT 검증 (PlatformRegistry.validateCreatorSBT)
  │   2. DP Token 수수료 전송
  │   3. IPNFT.mint() 호출
  │   4. Registry에 토큰 ID 등록
  │      ↓
  └─→ IPNFT 발행 완료 (tokenId 반환)
```

#### Merchandise 구매 플로우

```
인플루언서 (Influencer SBT 보유)
  │
  ├─→ MerchandiseFactory.createMerchandiseProject()
  │      ↓
  │   프로젝트 생성 (isActive: false)
  │      ↓
브랜드 (Brand IP NFT 소유자)
  │
  ├─→ MerchandiseFactory.activateProject()
  │      ↓
  │   프로젝트 활성화 (isActive: true)
  │      ↓
구매자
  │
  ├─→ MerchandiseFactory.requestPurchase()
  │      ↓
  │   DP Token 에스크로 예치
  │      ↓
  ├─→ MerchandiseFactory.confirmPurchase()
  │      ↓
  │   1. Merchandise NFT 발행
  │   2. DP Token 자동 분배:
  │      • 인플루언서: 45%
  │      • 브랜드: 45%
  │      • 플랫폼: 10%
  │      ↓
  └─→ NFT 민팅 완료 + 수익 분배 완료
```

---

## 4. 컨트랙트 상세

### 4.1 DPToken (ERC-20)

**파일**: `contracts/DPToken.sol`

#### 개요
- 플랫폼 내부 결제 토큰
- 관리자만 발행(mint) 및 소각(burn) 가능
- IP NFT 민팅 수수료, Merchandise 구매 등에 사용

#### 주요 함수

```solidity
// 토큰 발행 (관리자 전용)
function mint(address to, uint256 amount) external onlyOwner

// 토큰 소각 (관리자 전용)
function burn(address from, uint256 amount) external onlyOwner
```

#### 특징
- ✅ 심플한 구조로 가스 효율성 극대화
- ✅ Ownable 패턴으로 중앙화된 관리
- ✅ 표준 ERC-20 호환

---

### 4.2 CreatorSBT (Soulbound Token)

**파일**: `contracts/CreatorSBT.sol`

#### 개요
- **Soulbound Token** (양도 불가능한 NFT)
- 크리에이터 타입: `brand`, `artist`, `influencer`
- 플랫폼 내 크리에이터 신원 증명 및 권한 부여

#### 주요 구조체

```solidity
struct SBTInfo {
    uint256 tokenId;
    address owner;
    string creatorType;      // "brand" | "artist" | "influencer"
    string creatorName;
    string description;
    string tokenUri;
    uint256 useCount;        // SBT 사용 횟수 (IP NFT 발행 시마다 증가)
}
```

#### 주요 함수

```solidity
// SBT 발행 (관리자 전용)
function mint(
    address _to,
    string memory _creatorType,
    string memory _creatorName,
    string memory _description,
    string memory _tokenUri
) external onlyOwner

// 특정 주소의 SBT 보유 여부 확인
function hasCreatorSbt(address _address, string memory _type) 
    external view returns (bool)

// SBT 사용 횟수 증가 (IP NFT 발행 시)
function incrementUseCount(uint256 _tokenId) external

// 전체 SBT 목록 조회
function getAllSBTs() external view returns (SBTInfo[] memory)

// 주소별 SBT 조회
function getSBTInfoByAddress(address _address) 
    external view returns (SBTInfo[] memory)
```

#### 전송 차단 메커니즘

```solidity
// transferFrom 오버라이드로 전송 차단
function transferFrom(
    address /* from */,
    address /* to */,
    uint256 /* tokenId */
) public pure override {
    revert("SBT cannot be transferred");
}
```

#### 중복 발행 방지

```solidity
// 지갑 주소 + 크리에이터 타입 조합으로 중복 방지
mapping(address => mapping(string => bool)) public hasSbt;

// mint() 함수에서 검증
require(!hasSbt[_to][_creatorType], "SBT already exists for this address and type");
```

#### 특징
- ✅ 한 주소당 타입별로 1개만 발행 가능
- ✅ 영구적으로 소유자에게 바인딩
- ✅ 사용 횟수 추적으로 크리에이터 활동도 측정

---

### 4.3 PlatformRegistry

**파일**: `contracts/PlatformRegistry.sol`

#### 개요
- 모든 컨트랙트 주소를 중앙에서 관리
- IPNFT 토큰 ID 검증 및 등록
- SBT 검증 로직 제공

#### 상태 변수

```solidity
address public merchandiseFactory;
address public ipnftFactory;
address public sbtContract;

// IPNFT 검증용
mapping(uint256 => bool) public validIPNFTTokenIds;
mapping(address => uint256[]) public creatorIPNFTs;

// 플랫폼 통계
uint256 public totalMerchandiseProjects;
uint256 public totalIPNFTs;
uint256 public totalSBTHolders;
```

#### 주요 함수

```solidity
// 컨트랙트 주소 설정 (관리자 전용)
function setSBTContract(address _sbt) external onlyOwner
function setIPNFTFactory(address _factory) external onlyOwner
function setMerchandiseFactory(address _factory) external onlyOwner

// IPNFT 토큰 ID 등록 (Factory에서 호출)
function registerIPNFTTokenId(
    uint256 tokenId, 
    address owner, 
    string memory creatorType
) external onlyRegisteredContracts

// IPNFT 검증
function isRegisteredIPNFT(uint256 tokenId) external view returns (bool)
function validateBrandIPNFT(uint256 tokenId) external view returns (bool)
function validateArtistIPNFT(uint256 tokenId) external view returns (bool)

// SBT 검증
function validateCreatorSBT(
    address _creator,
    uint256 _sbtId,
    string memory _requiredType
) public view returns (bool)

function hasInfluencerSBT(address creator) external view returns (bool)
function hasBrandSBT(address creator) external view returns (bool)
function hasArtistSBT(address creator) external view returns (bool)

// SBT 사용 횟수 증가
function incrementSBTUseCount(uint256 _sbtId) external onlyRegisteredContracts

// 플랫폼 통계
function getPlatformStats() external view returns (
    uint256 _totalMerchandiseProjects,
    uint256 _totalIPNFTs,
    uint256 _totalSBTHolders
)
```

#### Modifier

```solidity
modifier onlyRegisteredContracts() {
    require(
        msg.sender == merchandiseFactory || msg.sender == ipnftFactory,
        "Not registered contract"
    );
    _;
}
```

#### 특징
- ✅ 중앙화된 주소 관리로 업그레이드 용이
- ✅ 등록된 컨트랙트만 특정 함수 호출 가능
- ✅ IPNFT 유효성 검증 기능 제공

---

### 4.4 IPNFT (ERC-721)

**파일**: `contracts/IPNFT.sol`

#### 개요
- 지적재산권을 나타내는 NFT
- Factory 패턴으로 생성됨
- 브랜드 또는 아티스트만 발행 가능

#### 주요 구조체

```solidity
struct TokenInfo {
    address owner;          // 현재 소유자
    address creator;        // 원작자 (변경 불가)
    uint256 creatorSBTId;   // 크리에이터 SBT ID
    string ipfsImage;       // IPFS 이미지 URI
    string name;
    string description;
    uint256 price;          // 판매 가격
    uint256 supplyPrice;    // 공급 가격
    uint256 createdAt;      // 생성 시간
}
```

#### 주요 함수

```solidity
// NFT 발행 (Factory만 호출 가능)
function mint(
    address to,
    address creator,
    uint256 creatorSBTId,
    string memory ipfsImage,
    string memory name_,
    string memory description,
    uint256 price,
    uint256 supplyPrice,
    string memory tokenURI_
) external onlyFactory returns (uint256)

// 가격 업데이트 (원작자만 가능)
function updatePrices(
    uint256 tokenId,
    uint256 newPrice,
    uint256 newSupplyPrice
) external

// 토큰 정보 조회
function getTokenInfo(uint256 tokenId) 
    external view returns (TokenInfo memory)

// 크리에이터별 토큰 목록
function getCreatorTokens(address creator) 
    public view returns (uint256[] memory)
```

#### Modifier

```solidity
modifier onlyFactory() {
    require(msg.sender == factory, "Only factory can mint");
    _;
}
```

#### 특징
- ✅ 원작자(creator) 정보 영구 보존
- ✅ 소유권은 이전 가능하지만 원작자는 불변
- ✅ IPFS 기반 탈중앙화 이미지 저장

---

### 4.5 IPNFTFactory

**파일**: `contracts/IPNFTFactory.sol`

#### 개요
- IPNFT 컨트랙트를 Factory 패턴으로 생성 및 관리
- IP NFT 발행 시 SBT 검증 및 수수료 징수

#### 상태 변수

```solidity
IPNFT public ipnft;                      // 생성된 IPNFT 컨트랙트
PlatformRegistry public platformRegistry;
IERC20 public dpToken;
uint256 public mintingFee = 1e18;       // 기본 수수료: 1 DP
```

#### 주요 함수

```solidity
// IP NFT 발행
function createToken(
    string memory ipfsImage,
    string memory name_,
    string memory description,
    uint256 price,
    uint256 supplyPrice,
    uint256 creatorSBTId,
    string memory tokenURI_
) external returns (uint256)

// 민팅 수수료 설정 (관리자 전용)
function setMintingFee(uint256 newFee) external onlyOwner

// 수수료 조회
function getMintingFee() external view returns (uint256)

// IPNFT 주소 조회
function getIPNFTAddress() external view returns (address)

// DP Token 인출 (관리자 전용)
function withdrawDPTokens(address to) external onlyOwner
```

#### createToken 로직 흐름

```solidity
1. SBT 검증 (brand 또는 artist)
   - platformRegistry.validateCreatorSBT()

2. DP Token 수수료 전송
   - dpToken.transferFrom(msg.sender, address(this), mintingFee)

3. SBT 사용 횟수 증가
   - platformRegistry.incrementSBTUseCount(creatorSBTId)

4. IPNFT 발행
   - ipnft.mint(...)

5. Registry에 토큰 등록
   - platformRegistry.registerIPNFTTokenId(tokenId, msg.sender, creatorType)

6. 이벤트 발생 및 토큰 ID 반환
```

#### 특징
- ✅ Factory 패턴으로 하나의 IPNFT 컨트랙트 관리
- ✅ SBT 검증 로직 통합
- ✅ 동적 수수료 설정 가능

---

### 4.6 MerchandiseFactory (ERC-721 + Factory)

**파일**: `contracts/MerchandiseFactory.sol`

#### 개요
- 인플루언서가 브랜드 및 아티스트 IP를 활용한 상품 프로젝트 생성
- 브랜드가 프로젝트 활성화
- 구매자가 구매 요청 → 확정 → NFT 민팅 + 수익 자동 분배

#### 주요 구조체

```solidity
struct ProjectInfo {
    address influencer;
    string projectName;
    string productDescription;
    uint256 brandIPNFTTokenId;
    uint256[] artistIPNFTTokenIds;
    uint256 totalSupply;           // 총 수량
    uint256 salePrice;             // 판매 가격
    bool isActive;                 // 활성화 여부
    uint256 createdAt;
    string projectImageURI;
    uint256 mintedCount;           // 민팅된 수량
    uint256 totalArtistContribution;
    mapping(address => uint256) artistContributions;
}

struct PurchaseRequest {
    address buyer;
    uint256 amount;                // DP Token 예치 금액
    uint256 timestamp;
    bool isConfirmed;
    bool isCancelled;
    uint256 tokenId;               // 발행된 NFT 토큰 ID
}
```

#### 주요 함수

**프로젝트 생성 (인플루언서)**
```solidity
function createMerchandiseProject(
    string memory projectName,
    string memory productDescription,
    uint256 brandIPNFTTokenId,
    uint256[] memory artistIPNFTTokenIds,
    uint256 totalSupply,
    uint256 salePrice,
    string memory projectImageURI
) external onlyInfluencer returns (uint256 projectId)
```

**프로젝트 활성화 (브랜드)**
```solidity
function activateProject(uint256 projectId, bool _isActive) 
    external 
    onlyBrandOwnerOfProject(projectId)
```

**구매 요청**
```solidity
function requestPurchase(uint256 projectId) 
    external 
    projectExists(projectId) 
    returns (uint256 requestId)
```

**구매 확정**
```solidity
function confirmPurchase(
    uint256 projectId,
    uint256 requestId,
    string memory tokenURI
) external 
  projectExists(projectId)
  validPurchaseRequest(projectId, requestId)
```

**구매 취소**
```solidity
function cancelPurchase(uint256 projectId, uint256 requestId)
    external
    projectExists(projectId)
    validPurchaseRequest(projectId, requestId)
```

#### 수익 분배 로직

```solidity
// confirmPurchase() 내부 로직
총 판매 가격 = salePrice

1. 플랫폼 수수료 (1%)
   platformFee = totalPrice * platformFeePercentage / 10000
   → 플랫폼 수취자에게 전송

2. 로열티 계산
   royaltiesTotal = brandPrice + supplyPriceTotal
   
   - brandPrice = brandInfo.price
   - supplyPriceTotal = 모든 아티스트 supplyPrice 합계

3. 순수익 분배 (로열티 제외 후)
   netProfit = totalPrice - platformFee - royaltiesTotal
   
   - 인플루언서: netProfit * 50%
   - 브랜드: netProfit * 50%

4. 아티스트 로열티 분배
   각 아티스트: supplyPrice (비율에 따라 분배)
```

#### Modifier

```solidity
modifier onlyInfluencer() {
    require(
        sbtContract.hasCreatorSbt(msg.sender, "influencer"),
        "Only influencers can create merchandise projects"
    );
    _;
}

modifier onlyBrandOwnerOfProject(uint256 projectId) {
    address brandOwner = ipnftContract.ownerOf(
        projects[projectId].brandIPNFTTokenId
    );
    require(brandOwner == msg.sender, "Only the brand owner can perform this action");
    _;
}
```

#### 특징
- ✅ 2단계 구매 시스템 (Request → Confirm)
- ✅ 에스크로 방식으로 DP Token 안전 보관
- ✅ 스마트 컨트랙트 기반 자동 수익 분배
- ✅ 인플루언서-브랜드-아티스트 3자 협업 구조

---

### 4.7 PersonalNFT (ERC-721)

**파일**: `contracts/PersonalNFT.sol`

#### 개요
- 사용자가 직접 브랜드 IP와 아티스트 IP를 선택하여 커스텀 NFT 생성
- 인플루언서 없이 직접 구매
- Merchandise와 유사한 구매 플로우

#### 주요 구조체

```solidity
struct PurchaseRequest {
    address buyer;
    uint256 brandTokenId;
    uint256[] artistTokenIds;
    uint256 totalAmount;         // 총 결제 금액
    uint256 timestamp;
    bool isConfirmed;
    bool isCancelled;
    uint256 nftTokenId;          // 발행된 NFT 토큰 ID
}
```

#### 주요 함수

**구매 요청**
```solidity
function requestPurchase(
    uint256 brandTokenId,
    uint256[] memory artistTokenIds
) external returns (uint256 requestId)
```

**구매 확정**
```solidity
function confirmPurchase(
    uint256 requestId,
    string memory tokenURI
) external
```

**구매 취소**
```solidity
function cancelPurchase(uint256 requestId) external
```

**가격 미리 계산**
```solidity
function calculatePrice(
    uint256 brandTokenId,
    uint256[] memory artistTokenIds
) public view returns (
    uint256 totalPrice,
    uint256 platformFee,
    uint256 netAmount
)
```

**플랫폼 수수료 설정**
```solidity
function setPlatformFee(uint256 newFeePercentage) external onlyOwner
function getPlatformFee() external view returns (uint256)
```

#### 수익 분배 로직

```solidity
// confirmPurchase() 내부
총 금액 = brandPrice + 모든 artistPrice 합계

1. 플랫폼 수수료 (1%)
   platformFee = totalAmount * platformFeePercentage / 10000

2. 브랜드 지급
   brandOwner에게 brandPrice 전송

3. 아티스트 지급
   각 아티스트에게 artistPrice 전송

4. NFT 발행
   _mint(buyer, nftTokenId)
```

#### 특징
- ✅ 사용자 맞춤형 NFT
- ✅ 최대 10명의 아티스트 IP 결합 가능
- ✅ 투명한 가격 계산 (미리보기 기능)
- ✅ 플랫폼 수수료만 부과 (인플루언서 없음)

---

## 5. 배포 가이드

### 5.1 사전 준비

#### 1. 환경 변수 설정

```bash
# .env 파일 생성
cat > .env << EOF
PLATFORM_ADMIN_WALLET_ADDRESS=0x2C686C46D3622d60CCAbEfb757158c8904312871
DP_TOKEN_ADDRESS=0x...  # DPToken 주소 (사전 배포 필요)
EOF
```

#### 2. DP Token 배포 (별도)

```bash
# scripts/deploy-dptoken.js (별도 스크립트)
npx hardhat run scripts/deploy-dptoken.js --network besu

# 배포된 주소를 .env의 DP_TOKEN_ADDRESS에 추가
```

### 5.2 전체 배포 실행

```bash
# 1. 컴파일
npx hardhat compile

# 2. 배포
npx hardhat run scripts/deploy.js --network besu

# 3. 배포 로그 확인
# 예상 출력:
# Deploying contracts with: 0x...
# ABC Wallet Admin Address: 0x2C686C46D3622d60CCAbEfb757158c8904312871
# DP_TOKEN_ADDRESS: 0x...
# SBT deployed to: 0x...
# Registry deployed to: 0x...
# IPNFTFactory deployed to: 0x...
# IPNFT deployed to: 0x...
# MerchandiseFactory deployed to: 0x...
# ✅ All contracts registered in PlatformRegistry.
# ✅ PlatformRegistry ownership transfer confirmed!
# ✅ SBT ownership transfer confirmed!
# ✅ MerchandiseFactory ownership transfer confirmed!
# ✅ IPNFTFactory ownership transfer confirmed!
```

### 5.3 배포 후 설정

#### 1. 컨트랙트 주소를 .env에 추가

```env
CREATOR_SBT_ADDRESS=0x...
PLATFORM_REGISTRY_ADDRESS=0x...
IPNFT_FACTORY_ADDRESS=0x...
IPNFT_ADDRESS=0x...
MERCHANDISE_FACTORY_ADDRESS=0x...
PERSONAL_NFT_ADDRESS=0x...
```

#### 2. Backend 설정 업데이트

`src/config/web3.js`에서 컨트랙트 주소 확인

```javascript
const CREATOR_SBT_ADDRESS = process.env.CREATOR_SBT_ADDRESS;
const PLATFORM_REGISTRY_ADDRESS = process.env.PLATFORM_REGISTRY_ADDRESS;
// ... 기타 주소
```

#### 3. ABI 파일 복사

```bash
# Hardhat 컴파일 후 ABI를 src/abi로 복사
node copy-abi.js

# 또는 수동 복사
cp artifacts/contracts/CreatorSBT.sol/CreatorSBT.json src/abi/
cp artifacts/contracts/IPNFT.sol/IPNFT.json src/abi/
# ...
```

### 5.4 배포 검증

```bash
# 1. 소유권 확인
npx hardhat run scripts/check-ownership.js --network besu

# 2. Registry 등록 확인
npx hardhat console --network besu

> const Registry = await ethers.getContractFactory("PlatformRegistry")
> const registry = Registry.attach("0x...")
> await registry.getSBTContract()
> await registry.getIPNFTFactory()
> await registry.getMerchandiseFactory()
```

---

## 6. 컨트랙트 간 상호작용

### 6.1 IP NFT 발행 플로우

```
사용자 (Frontend)
  │
  ├─→ 1. SBT 보유 확인
  │      CreatorSBT.hasCreatorSbt(address, "brand")
  │
  ├─→ 2. DP Token Approve
  │      DPToken.approve(IPNFTFactory, mintingFee)
  │
  ├─→ 3. IP NFT 발행 요청
  │      IPNFTFactory.createToken(...)
  │         │
  │         ├─→ PlatformRegistry.validateCreatorSBT()
  │         ├─→ DPToken.transferFrom()
  │         ├─→ PlatformRegistry.incrementSBTUseCount()
  │         ├─→ IPNFT.mint()
  │         └─→ PlatformRegistry.registerIPNFTTokenId()
  │
  └─→ 4. 발행 완료 (tokenId 반환)
```

### 6.2 Merchandise 프로젝트 생성 및 구매

```
인플루언서
  │
  ├─→ 1. Influencer SBT 확인
  │      CreatorSBT.hasCreatorSbt(address, "influencer")
  │
  ├─→ 2. 프로젝트 생성
  │      MerchandiseFactory.createMerchandiseProject(...)
  │         │
  │         └─→ 프로젝트 저장 (isActive: false)
  │
브랜드
  │
  ├─→ 3. 브랜드 IPNFT 소유 확인
  │      IPNFT.ownerOf(brandIPNFTTokenId)
  │
  ├─→ 4. 프로젝트 활성화
  │      MerchandiseFactory.activateProject(projectId, true)
  │
구매자
  │
  ├─→ 5. DP Token Approve
  │      DPToken.approve(MerchandiseFactory, salePrice)
  │
  ├─→ 6. 구매 요청
  │      MerchandiseFactory.requestPurchase(projectId)
  │         │
  │         └─→ DPToken.transferFrom(buyer, contract, amount)
  │
  ├─→ 7. 구매 확정
  │      MerchandiseFactory.confirmPurchase(projectId, requestId, tokenURI)
  │         │
  │         ├─→ _mint(buyer, tokenId) [ERC-721]
  │         ├─→ DPToken.transfer(influencer, influencerShare)
  │         ├─→ DPToken.transfer(brand, brandShare)
  │         ├─→ DPToken.transfer(artists, artistShares)
  │         └─→ DPToken.transfer(platform, platformFee)
  │
  └─→ 8. NFT 발행 완료 + 수익 분배 완료
```

### 6.3 Personal NFT 구매

```
사용자
  │
  ├─→ 1. 브랜드 + 아티스트 IP 선택
  │
  ├─→ 2. 가격 미리 계산
  │      PersonalNFT.calculatePrice(brandId, artistIds[])
  │
  ├─→ 3. DP Token Approve
  │      DPToken.approve(PersonalNFT, totalAmount)
  │
  ├─→ 4. 구매 요청
  │      PersonalNFT.requestPurchase(brandId, artistIds[])
  │         │
  │         └─→ DPToken.transferFrom(buyer, contract, totalAmount)
  │
  ├─→ 5. 구매 확정
  │      PersonalNFT.confirmPurchase(requestId, tokenURI)
  │         │
  │         ├─→ _mint(buyer, nftTokenId)
  │         ├─→ DPToken.transfer(brandOwner, brandPrice)
  │         ├─→ DPToken.transfer(artistOwners, artistPrices)
  │         └─→ DPToken.transfer(platform, platformFee)
  │
  └─→ 6. Personal NFT 발행 완료
```

### 6.4 SBT 발행 및 검증

```
관리자
  │
  ├─→ 1. SBT 발행 (MPC 패턴)
  │      CreatorSBT.mint(
  │          to,
  │          creatorType,  // "brand" | "artist" | "influencer"
  │          creatorName,
  │          description,
  │          tokenURI
  │      )
  │         │
  │         ├─→ _safeMint(to, tokenId)
  │         └─→ hasSbt[to][creatorType] = true
  │
  └─→ 2. 발행 완료

사용자 (IP NFT 발행 시)
  │
  ├─→ 3. SBT 검증
  │      IPNFTFactory.createToken(...)
  │         │
  │         └─→ PlatformRegistry.validateCreatorSBT(
  │                 creator,
  │                 sbtId,
  │                 "brand" or "artist"
  │             )
  │                │
  │                ├─→ CreatorSBT.ownerOf(sbtId) == creator?
  │                └─→ CreatorSBT.getCreatorType(sbtId) == requiredType?
  │
  └─→ 4. 검증 통과 → IP NFT 발행
```

---

## 7. 가스 최적화 및 보안

### 7.1 가스 최적화 기법

#### 1. Optimizer 설정
```javascript
// hardhat.config.js
optimizer: {
    enabled: true,
    runs: 200,  // 배포 비용과 실행 비용의 균형
}
```

#### 2. Mapping 활용
- Array 대신 Mapping 사용으로 조회 비용 절감
- 예: `mapping(uint256 => bool) public validIPNFTTokenIds`

#### 3. 구조체 최적화
- 구조체 필드 순서를 데이터 타입 크기 순으로 배치
- Storage Packing으로 가스 절감

#### 4. View/Pure 함수 활용
- 블록체인 상태를 변경하지 않는 함수는 `view` 또는 `pure` 선언
- 가스 비용 없이 조회 가능

### 7.2 보안 고려사항

#### 1. Ownable 패턴
- 모든 관리 기능은 `onlyOwner` modifier로 보호
- 소유권 이전 기능 제공 (`transferOwnership`)

#### 2. Reentrancy 방지
- Checks-Effects-Interactions 패턴 준수
- 외부 호출 전에 상태 변경 완료

#### 3. Integer Overflow/Underflow
- Solidity 0.8.x 버전 사용으로 자동 방지
- SafeMath 불필요

#### 4. Access Control
- Modifier로 권한 검증 (`onlyInfluencer`, `onlyBrandOwner` 등)
- Registry 패턴으로 등록된 컨트랙트만 호출 가능

#### 5. Input Validation
- `require` 문으로 모든 입력값 검증
- 배열 길이 제한 (예: 아티스트 최대 10명)

---

## 8. 업그레이드 전략

### 8.1 현재 구조의 한계

- 현재는 **Non-Upgradeable** 구조
- 컨트랙트 로직 변경 시 새로 배포 필요

### 8.2 향후 개선 방안

#### 1. Proxy 패턴 도입
```solidity
// TransparentUpgradeableProxy 사용
// 로직 컨트랙트만 교체 가능
```

#### 2. Registry 패턴 활용
- 현재 PlatformRegistry로 주소 관리
- 새 컨트랙트 배포 후 Registry만 업데이트

#### 3. 버전 관리
```solidity
uint256 public constant VERSION = 1;
```

---

## 9. 테스트 및 배포 체크리스트

### 9.1 배포 전 체크리스트

- [ ] 환경 변수 설정 완료 (.env)
- [ ] DPToken 사전 배포 완료
- [ ] Hardhat 설정 확인
- [ ] Solidity 버전 확인 (0.8.28)
- [ ] OpenZeppelin 라이브러리 설치
- [ ] 컴파일 에러 없음

### 9.2 배포 후 체크리스트

- [ ] 모든 컨트랙트 배포 성공
- [ ] Registry에 모든 주소 등록 확인
- [ ] 소유권 이전 완료 (MPC 관리자 지갑)
- [ ] ABI 파일 복사 완료
- [ ] Backend 환경 변수 업데이트
- [ ] 테스트 트랜잭션 실행 (SBT 발행, IP NFT 발행 등)

### 9.3 기능 테스트

- [ ] SBT 발행 테스트
- [ ] IP NFT 발행 테스트
- [ ] Merchandise 프로젝트 생성 테스트
- [ ] Merchandise 구매 플로우 테스트
- [ ] Personal NFT 구매 테스트
- [ ] 수익 분배 확인

---

## 10. 문제 해결 가이드

### 10.1 자주 발생하는 에러

#### 1. "Only factory can mint"
- **원인**: IPNFT를 Factory가 아닌 다른 주소에서 직접 호출
- **해결**: IPNFTFactory를 통해서만 발행

#### 2. "Invalid or insufficient SBT"
- **원인**: SBT를 보유하지 않았거나 잘못된 타입
- **해결**: CreatorSBT.mint()로 적절한 타입의 SBT 발행

#### 3. "DP payment failed"
- **원인**: DP Token approve가 안 되었거나 잔액 부족
- **해결**: DPToken.approve() 먼저 호출

#### 4. "Only the brand owner can perform this action"
- **원인**: 브랜드 IPNFT의 소유자가 아님
- **해결**: IPNFT.ownerOf()로 소유권 확인

#### 5. "Project does not exist"
- **원인**: 존재하지 않는 projectId
- **해결**: 유효한 projectId 사용

### 10.2 디버깅 방법

#### 1. Hardhat Console 사용
```bash
npx hardhat console --network besu

> const SBT = await ethers.getContractFactory("CreatorSBT")
> const sbt = SBT.attach("0x...")
> await sbt.totalSupply()
> await sbt.ownerOf(0)
```

#### 2. 이벤트 로그 확인
```javascript
// Backend에서 이벤트 조회
const filter = sbtContract.filters.TokenCreated();
const events = await sbtContract.queryFilter(filter);
console.log(events);
```

#### 3. 트랜잭션 Receipt 확인
```javascript
const tx = await contract.someFunction();
const receipt = await tx.wait();
console.log("Gas used:", receipt.gasUsed.toString());
console.log("Events:", receipt.events);
```

---

## 11. 추가 리소스

### 11.1 관련 문서

- **API 문서**: `DressDio_API_Documentation.md`
- **인수인계서**: `HANDOVER.md`
- **배포 스크립트**: `scripts/deploy.js`
- **Hardhat 설정**: `hardhat.config.js`

### 11.2 외부 참조

- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/5.x/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [Hyperledger Besu](https://besu.hyperledger.org/)

---

## 12. 마무리

이 문서는 DressDio 플랫폼의 모든 스마트 컨트랙트를 상세히 설명합니다. 
배포부터 운영까지 필요한 모든 정보를 포함하고 있으니, 참고하여 안전하게 플랫폼을 운영하시기 바랍니다.

**작성자**: 홍종남 (퓨처센스)  
**최종 업데이트**: 2026년 1월 27일  
**문서 버전**: 1.0.0
