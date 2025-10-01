# 🚀 Blockchain Utils APIs - Quick Start Guide

**5개 API - 최종 버전**

---

## 📦 **Import**

1. Postman 열기
2. **Import** 버튼 클릭
3. `postman/Blockchain_Utils_APIs.json` 선택
4. Import 완료!

---

## ⚙️ **Variables 설정**

### **필수 변수 (Collection Variables):**

| Variable                | 예시 값                   | 설명                                   |
| ----------------------- | ------------------------- | -------------------------------------- |
| `baseUrl`               | `http://localhost:5000`   | API 서버 주소                          |
| `accessToken`           | `eyJraWQiOiIyNCIsInR5...` | ABC Wallet JWT                         |
| `uid`                   | `b24c837a6e9e43c8...`     | MPC 지갑 사용자 ID                     |
| `wid`                   | `1`                       | MPC 지갑 ID (**숫자만, 따옴표 없음!**) |
| `senderAddress`         | `0x58D7E7BdE...`          | 전송자 지갑 주소 (sid)                 |
| `recipientAddress`      | `0x25D96413E6...`         | 받는 지갑 주소                         |
| `pvencstr`              | `encrypted_key...`        | 암호화된 개인키                        |
| `encryptDevicePassword` | `encrypted_pw...`         | 암호화된 장치 비밀번호                 |
| `devicePassword`        | `your-password`           | **평문** 장치 비밀번호                 |

### **MPC 데이터 가져오기:**

브라우저에서 `http://localhost:5000` 접속 → F12 → Console:

```javascript
console.log(JSON.parse(localStorage.getItem("MpcWalletData")));
```

출력된 데이터를 Postman Variables에 복사:

- `uid` → `uid`
- `wid` → `wid` (숫자만!)
- `sid` → `senderAddress`
- `pvencstr` → `pvencstr`
- `encryptDevicePassword` → `encryptDevicePassword`

---

## 📝 **API 사용 방법**

### **1️⃣ Dress Token 잔액 조회**

```
GET /api/utils/dress-token/balance
Header: Authorization: Bearer {{accessToken}}
```

**필요한 변수:**

- `accessToken`

**응답:**

```json
{
  "data": {
    "token": { "balance": "10000.0" },
    "matic": { "balance": "0.5" }
  }
}
```

---

### **2️⃣ Faucet (DP 토큰 받기)**

```
POST /api/utils/faucet
Body: {
  "walletAddress": "{{recipientAddress}}",
  "amount": "100"
}
```

**필요한 변수:**

- `recipientAddress`

**특징:**

- 인증 불필요
- 수량 제한 없음

---

### **3️⃣ DP Token 전송**

```
POST /api/utils/dp-token/transfer
Header: Authorization: Bearer {{accessToken}}
Body: {
  "to": "{{recipientAddress}}",
  "amount": "1",
  "devicePassword": "{{devicePassword}}",
  "storedWalletData": { ... }
}
```

**필요한 변수:**

- `accessToken`
- `recipientAddress`
- `devicePassword` (평문!)
- MPC 데이터 전체

**⚠️ 주의:**

- `wid`는 **숫자** (따옴표 없음!)

---

### **4️⃣ Dress Token 전송 (스마트)**

```
POST /api/utils/dress-token/transfer
Header: Authorization: Bearer {{accessToken}}
Body: {
  "to": "{{recipientAddress}}",
  "amount": "1",
  "devicePassword": "{{devicePassword}}",
  "storedWalletData": { ... }
}
```

**스마트 로직:**

- **일반 주소** → 전송만
- **플랫폼 지갑** (`0x2C686C...312871`) → 전송 + 자동 스왑!

**검증:**

- ✅ Transfer 이벤트 파싱
- ✅ 블록체인 데이터 기준 (입력값 무시)
- ✅ 실제 전송 금액 × 5 = DP

---

### **5️⃣ Dress Token 전송 + 자동 스왑**

```
POST /api/utils/dress-token/transfer-and-swap
Header: Authorization: Bearer {{accessToken}}
Body: {
  "amount": "1",
  "devicePassword": "{{devicePassword}}",
  "storedWalletData": { ... }
}
```

**특징:**

- ✅ **`to` 파라미터 불필요!** (자동 플랫폼 지갑)
- ✅ **원클릭 스왑**
- ✅ **완전 검증** (Transfer 이벤트)

**응답:**

```json
{
  "message": "✅ 완료! 1 DRESS → 5 DP 스왑이 완료되었습니다.",
  "data": {
    "summary": { "dressAmount": "1", "dpAmount": "5" },
    "polygon": { "txHash": "0xabc..." },
    "besu": { "txHash": "0xdef..." }
  }
}
```

---

## 🐛 **Troubleshooting**

### **❌ "v cannot have leading zeroes"**

**원인:** `wid` 변수가 문자열로 설정됨

**해결:**

```
Variables 탭에서 wid 값을:
❌ "1"  → ✅ 1  (따옴표 제거!)
```

---

### **❌ "INVALID_DEVICE_PASSWORD"**

**원인:** `devicePassword`가 잘못되거나 암호화된 값 사용

**해결:**

- `devicePassword`는 **평문** (지갑 생성 시 사용한 원본 비밀번호)
- `encryptDevicePassword`와 혼동하지 마세요!

---

### **❌ "INSUFFICIENT_GAS" (Polygon)**

**원인:** MATIC 잔액 부족

**해결:**

1. API #1로 MATIC 잔액 확인
2. 최소 0.1 MATIC 충전
3. 재시도

---

## 🎯 **빠른 테스트 순서**

### **Besu 네트워크 (DP Token):**

```
1. API #2 (Faucet) → DP 100개 받기
2. API #3 (DP Transfer) → DP 1개 전송 테스트
```

### **Polygon 네트워크 (Dress Token):**

```
1. API #1 (Balance) → DRESS & MATIC 잔액 확인
2. API #4 (Dress Transfer) → 친구에게 DRESS 전송
3. API #5 (통합 스왑) → 플랫폼 스왑 (1 DRESS → 5 DP)
```

---

## 💡 **API 선택 가이드**

| 목적                     | 추천 API |
| ------------------------ | -------- |
| DRESS 잔액 확인          | API #1   |
| DP 받기 (테스트)         | API #2   |
| DP 전송하기              | API #3   |
| 친구에게 DRESS 전송      | API #4   |
| 플랫폼 스왑 (DRESS → DP) | API #5   |

---

## 📊 **API #4 vs API #5**

| 항목              | API #4                  | API #5           |
| ----------------- | ----------------------- | ---------------- |
| **받는 주소**     | 직접 입력               | 자동 (플랫폼)    |
| **스왑**          | 조건부 (플랫폼 지갑 시) | 무조건           |
| **사용 시나리오** | 범용 전송               | 플랫폼 스왑 전용 |
| **편의성**        | ⭐⭐                    | ⭐⭐⭐           |

**둘 다 Transfer 이벤트 검증으로 안전합니다!** 🛡️

---

## 🎉 **완료!**

이제 Postman에서 5개 API를 모두 테스트할 수 있습니다!

**파일:** `postman/Blockchain_Utils_APIs.json`
