# DressDio API Documentation

## 📋 개요

**Base URL**: `https://fs.dressdio.me`

**인증 방식**: Bearer Token

```
Authorization: Bearer {accessToken}
```

---

## 🔐 Auth APIs (인증)

### 1. 이메일 확인

- **Method**: GET
- **Path**: `/api/auth/:email/verify-email`
- **Auth**: ❌
- **Parameters**:
  - `email` (string): 확인할 이메일 주소

### 2. 인증 코드 발송

- **Method**: GET
- **Path**: `/api/auth/:email/send-code`
- **Auth**: ❌
- **Parameters**:
  - `email` (string): 이메일 주소
  - `lang` (string): 언어 코드 (예: "en")
  - `template` (string): 이메일 템플릿 (예: "register")

### 3. 인증 코드 확인

- **Method**: POST
- **Path**: `/api/auth/:email/verify-code`
- **Auth**: ❌
- **Body**:

```json
{
  "code": "123456"
}
```

### 4. 회원가입

- **Method**: POST
- **Path**: `/api/auth/register`
- **Auth**: ❌
- **Body**:

```json
{
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

### 5. 로그인

- **Method**: POST
- **Path**: `/api/auth/login`
- **Auth**: ❌
- **Body**:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "devicePassword": "device123"
}
```

### 6. 토큰 갱신

- **Method**: POST
- **Path**: `/api/auth/refresh-token`
- **Auth**: ❌
- **Body**:

```json
{
  "refreshToken": "your_refresh_token_here"
}
```

### 7. 비밀번호 재설정

- **Method**: POST
- **Path**: `/api/auth/reset-password`
- **Auth**: ❌
- **Body**:

```json
{
  "email": "user@example.com",
  "password": "newpassword123",
  "code": "123456"
}
```

### 8. 계정 정보 조회

- **Method**: GET
- **Path**: `/api/auth/account`
- **Auth**: ✅

### 9. 잔액 조회

- **Method**: GET
- **Path**: `/api/auth/balance`
- **Auth**: ✅

### 10. 소셜 로그인 URL 조회

- **Method**: GET
- **Path**: `/api/auth/social/login-url`
- **Auth**: ❌
- **Parameters**:
  - `provider` (string): 소셜 제공자 (예: "google", "facebook")
  - `callbackUrl` (string): 콜백 URL

### 11. 소셜 로그인 완료

- **Method**: POST
- **Path**: `/api/auth/social/finalize`
- **Auth**: ❌
- **Body**:

```json
{
  "id": "social_login_id_here"
}
```

### 12. 소셜 회원가입

- **Method**: POST
- **Path**: `/api/auth/social/register`
- **Auth**: ❌
- **Body**:

```json
{
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

### 13. 소셜 로그인 전체 플로우

- **Method**: POST
- **Path**: `/api/auth/social/login-full`
- **Auth**: ❌
- **Body**:

```json
{
  "provider": "google",
  "callbackUrl": "https://example.com/callback"
}
```

### 14. MPC 지갑 생성/복구

- **Method**: POST
- **Path**: `/api/auth/mpc/wallet/create-or-recover`
- **Auth**: ✅
- **Headers**:
  - `Authorization: Bearer {accessToken}`
- **Body**:

```json
{
  "devicePassword": "device123",
  "email": "user@example.com"
}
```

### 15. 비밀번호 변경

- **Method**: POST
- **Path**: `/api/auth/change-password`
- **Auth**: ✅
- **Headers**:
  - `Authorization: Bearer {accessToken}`
- **Body**:

```json
{
  "oldpassword": "oldpassword123",
  "newpassword": "newpassword123"
}
```

---

## 🎨 IP NFT APIs (IP NFT)

### 1. IP NFT 발행

- **Method**: POST
- **Path**: `/api/nft/ip/mint`
- **Auth**: ✅
- **Headers**:
  - `Authorization: Bearer {accessToken}`
- **Body**:

```json
{
  "devicePassword": "device123",
  "storedWalletData": {
    "sid": "0x...",
    "wid": "0x...",
    "uid": "0x..."
  },
  "ipfsImage": "ipfs://Qm...",
  "name": "My IP NFT",
  "description": "Description of the IP NFT",
  "price": "100",
  "supplyPrice": "50",
  "creatorType": "brand"
}
```

### 2. 전체 IP NFT 목록 조회

- **Method**: GET
- **Path**: `/api/nft/ip/list`
- **Auth**: ❌

### 3. 내 IP NFT 목록 조회

- **Method**: GET
- **Path**: `/api/nft/ip/my`
- **Auth**: ✅

### 4. IP NFT 정보 조회

- **Method**: GET
- **Path**: `/api/nft/ip/info/:tokenId`
- **Auth**: ❌
- **Parameters**:
  - `tokenId` (uint): 토큰 ID

### 5. 민팅 수수료 조회

- **Method**: GET
- **Path**: `/api/nft/ip/minting-fee`
- **Auth**: ❌

### 6. 민팅 수수료 설정

- **Method**: POST
- **Path**: `/api/nft/ip/set-minting-fee`
- **Auth**: ✅
- **Body**:

```json
{
  "fee": "10"
}
```

### 7. 이미지 업로드

- **Method**: POST
- **Path**: `/api/nft/ip/upload-image`
- **Auth**: ✅
- **Content-Type**: `multipart/form-data`
- **Body**:
  - `image` (file): 업로드할 이미지 파일

---

## 🛍️ Merchandise APIs (상품)

### 1. 프로젝트 생성

- **Method**: POST
- **Path**: `/api/nft/merchandise/create`
- **Auth**: ✅
- **Body**:

```json
{
  "projectName": "My Merchandise Project",
  "description": "Project description",
  "quantity": 100,
  "salePrice": "50",
  "ipnftTokenIds": "0,1,2",
  "storedWalletData": {
    "sid": "0x...",
    "wid": "0x...",
    "uid": "0x..."
  },
  "devicePassword": "device123",
  "accessToken": "your_access_token_here",
  "projectImageUrl": "https://example.com/image.jpg"
}
```

### 2. 내 프로젝트 목록 조회

- **Method**: GET
- **Path**: `/api/nft/merchandise/my`
- **Auth**: ✅

### 3. 전체 프로젝트 목록 조회

- **Method**: GET
- **Path**: `/api/nft/merchandise/list`
- **Auth**: ❌

### 4. 구매 요청

- **Method**: POST
- **Path**: `/api/nft/merchandise/request-purchase`
- **Auth**: ✅
- **Body**:

```json
{
  "projectId": 0,
  "quantity": 1,
  "storedWalletData": {
    "sid": "0x...",
    "wid": "0x...",
    "uid": "0x..."
  },
  "devicePassword": "device123",
  "accessToken": "your_access_token_here"
}
```

### 5. 구매 확정

- **Method**: POST
- **Path**: `/api/nft/merchandise/confirm-purchase`
- **Auth**: ✅
- **Body**:

```json
{
  "requestId": 0,
  "storedWalletData": {
    "sid": "0x...",
    "wid": "0x...",
    "uid": "0x..."
  },
  "devicePassword": "device123",
  "accessToken": "your_access_token_here"
}
```

### 6. 구매 취소

- **Method**: POST
- **Path**: `/api/nft/merchandise/cancel-purchase`
- **Auth**: ✅
- **Body**:

```json
{
  "requestId": 0,
  "storedWalletData": {
    "sid": "0x...",
    "wid": "0x...",
    "uid": "0x..."
  },
  "devicePassword": "device123",
  "accessToken": "your_access_token_here"
}
```

### 7. 내 구매 요청 목록 조회

- **Method**: GET
- **Path**: `/api/nft/merchandise/my-purchase-requests`
- **Auth**: ✅

### 8. 프로젝트별 구매 요청 목록 조회

- **Method**: GET
- **Path**: `/api/nft/merchandise/purchase-requests/:projectId`
- **Auth**: ❌
- **Parameters**:
  - `projectId` (uint): 프로젝트 ID

### 9. 브랜드 대기 프로젝트 조회

- **Method**: GET
- **Path**: `/api/nft/merchandise/brand-pending`
- **Auth**: ✅

### 10. 프로젝트 활성화

- **Method**: POST
- **Path**: `/api/nft/merchandise/activate/:projectId`
- **Auth**: ✅
- **Parameters**:
  - `projectId` (uint): 프로젝트 ID
- **Body**:

```json
{
  "storedWalletData": {
    "sid": "0x...",
    "wid": "0x...",
    "uid": "0x..."
  },
  "devicePassword": "device123",
  "accessToken": "your_access_token_here"
}
```

### 11. 내 Merchandise NFT 목록 조회

- **Method**: GET
- **Path**: `/api/nft/merchandise/my-nfts`
- **Auth**: ✅

### 12. 전체 Merchandise NFT 목록 조회

- **Method**: GET
- **Path**: `/api/nft/merchandise/all-nfts`
- **Auth**: ❌

### 13. Merchandise NFT 정보 조회

- **Method**: GET
- **Path**: `/api/nft/merchandise/nft/:tokenId`
- **Auth**: ❌
- **Parameters**:
  - `tokenId` (uint): 토큰 ID

### 14. 플랫폼 수수료 정보 조회

- **Method**: GET
- **Path**: `/api/nft/merchandise/platform-fee-info`
- **Auth**: ❌

### 15. 전체 영수증 목록 조회

- **Method**: GET
- **Path**: `/api/nft/merchandise/receipts`
- **Auth**: ❌

### 16. 영수증 조회

- **Method**: GET
- **Path**: `/api/nft/merchandise/receipt/:receiptId`
- **Auth**: ❌
- **Parameters**:
  - `receiptId` (string): 영수증 ID

---

## 🏢 Platform APIs (플랫폼 관리)

### 1. 통합 소유권 이전

- **Method**: POST
- **Path**: `/api/nft/platform/transfer-all-ownership`
- **Auth**: ✅
- **Body**:

```json
{
  "newOwner": "0x...",
  "devicePassword": "device123",
  "storedWalletData": {
    "sid": "0x...",
    "wid": "0x...",
    "uid": "0x..."
  }
}
```

### 2. 소유권 이전

- **Method**: POST
- **Path**: `/api/nft/platform/transfer-ownership`
- **Auth**: ✅
- **Body**:

```json
{
  "newOwner": "0x...",
  "devicePassword": "device123",
  "storedWalletData": {
    "sid": "0x...",
    "wid": "0x...",
    "uid": "0x..."
  }
}
```

### 3. 소유자 조회

- **Method**: GET
- **Path**: `/api/nft/platform/owner`
- **Auth**: ❌

### 4. 상태 조회

- **Method**: GET
- **Path**: `/api/nft/platform/status`
- **Auth**: ❌

### 5. 팩토리 설정

- **Method**: POST
- **Path**: `/api/nft/platform/set-factory`
- **Auth**: ✅
- **Body**:

```json
{
  "factoryType": "merchandise",
  "factoryAddress": "0x...",
  "devicePassword": "device123",
  "storedWalletData": {
    "sid": "0x...",
    "wid": "0x...",
    "uid": "0x..."
  }
}
```

### 6. 주소 조회

- **Method**: GET
- **Path**: `/api/nft/platform/addresses`
- **Auth**: ❌

---

## 🎭 SBT APIs (Soulbound Token)

### 1. 전체 SBT 목록 조회

- **Method**: GET
- **Path**: `/api/nft/sbt/list`
- **Auth**: ❌
- **Description**: 모든 SBT 토큰 목록을 조회합니다.

### 2. SBT 정보 조회

- **Method**: GET
- **Path**: `/api/nft/sbt/:tokenId`
- **Auth**: ❌
- **Parameters**:
  - `tokenId` (uint): SBT 토큰 ID
- **Description**: 특정 SBT 토큰의 상세 정보를 조회합니다.

### 3. 관리자 잔액 조회

- **Method**: GET
- **Path**: `/api/nft/sbt/admin-balance`
- **Auth**: ❌
- **Description**: 관리자 지갑의 ETH 잔액을 조회합니다.

### 4. SBT 발행 (Brand)

- **Method**: POST
- **Path**: `/api/nft/sbt/mint`
- **Auth**: ✅ (관리자만)
- **Body**:

```json
{
  "devicePassword": "device123",
  "storedWalletData": {
    "uid": "a5a9b9a4-54be-4692-8046-4855ecd6d0f0",
    "wid": 805,
    "sid": "0x58D7E7BdE42764199FCd99FDa6866bBccd773feF",
    "pvencstr": "UBxpgNm4ZDFNLxXv7fU2Tu4gTTaWZZWOEtX8G8sERvYAlFN5C",
    "encryptDevicePassword": "JjTdTKiAa0rWVkEGzAehxFa0cEr3EeyewFyJ1hsmu8E=",
    "ucpubkey": null,
    "ourpubkey": null
  },
  "creatorWalletAddress": "0x1234567890123456789012345678901234567890",
  "creatorType": "brand",
  "creatorName": "Test Brand",
  "description": "Test SBT for Brand"
}
```

### 5. SBT 발행 (Creator)

- **Method**: POST
- **Path**: `/api/nft/sbt/mint`
- **Auth**: ✅ (관리자만)
- **Body**:

```json
{
  "devicePassword": "device123",
  "storedWalletData": {
    "uid": "a5a9b9a4-54be-4692-8046-4855ecd6d0f0",
    "wid": 805,
    "sid": "0x58D7E7BdE42764199FCd99FDa6866bBccd773feF",
    "pvencstr": "UBxpgNm4ZDFNLxXv7fU2Tu4gTTaWZZWOEtX8G8sERvYAlFN5C",
    "encryptDevicePassword": "JjTdTKiAa0rWVkEGzAehxFa0cEr3EeyewFyJ1hsmu8E=",
    "ucpubkey": null,
    "ourpubkey": null
  },
  "creatorWalletAddress": "0x9876543210987654321098765432109876543210",
  "creatorType": "creator",
  "creatorName": "Test Creator",
  "description": "Test SBT for Creator"
}
```

### 6. SBT 발행 (Designer)

- **Method**: POST
- **Path**: `/api/nft/sbt/mint`
- **Auth**: ✅ (관리자만)
- **Body**:

```json
{
  "devicePassword": "device123",
  "storedWalletData": {
    "uid": "a5a9b9a4-54be-4692-8046-4855ecd6d0f0",
    "wid": 805,
    "sid": "0x58D7E7BdE42764199FCd99FDa6866bBccd773feF",
    "pvencstr": "UBxpgNm4ZDFNLxXv7fU2Tu4gTTaWZZWOEtX8G8sERvYAlFN5C",
    "encryptDevicePassword": "JjTdTKiAa0rWVkEGzAehxFa0cEr3EeyewFyJ1hsmu8E=",
    "ucpubkey": null,
    "ourpubkey": null
  },
  "creatorWalletAddress": "0x5555555555555555555555555555555555555555",
  "creatorType": "designer",
  "creatorName": "Test Designer",
  "description": "Test SBT for Designer"
}
```

**SBT Creator Types:**

- `brand`: 브랜드용 SBT
- `creator`: 크리에이터용 SBT
- `designer`: 디자이너용 SBT

**Response Example:**

```json
{
  "status": "success",
  "data": {
    "txHash": "0x...",
    "tokenId": "1",
    "message": "SBT minted successfully."
  }
}
```

---

## 🛠️ Utility APIs (유틸리티)

### 1. Faucet (에어드랍)

- **Method**: POST
- **Path**: `/api/utils/faucet`
- **Auth**: ❌
- **Body**:

```json
{
  "walletAddress": "0x...",
  "amount": "100"
}
```

### 2. IP NFT 상태 디버그

- **Method**: GET
- **Path**: `/api/utils/debug/ipnft/:tokenId`
- **Auth**: ✅
- **Parameters**:
  - `tokenId` (uint): 토큰 ID

---

## 📝 파라미터 타입 상세 정보

### String 타입

- `email`, `password`, `code`, `devicePassword`, `accessToken`, `refreshToken`
- `name`, `description`, `projectName`, `projectImageUrl`
- `ipfsImage`, `tokenURI`, `ipfsUri`
- `provider`, `callbackUrl`, `id`
- `creatorType`, `creatorName`
- `factoryType`, `factoryAddress`
- `newOwner`, `walletAddress`
- `receiptId`

### Uint 타입

- `tokenId` - NFT 토큰 ID
- `projectId` - 프로젝트 ID
- `requestId` - 구매 요청 ID
- `quantity` - 수량
- `fee` - 수수료

### Boolean 타입

- `overage`, `agree`, `collect`, `thirdParty`, `advertise`
- `isActive`, `isMatched`

### Object 타입

- `storedWalletData` - 지갑 데이터 객체
  ```json
  {
    "sid": "0x...",
    "wid": "0x...",
    "uid": "0x..."
  }
  ```

---

## 🔑 인증 방식

### Bearer Token 인증

```
Authorization: Bearer {accessToken}
```

### 파일 업로드

- `Content-Type: multipart/form-data`
- `image` 필드로 파일 전송

---

## 📊 응답 형식

### 성공 응답

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // 응답 데이터
  }
}
```

### 에러 응답

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

---

## 🚀 사용 예시

### 1. 로그인 후 토큰 저장

```javascript
// 로그인 요청
const loginResponse = await fetch("https://fs.dressdio.me/api/auth/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: "user@example.com",
    password: "password123",
    devicePassword: "device123",
  }),
});

const loginData = await loginResponse.json();
const accessToken = loginData.data.accessToken;
```

### 2. 인증이 필요한 API 호출

```javascript
// IP NFT 목록 조회
const response = await fetch("https://fs.dressdio.me/api/nft/ip/my", {
  method: "GET",
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});

const data = await response.json();
```

---

## 📞 지원

API 사용 중 문제가 발생하면 다음 정보를 포함하여 문의해주세요:

- API 엔드포인트
- 요청 파라미터
- 응답 데이터
- 에러 메시지
