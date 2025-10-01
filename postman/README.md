# 📮 Postman Collection - Blockchain Utils API

Dressdio Backend의 블록체인 유틸리티 API를 테스트할 수 있는 **통합 Postman Collection**입니다.

**파일:** `Blockchain_Utils_Collection.json` (5개 API 통합)

---

## 📦 **포함된 API (5개)**

| #   | API                       | Method | 인증 | 설명                                         |
| --- | ------------------------- | ------ | ---- | -------------------------------------------- |
| 1   | Dress Token 잔액 조회     | `GET`  | ✅   | Polygon 네트워크에서 DRESS & MATIC 잔액 조회 |
| 2   | Faucet (DP 토큰 받기)     | `POST` | ❌   | Besu 네트워크에서 DP 토큰 에어드랍           |
| 3   | DP Token 전송             | `POST` | ✅   | Besu 네트워크에서 DP 토큰 MPC 전송           |
| 4   | Dress Token 전송          | `POST` | ✅   | Polygon 네트워크에서 DRESS 토큰 MPC 전송     |
| 5   | **Dress → DP Token Swap** | `POST` | ❌   | **DRESS × 5배로 DP Token 자동 스왑** 🔄      |

---

## 🚀 **Import 방법**

### 1️⃣ **Postman 열기**

- Postman 앱 실행 또는 [웹 버전](https://web.postman.co/) 접속

### 2️⃣ **Collection Import**

1. 좌측 상단 **"Import"** 버튼 클릭
2. **"Choose Files"** 클릭
3. `postman/Blockchain_Utils_Collection.json` 파일 선택
4. **"Import"** 클릭

**✅ 5개 API가 하나의 Collection으로 통합되어 있습니다!**

### 3️⃣ **Environment 설정 (선택사항)**

Collection Variables가 이미 포함되어 있지만, Environment를 만들면 더 편리합니다:

1. 좌측 **"Environments"** 클릭
2. **"Create Environment"** 클릭
3. 이름: `Dressdio Local`
4. 변수 추가:

| Variable                | Initial Value           | Type    |
| ----------------------- | ----------------------- | ------- |
| `baseUrl`               | `http://localhost:5000` | default |
| `accessToken`           | (ABC Wallet 토큰 입력)  | secret  |
| `uid`                   | (MPC 지갑 uid)          | default |
| `wid`                   | (MPC 지갑 wid)          | default |
| `walletAddress`         | (지갑 주소)             | default |
| `pvencstr`              | (암호화된 개인키)       | secret  |
| `encryptDevicePassword` | (암호화된 비밀번호)     | secret  |

5. **Save** 클릭

---

## 📝 **사용 방법**

### ✅ **1. Dress Token 잔액 조회**

**목적:** 전송하기 전에 DRESS & MATIC 잔액 확인

**Steps:**

1. `1. Dress Token 잔액 조회 (Polygon)` 요청 선택
2. **Headers** 탭:
   - `Authorization`: `Bearer YOUR_ACCESS_TOKEN`
3. **Send** 클릭

**예상 응답:**

```json
{
  "success": true,
  "data": {
    "token": {
      "balance": "10000.0"
    },
    "matic": {
      "balance": "0.5",
      "warning": null
    }
  }
}
```

**⚠️ MATIC 잔액이 0이면:**

```json
{
  "matic": {
    "balance": "0.0",
    "warning": "가스비(MATIC)가 부족합니다. 전송하려면 최소 0.1 MATIC이 필요합니다."
  }
}
```

→ **MATIC을 추가해야 Dress Token 전송 가능!**

---

### ✅ **2. Faucet (DP 토큰 받기)**

**목적:** 테스트용 DP 토큰 에어드랍

**Steps:**

1. `2. Faucet (DP 토큰 받기)` 요청 선택
2. **Body** 탭:
   ```json
   {
     "walletAddress": "0x25D96413E62A8A51eB31fd12fFA281Ca9c86A029",
     "amount": "10"
   }
   ```
3. **Send** 클릭

**예상 응답:**

```json
{
  "success": true,
  "message": "DP tokens successfully transferred.",
  "data": {
    "txHash": "0x1234...",
    "amount": "10"
  }
}
```

---

### ✅ **3. DP Token 전송 (Besu, MPC)**

**목적:** Besu 네트워크에서 DP 토큰 전송

**Steps:**

1. `3. DP Token 전송 (Besu, MPC)` 요청 선택
2. **Headers** 탭:
   - `Authorization`: `Bearer YOUR_ACCESS_TOKEN`
3. **Body** 탭:
   ```json
   {
     "to": "0x25D96413E62A8A51eB31fd12fFA281Ca9c86A029",
     "amount": "1",
     "devicePassword": "your-device-password",
     "storedWalletData": {
       "uid": "{{uid}}",
       "wid": {{wid}},
       "sid": "{{walletAddress}}",
       "pvencstr": "{{pvencstr}}",
       "encryptDevicePassword": "{{encryptDevicePassword}}"
     }
   }
   ```
4. **변수 사용:**
   - `{{uid}}`, `{{wid}}` 등은 Environment Variables로 설정
   - 또는 직접 값 입력
5. **Send** 클릭

**예상 응답:**

```json
{
  "success": true,
  "message": "DP 토큰이 성공적으로 전송되었습니다.",
  "data": {
    "txHash": "0xabc...",
    "amount": "1"
  }
}
```

**에러 예시:**

```json
{
  "success": false,
  "message": "장치 비밀번호가 올바르지 않습니다.",
  "error": "INVALID_DEVICE_PASSWORD"
}
```

---

### ✅ **4. Dress Token 전송 (Polygon, MPC)**

**목적:** Polygon 네트워크에서 DRESS 토큰 전송

**⚠️ 사전 요구사항:**

- **MATIC 잔액 확인** (API #1로 확인)
- 최소 **0.1 MATIC** 필요 (가스비)

**Steps:**

1. `4. Dress Token 전송 (Polygon, MPC)` 요청 선택
2. **Headers** 탭:
   - `Authorization`: `Bearer YOUR_ACCESS_TOKEN`
3. **Body** 탭:
   ```json
   {
     "to": "0x25D96413E62A8A51eB31fd12fFA281Ca9c86A029",
     "amount": "1",
     "devicePassword": "your-device-password",
     "storedWalletData": {
       "uid": "{{uid}}",
       "wid": {{wid}},
       "sid": "{{walletAddress}}",
       "pvencstr": "{{pvencstr}}",
       "encryptDevicePassword": "{{encryptDevicePassword}}"
     }
   }
   ```
4. **Send** 클릭

**예상 응답:**

```json
{
  "success": true,
  "message": "Dress 토큰이 성공적으로 전송되었습니다.",
  "data": {
    "txHash": "0xdef...",
    "network": "polygon"
  }
}
```

**에러 예시 (MATIC 부족):**

```json
{
  "success": false,
  "error": "TRANSACTION_REVERTED",
  "details": {
    "possibleReasons": ["MATIC 잔액 부족 (가스비)", "DRESS 토큰 잔액 부족"]
  }
}
```

---

### ✅ **5. Dress → DP Token Swap (1:5)**

**목적:** Dress Token을 DP Token으로 자동 교환 (1:5 비율)

**워크플로우:**

1. **API #4**로 Dress Token을 플랫폼 어드민 지갑으로 전송
   - 받는 주소: `0x2C686C46D3622d60CCAbEfb757158c8904312871`
2. 전송 완료 후 **트랜잭션 해시** 복사 (Polygonscan에서 확인 가능)
3. `5. Dress → DP Token Swap` 요청 선택
4. **Body** 탭:
   ```json
   {
     "txHash": "0xdef123...",
     "fromAddress": "0x58D7E7BdE42764199FCd99FDa6866bBccd773feF"
   }
   ```
5. **Send** 클릭

**예상 응답:**

```json
{
  "success": true,
  "message": "Dress Token 100 DRESS → DP Token 500 DP 스왑이 완료되었습니다.",
  "data": {
    "swap": {
      "dressAmount": "100",
      "dpAmount": "500",
      "swapRate": 5
    },
    "polygon": {
      "txHash": "0xdef123...",
      "blockNumber": 52345678
    },
    "besu": {
      "txHash": "0xabc987...",
      "blockNumber": 12345
    }
  }
}
```

**에러 예시 (잘못된 주소로 전송):**

```json
{
  "success": false,
  "error": "INVALID_RECIPIENT",
  "details": {
    "expected": "0x2C686C46D3622d60CCAbEfb757158c8904312871",
    "actual": "0xWrongAddress..."
  }
}
```

**💡 Tip:**

- **인증 불필요** (트랜잭션 해시로 검증)
- 100 DRESS → 500 DP
- 1 DRESS → 5 DP
- 0.5 DRESS → 2.5 DP

---

## 🔑 **localStorage 데이터 가져오기**

MPC 전송 API (#3, #4)는 `storedWalletData`가 필요합니다.

### 브라우저에서 가져오기:

1. **브라우저 개발자 도구** 열기 (F12)
2. **Console 탭**
3. 아래 코드 실행:

```javascript
const walletData = localStorage.getItem("mpcWalletData");
console.log(JSON.parse(walletData));
```

4. 출력된 값을 복사:

   ```json
   {
     "uid": "user123",
     "wid": 1,
     "sid": "0x58D7E7BdE42764199FCd99FDa6866bBccd773feF",
     "pvencstr": "encrypted_string...",
     "encryptDevicePassword": "encrypted_password..."
   }
   ```

5. **Postman Environment Variables**에 각각 저장

---

## 🎯 **추천 워크플로우**

### 시나리오 1: DP Token 전송 (Besu)

```
1. Faucet → DP 토큰 받기 (10 DP)
2. DP Token 전송 → 다른 주소로 전송 (1 DP)
```

### 시나리오 2: Dress Token 전송 (Polygon)

```
1. Dress Token 잔액 조회 → DRESS & MATIC 확인
2. (필요시) MATIC 충전 → 최소 0.1 MATIC
3. Dress Token 전송 → 다른 주소로 전송 (1 DRESS)
```

### 시나리오 3: Dress → DP Token Swap 🔄

```
1. Dress Token 잔액 조회 → DRESS & MATIC 확인
2. Dress Token 전송 → 플랫폼 어드민 지갑으로 (예: 100 DRESS)
3. 트랜잭션 해시 복사
4. Swap API 호출 → 자동으로 500 DP 받기! 🎉
```

---

## 🔗 **관련 문서**

- [에러 가이드](../docs/POLYGON_DRESS_TOKEN_TRANSFER_ERRORS.md)
- [에러 핸들링 요약](../docs/POLYGON_ERROR_HANDLING_SUMMARY.md)
- [API 문서](../README.md)

---

## 📊 **네트워크 정보**

| Network               | Chain ID | RPC URL                    | Gas Fee    |
| --------------------- | -------- | -------------------------- | ---------- |
| **Besu** (Private)    | 1337     | `https://besu.dressdio.me` | 0 (무료)   |
| **Polygon** (Mainnet) | 137      | `https://polygon-rpc.com`  | MATIC 필요 |

---

## 🛠️ **트러블슈팅**

### ❌ "지갑 주소를 찾을 수 없습니다."

→ `accessToken`이 유효한지 확인

### ❌ "장치 비밀번호가 올바르지 않습니다."

→ `devicePassword`를 정확히 입력

### ❌ "가스비(MATIC)가 부족합니다."

→ Polygon 지갑에 최소 0.1 MATIC 추가

### ❌ "Polygon 네트워크 연결에 실패했습니다."

→ 서버의 `.env` 파일에서 `POLYGON_RPC_URL` 확인

---

## 💡 **팁**

1. **Environment Variables 사용** → 매번 토큰 입력 불필요
2. **잔액 조회 먼저** → 전송 전 항상 확인
3. **테스트는 Besu에서** → 가스비 0이므로 무료
4. **Polygon은 신중히** → MATIC 가스비 발생

---

## 📮 **문의**

문제가 발생하면 서버 로그를 확인하세요:

```bash
tail -f logs/combined.log | grep "POLYGON\|DP_TOKEN"
```

**Happy Testing!** 🎉
