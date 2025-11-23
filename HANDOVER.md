# DressDio 플랫폼 인수인계서

> **작성일**: 2025년  
> **기술 스택**: Node.js, Express.js, Web3.js, Hardhat, ABC Wallet WaaS API

---

## 📋 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [시스템 아키텍처](#2-시스템-아키텍처)
3. [API 문서](#3-api-문서)
4. [컨트랙트 배포 구조](#4-컨트랙트-배포-구조)
5. [1:N 미러링 구조](#5-1n-미러링-구조)
6. [환경 설정](#6-환경-설정)
7. [주요 기능 상세](#7-주요-기능-상세)
8. [트러블슈팅 가이드](#8-트러블슈팅-가이드)

---

## 1. 프로젝트 개요

### 1.1 프로젝트 목적

DressDio는 블록체인 기반의 패션 크리에이터 플랫폼으로, 다음과 같은 기능을 제공합니다:

- **SBT (Soulbound Token)**: 크리에이터 인증 및 신원 증명
- **IP NFT**: 지적재산권 NFT 발행 및 관리
- **Merchandise NFT**: 상품 프로젝트 생성 및 구매 시스템
- **토큰 전송**: DP Token (Besu) 및 Dress Token (Polygon) 전송
- **1:5 미러링 스왑**: Dress Token → DP Token 자동 교환

### 1.2 기술 스택

- **Backend**: Node.js, Express.js
- **Blockchain**: Web3.js, Hardhat
- **Networks**:
  - Besu (Private Network, Chain ID: 2741)
  - Polygon (Mainnet, Chain ID: 137)
- **Wallet**: ABC Wallet WaaS API (MPC 패턴)
- **Storage**: IPFS (Pinata)
- **Database**: Mysql (사용자 정보, NFT 메타데이터) / 최초 유저정보 저장하려했으나, 현재는 사용하지 않음. 모든 데이터는 onchain 기반 데이터 조회

### 1.3 주요 특징

- **MPC (Multi-Party Computation) 패턴**: 개인키를 서버에 저장하지 않고 ABC Wallet WaaS API를 통해 안전하게 트랜잭션 서명
- **이중 네트워크**: Besu (프라이빗)와 Polygon (퍼블릭) 네트워크 동시 지원
- **자동 스왑 시스템**: Polygon의 Dress Token을 플랫폼 지갑으로 전송 시 자동으로 Besu의 DP Token으로 5배 교환

---

## 2. 시스템 아키텍처

### 2.1 전체 구조

```
┌─────────────────┐
│   Frontend      │
│  (HTML/JS)      │
└────────┬────────┘
         │
         │ HTTP/HTTPS
         │
┌────────▼─────────────────────────────────────┐
│         Express.js Backend Server            │
│  ┌─────────────────────────────────────────┐  │
│  │  Auth Controller                       │  │
│  │  NFT Controllers (SBT, IP, Merchandise)│  │
│  │  Platform Controller                   │  │
│  │  Utils Controller                      │  │
│  └─────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────┐  │
│  │  Services Layer                        │  │
│  │  - blockchain.js (트랜잭션 서명/전송)  │  │
│  │  - blockchainMPC.js (MPC 패턴)        │  │
│  │  - wallet.js (ABC Wallet 연동)         │  │
│  │  - upload.js (IPFS 업로드)             │  │
│  └─────────────────────────────────────────┘  │
└────────┬──────────────────────────────────────┘
         │
    ┌────┴────┬──────────────┬──────────────┐
    │         │              │              │
┌───▼───┐ ┌──▼──────┐ ┌─────▼──────┐ ┌────▼─────┐
│ Besu  │ │ Polygon │ │ ABC Wallet │ │  IPFS   │
│Network│ │ Network │ │   WaaS API │ │ (Pinata)│
└───────┘ └─────────┘ └────────────┘ └─────────┘
```

### 2.2 MPC 패턴 흐름

```
1. 사용자 요청 (devicePassword + storedWalletData)
   ↓
2. Backend: ABC Wallet WaaS API 호출
   - 보안 채널 생성
   - 트랜잭션 해시 서명 요청
   ↓
3. ABC Wallet: 서명 반환 (r, s, v)
   ↓
4. Backend: 서명된 트랜잭션 RLP 인코딩
   ↓
5. Backend: 블록체인 네트워크로 전송
   ↓
6. 트랜잭션 완료 (Receipt 반환)
```

### 2.3 네트워크 구조

#### Besu (프라이빗 네트워크)

- **Chain ID**: 2741
- **RPC URL**: `https://besu.dressdio.me`
- **Gas Price**: 0 (프라이빗 네트워크)
- **트랜잭션 타입**: Legacy (EIP-155 미적용)
- **용도**:
  - DP Token 전송
  - SBT 민팅
  - IP NFT 민팅
  - Merchandise NFT 민팅

#### Polygon (퍼블릭 네트워크)

- **Chain ID**: 137
- **RPC URL**: `https://polygon-rpc.com` (또는 다른 공개 RPC)
- **Gas Price**: EIP-1559 (maxFeePerGas, maxPriorityFeePerGas)
- **트랜잭션 타입**: EIP-1559
- **용도**:
  - Dress Token 전송
  - 1:5 미러링 스왑 (Dress → DP)

---

## 3. API 문서

### 3.1 Auth APIs (인증)

#### 1. 이메일 확인

```
GET /api/auth/:email/verify-email
```

이메일 주소의 유효성을 확인합니다.

#### 2. 인증 코드 발송

```
GET /api/auth/:email/send-code?lang=en&template=register
```

이메일 인증 코드를 발송합니다.

#### 3. 인증 코드 확인

```
POST /api/auth/:email/verify-code
Body: { "code": "123456" }
```

발송된 인증 코드를 확인합니다.

#### 4. 회원가입

```
POST /api/auth/register
Body: {
  "email": "user@example.com",
  "password": "password123",
  "code": "123456",
  "overage": true,
  "agree": true,
  "collect": true,
  "thirdParty": true,
  "advertise": true
}
```

새로운 사용자를 등록합니다.

#### 5. 로그인

```
POST /api/auth/login
Body: {
  "email": "user@example.com",
  "password": "password123",
  "devicePassword": "device123"
}
```

사용자 로그인 및 JWT 토큰 발급. `devicePassword`는 MPC 지갑 생성/복구에 사용됩니다.

#### 6. 토큰 갱신

```
POST /api/auth/refresh-token
Body: { "refreshToken": "..." }
```

액세스 토큰을 갱신합니다.

#### 7. 비밀번호 재설정

```
POST /api/auth/reset-password
Body: {
  "email": "user@example.com",
  "password": "newpassword123",
  "code": "123456"
}
```

#### 8. 계정 정보 조회

```
GET /api/auth/account
Headers: Authorization: Bearer {accessToken}
```

현재 로그인한 사용자의 계정 정보를 조회합니다.

#### 9. 잔액 조회

```
GET /api/auth/balance
Headers: Authorization: Bearer {accessToken}
```

사용자의 DP Token 잔액을 조회합니다.

#### 10. 소셜 로그인 URL 조회

```
GET /api/auth/social/login-url?provider=google&callbackUrl=...
```

소셜 로그인 URL을 생성합니다.

#### 11. 소셜 로그인 완료

```
POST /api/auth/social/finalize
Body: { "id": "social_login_id" }
```

#### 12. 소셜 회원가입

```
POST /api/auth/social/register
Body: {
  "email": "user@example.com",
  "code": "123456",
  "provider": "google",
  "overage": true,
  "agree": true,
  "collect": true,
  "thirdParty": true,
  "advertise": true
}
```

#### 13. 소셜 로그인 전체 플로우

```
POST /api/auth/social/login-full
Body: {
  "provider": "google",
  "callbackUrl": "https://example.com/callback"
}
```

#### 14. MPC 지갑 생성/복구

```
POST /api/auth/mpc/wallet/create-or-recover
Headers: Authorization: Bearer {accessToken}
Body: {
  "devicePassword": "device123",
  "email": "user@example.com"
}
```

**중요**: 이 API는 ABC Wallet WaaS API를 통해 MPC 지갑을 생성하거나 복구합니다. 반환된 `storedWalletData`는 프론트엔드의 `localStorage`에 저장되어 이후 트랜잭션에 사용됩니다.

#### 15. 비밀번호 변경

```
POST /api/auth/change-password
Headers: Authorization: Bearer {accessToken}
Body: {
  "oldpassword": "oldpassword123",
  "newpassword": "newpassword123"
}
```

#### 16. MPC 지갑 데이터 검증

```
POST /api/auth/mpc/wallet/validate
Headers: Authorization: Bearer {accessToken}
```

#### 17. MPC 지갑 데이터 삭제

```
POST /api/auth/mpc/wallet/clear
Headers: Authorization: Bearer {accessToken}
```

#### 18. 소셜 로그인 완전 플로우

```
POST /api/auth/social/complete-flow
```

---

### 3.2 SBT APIs (Soulbound Token)

SBT는 크리에이터의 신원을 증명하는 영구적이고 양도 불가능한 토큰입니다.

#### 1. 전체 SBT 목록 조회

```
GET /api/nft/sbt/list
```

모든 SBT 토큰 목록을 조회합니다.

#### 2. SBT 정보 조회

```
GET /api/nft/sbt/info/:sbtId
```

특정 SBT 토큰의 상세 정보를 조회합니다.

#### 3. 관리자 잔액 조회

```
GET /api/nft/sbt/admin/balance
```

관리자 지갑의 ETH 잔액을 조회합니다.

#### 4. SBT 발행

```
POST /api/nft/sbt/mint
Headers: Authorization: Bearer {accessToken}
Body: {
  "devicePassword": "device123",
  "storedWalletData": {
    "uid": "a5a9b9a4-54be-4692-8046-4855ecd6d0f0",
    "wid": 805,
    "sid": "0x58D7E7BdE42764199FCd99FDa6866bBccd773feF",
    "pvencstr": "UBxpgNm4ZDFNLxXv7fU2Tu4gTTaWZZWOEtX8G8sERvYAlFN5C",
    "encryptDevicePassword": "JjTdTKiAa0rWVkEGzAehxFa0cEr3EeyewFyJ1hsmu8E="
  },
  "creatorWalletAddress": "0x1234...",
  "creatorType": "brand",  // "brand", "creator", "designer"
  "creatorName": "Test Brand",
  "description": "Test SBT for Brand"
}
```

**설명**:

- `creatorType`은 `brand`, `creator`, `designer` 중 하나입니다.
- MPC 패턴을 사용하여 트랜잭션을 서명하고 전송합니다.
- Besu 네트워크에서 실행됩니다.

#### 5. SBT 소유권 이전

```
POST /api/nft/sbt/transfer-ownership
Headers: Authorization: Bearer {accessToken}
Body: {
  "newOwner": "0x...",
  "devicePassword": "device123",
  "storedWalletData": { ... }
}
```

---

### 3.3 IP NFT APIs

IP NFT는 지적재산권을 나타내는 NFT입니다.

#### 1. IP NFT 발행

```
POST /api/nft/ip/mint
Headers: Authorization: Bearer {accessToken}
Body: {
  "devicePassword": "device123",
  "storedWalletData": { ... },
  "ipfsImage": "ipfs://Qm...",
  "name": "My IP NFT",
  "description": "Description of the IP NFT",
  "price": "100",
  "supplyPrice": "50",
  "creatorType": "brand"
}
```

**설명**:

- IP NFT를 발행합니다.
- `ipfsImage`는 IPFS URI 형식입니다.
- `price`는 판매 가격, `supplyPrice`는 공급 가격입니다.
- MPC 패턴을 사용하여 트랜잭션을 서명합니다.

#### 2. 전체 IP NFT 목록 조회

```
GET /api/nft/ip/list
```

#### 3. 내 IP NFT 목록 조회

```
GET /api/nft/ip/my
Headers: Authorization: Bearer {accessToken}
```

#### 4. IP NFT 정보 조회

```
GET /api/nft/ip/info/:tokenId
```

#### 5. 민팅 수수료 조회

```
GET /api/nft/ip/minting-fee
```

#### 6. 민팅 수수료 설정

```
POST /api/nft/ip/set-minting-fee
Headers: Authorization: Bearer {accessToken}
Body: {
  "devicePassword": "device123",
  "storedWalletData": { ... },
  "newFee": "10"
}
```

**설명**: IP NFT 팩토리 소유자만 수수료를 변경할 수 있습니다.

#### 7. 이미지 업로드

```
POST /api/nft/ip/upload-image
Headers: Authorization: Bearer {accessToken}
Content-Type: multipart/form-data
Body: image (file)
```

**설명**: 이미지를 IPFS에 업로드하고 URI를 반환합니다.

---

### 3.4 Merchandise APIs (상품)

Merchandise NFT는 인플루언서가 생성한 상품 프로젝트를 나타내는 NFT입니다.

#### 1. 프로젝트 생성

```
POST /api/nft/merchandise/create
Headers: Authorization: Bearer {accessToken}
Body: {
  "projectName": "My Merchandise Project",
  "description": "Project description",
  "quantity": 100,
  "salePrice": "50",
  "ipnftTokenIds": "0,1,2",
  "devicePassword": "device123",
  "storedWalletData": { ... },
  "projectImageUrl": "https://example.com/image.jpg"
}
```

**설명**:

- 인플루언서가 상품 프로젝트를 생성합니다.
- `ipnftTokenIds`는 콤마로 구분된 IP NFT 토큰 ID 목록입니다.
- 프로젝트는 생성 후 브랜드의 활성화가 필요합니다.

#### 2. 내 프로젝트 목록 조회

```
GET /api/nft/merchandise/my
Headers: Authorization: Bearer {accessToken}
```

#### 3. 전체 프로젝트 목록 조회

```
GET /api/nft/merchandise/list
```

#### 4. 구매 요청

```
POST /api/nft/merchandise/request-purchase
Headers: Authorization: Bearer {accessToken}
Body: {
  "projectId": 0,
  "quantity": 1,
  "devicePassword": "device123",
  "storedWalletData": { ... }
}
```

**설명**:

- 구매자가 상품 구매를 요청합니다.
- DP Token을 승인(approve)하고 전송합니다.
- 구매 요청은 구매자가 직접 확정해야 합니다.

#### 5. 구매 확정

```
POST /api/nft/merchandise/confirm-purchase
Headers: Authorization: Bearer {accessToken}
Body: {
  "projectId": 0,
  "requestId": 0,
  "tokenURI": "ipfs://...",
  "devicePassword": "device123",
  "storedWalletData": { ... }
}
```

**설명**:

- 구매자가 구매 요청을 확정합니다.
- Merchandise NFT가 민팅됩니다.
- DP Token이 인플루언서, 브랜드, 플랫폼으로 분배됩니다.

#### 6. 구매 취소

```
POST /api/nft/merchandise/cancel-purchase
Headers: Authorization: Bearer {accessToken}
Body: {
  "projectId": 0,
  "requestId": 0,
  "devicePassword": "device123",
  "storedWalletData": { ... }
}
```

**설명**: 구매 요청을 취소하고 DP Token을 환불합니다.

#### 7. 내 구매 요청 목록 조회

```
GET /api/nft/merchandise/my-purchase-requests
Headers: Authorization: Bearer {accessToken}
```

#### 8. 프로젝트별 구매 요청 목록 조회

```
GET /api/nft/merchandise/purchase-requests/:projectId
```

#### 9. 구매 요청 정보 조회

```
GET /api/nft/merchandise/purchase-request/:projectId/:requestId
```

#### 10. 브랜드 대기 프로젝트 조회

```
GET /api/nft/merchandise/brand-pending
Headers: Authorization: Bearer {accessToken}
```

**설명**: 브랜드가 활성화해야 하는 프로젝트 목록을 조회합니다.

#### 11. 프로젝트 활성화

```
POST /api/nft/merchandise/activate
Headers: Authorization: Bearer {accessToken}
Body: {
  "projectId": 0,
  "devicePassword": "device123",
  "storedWalletData": { ... }
}
```

**설명**:

- 브랜드가 인플루언서의 프로젝트를 활성화합니다.
- 이 API는 **Merchandise 프로젝트 활성화**의 핵심 기능이며, MPC 패턴을 사용합니다.
- 활성화된 프로젝트만 구매 요청을 받을 수 있습니다.

#### 12. 내 Merchandise NFT 목록 조회

```
GET /api/nft/merchandise/my-nfts
Headers: Authorization: Bearer {accessToken}
```

#### 13. 전체 Merchandise NFT 목록 조회

```
GET /api/nft/merchandise/all-nfts
```

#### 14. Merchandise NFT 정보 조회

```
GET /api/nft/merchandise/nft/:tokenId
```

#### 15. 플랫폼 수수료 정보 조회

```
GET /api/nft/merchandise/platform-fee-info
```

#### 16. 전체 영수증 목록 조회

```
GET /api/nft/merchandise/receipts
```

#### 17. 영수증 조회

```
GET /api/nft/merchandise/receipt/:receiptId
```

#### 18. 프로젝트별 영수증 목록 조회

```
GET /api/nft/merchandise/receipts/project/:projectId
```

#### 19. PDF 영수증 다운로드

```
GET /api/nft/merchandise/receipt/:receiptId/pdf
```

---

### 3.5 Platform APIs (플랫폼 관리)

#### 1. 통합 소유권 이전

```
POST /api/nft/platform/transfer-all-ownership
Headers: Authorization: Bearer {accessToken}
Body: {
  "newOwner": "0x...",
  "devicePassword": "device123",
  "storedWalletData": { ... }
}
```

**설명**: 모든 컨트랙트의 소유권을 한 번에 이전합니다.

#### 2. 소유권 이전

```
POST /api/nft/platform/transfer-ownership
Headers: Authorization: Bearer {accessToken}
Body: {
  "newOwner": "0x...",
  "devicePassword": "device123",
  "storedWalletData": { ... }
}
```

**설명**: PlatformRegistry의 소유권을 이전합니다.

#### 3. 소유자 조회

```
GET /api/nft/platform/owner
```

#### 4. 상태 조회

```
GET /api/nft/platform/status
```

#### 5. 팩토리 설정

```
POST /api/nft/platform/set-factory
Headers: Authorization: Bearer {accessToken}
Body: {
  "factoryType": "merchandise",
  "factoryAddress": "0x...",
  "devicePassword": "device123",
  "storedWalletData": { ... }
}
```

#### 6. 주소 조회

```
GET /api/nft/platform/addresses
```

**설명**: 모든 컨트랙트 주소를 조회합니다.

---

### 3.6 Blockchain Utils APIs

#### 1. Faucet (DP 토큰 받기)

```
POST /api/utils/faucet
Body: {
  "walletAddress": "0x...",
  "amount": "100"
}
```

**설명**:

- 테스트용 DP Token 에어드랍 기능입니다.
- 인증이 필요 없습니다.
- 관리자 프라이빗 키로 직접 전송합니다.
- 수량 제한이 없습니다.

#### 2. IPFS 파일 업로드

```
POST /api/utils/ipfs/upload-file
Content-Type: multipart/form-data
Body: file (file)
```

#### 3. IPFS JSON 업로드

```
POST /api/utils/ipfs/upload-json
Body: {
  "jsonData": { ... }
}
```

#### 4. IP NFT 상태 디버그

```
GET /api/utils/debug/ipnft/:tokenId
Headers: Authorization: Bearer {accessToken}
```

**설명**: IP NFT의 상태를 디버깅하기 위한 상세 정보를 조회합니다.

---

## 4. 컨트랙트 배포 구조

### 4.1 Hardhat 설정

`hardhat.config.js` 파일에서 네트워크 설정을 확인할 수 있습니다:

```javascript
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    besu: {
      url: "https://besu.dressdio.me",
      chainId: 2741,
      accounts: [
        "0x08ea430735cdb2b440e20b5bad77354ebdcbba85eeb509774de29c6ee1fc25b0",
      ],
    },
  },
};
```

### 4.2 배포 스크립트 (`scripts/deploy.js`)

배포 순서는 다음과 같습니다:

1. **CreatorSBT 배포**

   - SBT 컨트랙트를 배포합니다.

2. **PlatformRegistry 배포**

   - 모든 컨트랙트 주소를 관리하는 레지스트리를 배포합니다.

3. **IPNFTFactory 배포**

   - IP NFT 팩토리를 배포합니다.
   - PlatformRegistry, DP Token 주소를 전달합니다.

4. **IPNFT 컨트랙트 주소 획득**

   - IPNFTFactory에서 IPNFT 컨트랙트 주소를 가져옵니다.

5. **MerchandiseFactory 배포**

   - Merchandise NFT 팩토리를 배포합니다.
   - IPNFT, SBT, DP Token 주소를 전달합니다.

6. **PlatformRegistry에 모든 컨트랙트 등록**

   ```javascript
   await registry.setSBTContract(sbt.target);
   await registry.setMerchandiseFactory(merchFactory.target);
   await registry.setIPNFTFactory(ipnftFactory.target);
   ```

7. **소유권 이전**
   - 모든 컨트랙트의 소유권을 ABC Wallet 관리자 주소(`PLATFORM_ADMIN_WALLET_ADDRESS`)로 이전합니다.
   - 이는 MPC 패턴을 사용하기 위함입니다.

### 4.3 배포된 컨트랙트 목록

- **CreatorSBT**: SBT 발행 및 관리
- **PlatformRegistry**: 컨트랙트 주소 레지스트리
- **IPNFTFactory**: IP NFT 팩토리
- **IPNFT**: IP NFT 컨트랙트 (Factory에서 생성)
- **MerchandiseFactory**: Merchandise NFT 팩토리
- **MerchandiseNFT**: Merchandise NFT 컨트랙트 (Factory에서 생성)
- **DPToken**: DP Token 컨트랙트 (별도 배포)

### 4.4 배포 명령어

```bash
# 환경 변수 설정
export PLATFORM_ADMIN_WALLET_ADDRESS=0x2C686C46D3622d60CCAbEfb757158c8904312871
export DP_TOKEN_ADDRESS=0x...

# 배포 실행
npx hardhat run scripts/deploy.js --network besu
```

---

## 5. 1:N 미러링 구조

### 5.1 개요

1:N 미러링은 Polygon 네트워크의 Dress Token을 플랫폼 어드민 지갑으로 전송하면, 자동으로 Besu 네트워크의 DP Token을 5배로 지급하는 시스템입니다.

**비율**: 1 DRESS (Polygon) → 5 DP (Besu)

### 5.2 작동 원리

```
1. 사용자가 Polygon에서 Dress Token 전송
   사용자 지갑 → 플랫폼 어드민 지갑 (0x2C686C46D3622d60CCAbEfb757158c8904312871)
   전송 수량: 10 DRESS
   ↓
2. 트랜잭션 완료 (txHash 획득)
   ↓
3. Transfer 이벤트 파싱 (블록체인 검증)
   - 실제 전송된 금액 확인 (입력값 무시)
   - 플랫폼 어드민 지갑 확인
   ↓
4. DP Token 계산
   실제 전송 금액 × 5 = DP Token 수량
   예: 10 DRESS × 5 = 50 DP
   ↓
5. DP Token 자동 지급 (Besu)
   플랫폼 어드민 지갑 → 사용자 지갑
   전송 수량: 50 DP
   ↓
6. 완료
```

### 5.3 구현 위치

이 기능은 다음 두 API에서 구현되어 있습니다:

#### API #1: Dress Token 전송 (조건부 자동 스왑)

```
POST /api/utils/dress-token/transfer
```

**특징**:

- 받는 주소가 플랫폼 어드민 지갑인 경우 자동으로 스왑 실행
- 일반 주소로 전송 시 스왑 없이 전송만 수행
- Transfer 이벤트 파싱으로 실제 전송 금액 검증

**코드 위치**: `src/controllers/utils/utilController.js`의 `transferDressToken` 함수

#### API #2: Dress Token 전송 + 자동 스왑 (플랫폼 전용)

```
POST /api/utils/dress-token/transfer-and-swap
```

**특징**:

- 항상 플랫폼 어드민 지갑으로 전송
- `to` 파라미터 불필요 (자동 설정)
- 원클릭 스왑 기능

**코드 위치**: `src/controllers/utils/utilController.js`의 `transferDressTokenAndSwap` 함수

### 5.4 검증 프로세스

보안을 위해 다음과 같은 검증 프로세스를 거칩니다:

1. **트랜잭션 Receipt 조회**

   ```javascript
   const txReceipt = await polygonWeb3.eth.getTransactionReceipt(polygonTxHash);
   ```

2. **Transfer 이벤트 파싱**

   ```javascript
   const transferEventSignature = polygonWeb3.utils.keccak256(
     "Transfer(address,address,uint256)"
   );
   const transferLog = txReceipt.logs.find(
     (log) =>
       log.topics[0] === transferEventSignature &&
       log.address.toLowerCase() === POLYGON_DRESS_TOKEN_ADDRESS.toLowerCase()
   );
   ```

3. **실제 전송 금액 확인**

   ```javascript
   const actualDressAmountWei = BigInt(transferLog.data);
   const actualDressAmount = polygonWeb3.utils.fromWei(
     actualDressAmountWei.toString(),
     "ether"
   );
   ```

4. **DP Token 계산 및 지급**
   ```javascript
   const dpAmount = parseFloat(actualDressAmount) * SWAP_RATE; // SWAP_RATE = 5
   const dpAmountInWei = web3.utils.toWei(dpAmount.toString(), "ether");
   const dpReceipt = await blockchainService.transferDP(
     storedWalletData.sid,
     dpAmountInWei
   );
   ```

### 5.5 환경 변수

```env
# 플랫폼 어드민 지갑 (Polygon에서 Dress Token을 받는 주소)
DRESSDIO_ADMIN_WALLET_ADDRESS=0x2C686C46D3622d60CCAbEfb757158c8904312871

# Polygon 네트워크 설정
POLYGON_RPC_URL=https://polygon-rpc.com
POLYGON_DRESS_TOKEN_ADDRESS=0x5Fc44144218353584FC36Aaa3C0C401348870230

# 스왑 비율
SWAP_RATE=5

# Besu 네트워크 설정
BESU_RPC_URL=https://besu.dressdio.me
DP_TOKEN_ADDRESS=0x...
```

### 5.6 에러 처리

- **전송 실패**: Dress Token 전송이 실패하면 스왑도 실행되지 않습니다.
- **스왑 실패**: Dress Token 전송은 성공했지만 DP Token 지급이 실패한 경우, TxHash 값을 통하여 관리자가 수동 스왑 API 사용.
- **검증 실패**: Transfer 이벤트를 찾을 수 없는 경우 에러를 반환합니다.

---

## 6. 환경 설정

### 6.1 필수 환경 변수

`.env` 파일에 다음 변수들이 설정되어 있어야 합니다:

```env
# 서버 설정
PORT=5000
NODE_ENV=production

# ABC Wallet WaaS API
ABC_WALLET_API_KEY=your_api_key
ABC_WALLET_API_URL=https://api.abcwallet.com

# Besu 네트워크
BESU_RPC_URL=https://besu.dressdio.me
DP_TOKEN_ADDRESS=0x...
CREATOR_SBT_ADDRESS=0x...
PLATFORM_REGISTRY_ADDRESS=0x...
MERCHANDISE_FACTORY_ADDRESS=0x...
IPNFT_FACTORY_ADDRESS=0x...

# Polygon 네트워크
POLYGON_RPC_URL=https://polygon-rpc.com
POLYGON_DRESS_TOKEN_ADDRESS=0x5Fc44144218353584FC36Aaa3C0C401348870230

# 플랫폼 관리
PLATFORM_ADMIN_WALLET_ADDRESS=0x2C686C46D3622d60CCAbEfb757158c8904312871
DRESSDIO_ADMIN_WALLET_ADDRESS=0x2C686C46D3622d60CCAbEfb757158c8904312871
DRESSDIO_ADMIN_PRIVATE_KEY=0x...  # Faucet용 (Besu)

# 스왑 설정
SWAP_RATE=5

# IPFS (Pinata)
PINATA_API_KEY=your_api_key
PINATA_SECRET_KEY=your_secret_key

# JWT
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
```

### 6.2 설치 및 실행

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# 서버 실행
npm run dev
# 또는
node src/server.js
```

### 6.3 프로덕션 배포

```bash
# PM2 사용 예시
pm2 start src/server.js --name dressdio-api

# 또는 Docker 사용
docker build -t dressdio-api .
docker run -d -p 5000:5000 --env-file .env dressdio-api
```

---

## 7. 주요 기능 상세

### 7.1 MPC 패턴 구현

MPC 패턴은 `src/services/blockchainMPC.js`에서 구현되어 있습니다:

```javascript
// Besu 네트워크용
async function executeTransactionWithStoredData(
  storedWalletData,
  devicePassword,
  txData,
  accessToken
) {
  // 1. 보안 채널 생성
  // 2. 트랜잭션 해시 서명 요청
  // 3. 서명된 트랜잭션 RLP 인코딩
  // 4. 블록체인으로 전송
}

// Polygon 네트워크용
async function executeTransactionWithStoredDataForPolygon(
  storedWalletData,
  devicePassword,
  txData,
  accessToken
) {
  // EIP-1559 트랜잭션 처리
}
```

### 7.2 트랜잭션 서명

`src/services/blockchain.js`에서 트랜잭션 서명을 처리합니다:

- **Besu (Legacy)**: `signTransaction` 함수
- **Polygon (EIP-1559)**: `signTransactionForPolygon` 함수

**중요**: `0` 값은 RLP 인코딩 시 `"0x"` (empty)로 처리해야 합니다. 이를 위해 `toHexOrEmpty` 헬퍼 함수를 사용합니다.

### 7.3 IPFS 업로드

`src/services/upload.js`에서 IPFS 업로드를 처리합니다. Pinata API를 사용합니다.

---

## 8. 트러블슈팅 가이드

### 8.1 자주 발생하는 에러

#### 1. "보안 채널 암호문 복호화 에러" (Code 751)

**원인**: `devicePassword`가 잘못되었거나 암호화된 값이 사용됨  
**해결**: `devicePassword`는 평문(지갑 생성 시 사용한 원본 비밀번호)이어야 합니다.

#### 2. "v cannot have leading zeroes, received: 0"

**원인**: RLP 인코딩 시 `0` 값을 `"0x0"`으로 처리함  
**해결**: `toHexOrEmpty` 함수를 사용하여 `0` 값을 `"0x"`로 처리합니다.

#### 3. "Transaction has been reverted by the EVM"

**원인**:

- 가스 부족 (Polygon)
- 컨트랙트 로직 오류
- 권한 부족

**해결**:

- Polygon의 경우 MATIC 잔액 확인
- 컨트랙트 로직 및 권한 확인

#### 4. "INSUFFICIENT_GAS" (Polygon)

**원인**: MATIC 잔액 부족  
**해결**: 최소 0.1 MATIC을 충전합니다.

#### 5. "nonce cannot have leading zeroes"

**원인**: EIP-1559 트랜잭션에서 `nonce`가 `0`일 때 `"0x0"`으로 처리됨  
**해결**: `toHexOrEmpty` 함수를 사용합니다.

### 8.2 로그 확인

서버 로그는 `src/utils/logger.js`를 통해 관리됩니다. 주요 로그 레벨:

- `logger.info`: 일반 정보
- `logger.error`: 에러 정보
- `logger.warn`: 경고 정보

### 8.3 디버깅 팁

1. **트랜잭션 해시 확인**: 모든 트랜잭션은 해시를 반환하므로 블록체인 탐색기에서 확인 가능합니다.
2. **Transfer 이벤트 확인**: Polygon의 경우 Polygonscan에서 Transfer 이벤트를 확인할 수 있습니다.
3. **MPC 데이터 확인**: 프론트엔드의 `localStorage`에서 `MpcWalletData`를 확인할 수 있습니다.

---

## 9. 추가 정보

### 9.1 파일 구조

```
dressdio_be/
├── contracts/          # Solidity 컨트랙트
├── scripts/           # 배포 스크립트
├── src/
│   ├── config/       # 설정 파일 (web3.js)
│   ├── controllers/  # 컨트롤러
│   ├── middleware/   # 미들웨어 (auth)
│   ├── routes/       # 라우터
│   ├── services/     # 서비스 (blockchain, wallet, upload)
│   ├── utils/        # 유틸리티
│   └── server.js     # 서버 진입점
├── public/           # 정적 파일 (HTML UI)
├── postman/          # Postman Collection
└── .env             # 환경 변수
```

### 9.2 주요 의존성

```json
{
  "express": "^4.x",
  "web3": "^4.x",
  "hardhat": "^2.x",
  "@nomicfoundation/hardhat-toolbox": "^3.x",
  "dotenv": "^16.x",
  "cors": "^2.x",
  "morgan": "^1.x"
}
```

### 9.3 연락처 및 리소스

- **ABC Wallet WaaS API 문서**: [공식 문서 참조]
- **Hardhat 문서**: https://hardhat.org/docs
- **Web3.js 문서**: https://web3js.readthedocs.io

---

## 10. 마무리

이 인수인계서는 DressDio 플랫폼의 핵심 기능과 구조를 설명합니다. 추가 질문이나 지원이 필요하면 개발팀에 문의해주세요.

**작성자**: 퓨처센스 홍종남
**최종 업데이트**: 2025년 11월 18일 화요일
