# Polygon Dress Token 전송 - 에러 핸들링 요약

## ✅ 구현된 에러 대비 코드

### 📁 파일별 변경사항

#### 1. `src/controllers/utils/utilController.js`
**8가지 에러 케이스 핸들링:**

```javascript
// 1. 장치 비밀번호 검증 실패 (401)
INVALID_DEVICE_PASSWORD

// 2. 가스비(MATIC) 부족 (400)
INSUFFICIENT_GAS
→ "지갑에 최소 0.1 MATIC을 추가해주세요."

// 3. 토큰 잔액 부족 (400)
INSUFFICIENT_TOKEN_BALANCE

// 4. EVM Revert (400)
TRANSACTION_REVERTED
→ 가능한 원인: MATIC 부족, 토큰 부족, 컨트랙트 중지

// 5. RPC 연결 실패 (503)
NETWORK_ERROR
→ "잠시 후 다시 시도해주세요."

// 6. Nonce 에러 (400)
NONCE_ERROR
→ "이전 트랜잭션이 완료될 때까지 기다려주세요."

// 7. 서명 실패 (500)
SIGNING_FAILED

// 8. 기타 에러 (500)
→ 상세한 디버깅 정보 포함
```

**추가 기능:**
- 전송 전 MATIC 잔액 사전 확인 (Pre-check)
- 잔액 < 0.001 MATIC 시 경고 로그

---

#### 2. `src/services/blockchain.js`
**개선사항:**

```javascript
// 1. RPC 연결 Retry 로직 (3회 재시도)
// - Nonce 가져오기 실패 시 자동 재시도
// - 1초 간격으로 3회 시도

// 2. 상세한 에러 로깅
logger.error("[POLYGON_SEND] Transaction failed:", {
  errorMessage: error.message,
  errorCode: error.code,
  errorReason: error.reason,
  errorData: error.data,
});

// 3. 트랜잭션 디버깅 정보
logger.info("[POLYGON_SEND] Signed transaction:", {
  txLength: signedSerializeTx.length,
  txPreview: signedSerializeTx.substring(0, 50) + "...",
});
```

---

#### 3. `src/services/blockchainMPC.js`
**개선사항:**

```javascript
// 에러 로깅 및 전파
logger.error("[MPC_POLYGON] Transaction failed:", {
  error: error.message,
  sid: storedWalletData.sid,
  to: txData.to,
});

// Controller로 에러 전파 (상세 메시지 유지)
throw error;
```

---

## 📊 에러 응답 예시

### ✅ 성공
```json
{
  "success": true,
  "message": "Dress 토큰이 성공적으로 전송되었습니다.",
  "data": {
    "txHash": "0x...",
    "from": "0x...",
    "to": "0x...",
    "amount": "100",
    "contractAddress": "0x5Fc44144218353584FC36Aaa3C0C401348870230",
    "network": "polygon"
  }
}
```

### ❌ 가스비 부족
```json
{
  "success": false,
  "message": "가스비(MATIC)가 부족합니다. Polygon 네트워크에서 트랜잭션을 전송하려면 MATIC이 필요합니다.",
  "error": "INSUFFICIENT_GAS",
  "details": {
    "network": "Polygon",
    "requiredToken": "MATIC",
    "fromAddress": "0x58D7E7BdE42764199FCd99FDa6866bBccd773feF",
    "suggestion": "지갑에 최소 0.1 MATIC을 추가해주세요."
  }
}
```

### ❌ 트랜잭션 Revert
```json
{
  "success": false,
  "message": "트랜잭션이 실패했습니다. 가스비(MATIC) 또는 토큰 잔액을 확인해주세요.",
  "error": "TRANSACTION_REVERTED",
  "details": {
    "possibleReasons": [
      "MATIC 잔액 부족 (가스비)",
      "DRESS 토큰 잔액 부족",
      "컨트랙트 일시 중지 상태"
    ],
    "fromAddress": "0x58D7E7BdE42764199FCd99FDa6866bBccd773feF",
    "network": "Polygon"
  }
}
```

---

## 🔍 로그 모니터링

### 정상 흐름
```
[DRESS_TOKEN/TRANSFER] Starting Dress token transfer
[DRESS_TOKEN/TRANSFER] Pre-transfer balance check: 0.5 MATIC
[MPC_POLYGON] Executing Polygon transaction with MPC
[MPC_POLYGON] Creating secure channel...
[MPC_POLYGON] Step 1: Verifying password...
[MPC_POLYGON] Step 1 SUCCEEDED
[MPC_POLYGON] Step 2: Signing Polygon transaction with EIP-1559...
[POLYGON_SIGN] Using RPC: https://polygon-rpc.com
[POLYGON_SIGN] Gas estimated: 65000
[POLYGON_SIGN] Transaction signed successfully
[MPC_POLYGON] Step 3: Sending to Polygon network...
[POLYGON_SEND] Transaction successful: 0x...
```

### 에러 흐름 (MATIC 부족)
```
[DRESS_TOKEN/TRANSFER] Starting Dress token transfer
[DRESS_TOKEN/TRANSFER] Pre-transfer balance check: 0.0 MATIC
[DRESS_TOKEN/TRANSFER] Low MATIC balance detected ⚠️
[MPC_POLYGON] Executing Polygon transaction with MPC
...
[POLYGON_SEND] Transaction failed: insufficient funds
[DRESS_TOKEN/TRANSFER] Error: INSUFFICIENT_GAS
```

---

## 🚀 테스트 시나리오

### 1. 정상 케이스
- ✅ MATIC 잔액: 0.1 이상
- ✅ Dress Token 잔액: 충분
- ✅ 올바른 비밀번호
→ **예상 결과**: 성공

### 2. MATIC 부족
- ❌ MATIC 잔액: 0
- ✅ Dress Token 잔액: 충분
→ **예상 결과**: `INSUFFICIENT_GAS` 또는 `TRANSACTION_REVERTED`

### 3. 토큰 부족
- ✅ MATIC 잔액: 0.1 이상
- ❌ Dress Token 잔액: 0
→ **예상 결과**: `TRANSACTION_REVERTED`

### 4. 잘못된 비밀번호
- ❌ 비밀번호 틀림
→ **예상 결과**: `INVALID_DEVICE_PASSWORD`

### 5. RPC 장애
- ❌ RPC URL 불가
→ **예상 결과**: `NETWORK_ERROR` (3회 재시도 후)

---

## 📝 체크리스트

에러 핸들링이 제대로 작동하는지 확인:

- [x] 사용자 친화적 에러 메시지
- [x] HTTP 상태 코드 구분 (400, 401, 500, 503)
- [x] 에러 원인별 세부 정보 제공
- [x] 해결 방법 제시
- [x] 상세한 로그 기록
- [x] RPC 연결 재시도
- [x] 사전 잔액 확인
- [x] 트랜잭션 디버깅 정보

---

## 🔗 관련 문서

- [에러 가이드 전체](./POLYGON_DRESS_TOKEN_TRANSFER_ERRORS.md)
- [API 문서](../README.md)

