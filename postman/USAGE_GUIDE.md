# 📮 Blockchain Utils API - Postman 사용 가이드

## 🚀 **Import 방법**

1. Postman 열기
2. **Import** 버튼 클릭
3. `postman/Blockchain_Utils_Collection_v2.json` 선택
4. Import 완료!

---

## ⚙️ **Environment Variables 설정**

### **1단계: Collection Variables 설정**

Import 후, Collection의 **Variables** 탭에서 다음 값들을 설정하세요:

| Variable                | Type    | 설명                           | 예시                                         |
| ----------------------- | ------- | ------------------------------ | -------------------------------------------- |
| `baseUrl`               | default | API 서버 주소                  | `http://localhost:5000`                      |
| `accessToken`           | secret  | ABC Wallet JWT                 | `eyJraWQiOiIyNCIsInR5...`                    |
| `uid`                   | default | MPC 지갑 사용자 ID             | `b24c837a6e9e43c8aee4c4238bcc3660`           |
| `wid`                   | default | MPC 지갑 ID (**숫자만**)       | `1` (따옴표 없음!)                           |
| `senderAddress`         | default | 전송자 지갑 주소 (sid)         | `0x78bBD87Ad705C67837CD5616995E1d67B36693c3` |
| `recipientAddress`      | default | 받는 지갑 주소                 | `0x25D96413E62A8A51eB31fd12fFA281Ca9c86A029` |
| `pvencstr`              | secret  | 암호화된 개인키                | `encrypted_private_key_string...`            |
| `encryptDevicePassword` | secret  | 암호화된 장치 비밀번호         | `encrypted_device_password...`               |
| `devicePassword`        | secret  | **평문** 장치 비밀번호         | `your-plain-password`                        |
| `polygonTxHash`         | default | Polygon 트랜잭션 해시 (Swap용) | `0xdef123...`                                |

---

## 📝 **각 API 사용 방법**

### **1. Dress Token 잔액 조회 (Polygon)**

**필요한 변수:**

- `accessToken`

**설정 방법:**

1. Variables 탭에서 `accessToken` 값 입력
2. **Send** 클릭

**응답 예시:**

```json
{
  "success": true,
  "message": "Dress Token 잔액을 성공적으로 조회했습니다.",
  "data": {
    "walletAddress": "0x78bBD8...",
    "token": {
      "name": "Dress",
      "symbol": "DRESS",
      "balance": "10000.0"
    },
    "matic": {
      "balance": "0.5",
      "warning": null
    }
  }
}
```

---

### **2. Faucet (DP 토큰 받기)**

**필요한 변수:**

- 없음 (Body에 직접 입력)

**Body 수정:**

```json
{
  "walletAddress": "받을 지갑 주소",
  "amount": "10"
}
```

**특징:**

- 인증 불필요
- Besu 네트워크 (가스비 0)

---

### **3. DP Token 전송 (Besu, MPC)** ⚠️ **중요!**

**필요한 변수:**

- `accessToken`
- `recipientAddress` (받는 주소)
- `uid`
- `wid` (**숫자만, 따옴표 없음!**)
- `senderAddress` (sid)
- `pvencstr`
- `encryptDevicePassword`
- `devicePassword` (**평문 비밀번호**)

**Body 구조 (자동 변수 적용됨):**

```json
{
  "to": "{{recipientAddress}}",
  "amount": "1",
  "devicePassword": "{{devicePassword}}",
  "storedWalletData": {
    "uid": "{{uid}}",
    "wid": {{wid}},  // ← 숫자 (따옴표 없음!)
    "sid": "{{senderAddress}}",
    "pvencstr": "{{pvencstr}}",
    "encryptDevicePassword": "{{encryptDevicePassword}}"
  }
}
```

**⚠️ 주의사항:**

1. **`wid`는 숫자 타입** → Variables에서 `1`로 입력 (따옴표 없음)
2. **`devicePassword`는 평문** → 지갑 생성 시 사용한 원본 비밀번호
3. **모든 MPC 데이터 필요** → localStorage의 `MpcWalletData`에서 복사

**MPC 데이터 가져오는 방법:**

1. 브라우저에서 `http://localhost:5000` 접속
2. F12 → Console 탭
3. 입력:
   ```javascript
   console.log(JSON.parse(localStorage.getItem("MpcWalletData")));
   ```
4. 출력된 데이터를 Postman Variables에 복사

---

### **4. Dress Token 전송 (Polygon, MPC)**

**필요한 변수:**

- API #3과 동일

**차이점:**

- Polygon 네트워크 (EIP-1559)
- **MATIC 가스비 필요** (최소 0.1 MATIC 권장)
- API #1로 사전에 MATIC 잔액 확인 필수

**자동 스왑 기능:**

- `to`를 `0x2C686C46D3622d60CCAbEfb757158c8904312871`로 설정
- 전송 후 자동으로 DRESS × 5배의 DP Token 받기 가능 (HTML UI에서)

---

### **5. Dress → DP Token Swap (1:5)**

**필요한 변수:**

- `polygonTxHash` (API #4 실행 후 받은 트랜잭션 해시)
- `senderAddress` (전송한 지갑 주소)

**Body:**

```json
{
  "txHash": "{{polygonTxHash}}",
  "fromAddress": "{{senderAddress}}"
}
```

**프로세스:**

1. API #4로 Dress Token을 `0x2C686C46D3622d60CCAbEfb757158c8904312871`로 전송
2. 응답에서 `data.txHash` 복사
3. Variables의 `polygonTxHash`에 붙여넣기
4. API #5 실행
5. ✅ DRESS × 5배의 DP Token 자동 지급!

**특징:**

- 인증 불필요 (트랜잭션 해시로 검증)
- 플랫폼 어드민 지갑으로 전송된 트랜잭션만 유효
- 1 DRESS → 5 DP (고정 비율)

---

## 🐛 **문제 해결 (Troubleshooting)**

### **❌ Error: "v cannot have leading zeroes"**

**원인:** `wid` 변수가 문자열로 설정됨

**해결:**

```json
// ❌ 잘못된 예
"wid": "1"

// ✅ 올바른 예
"wid": 1  // 따옴표 없음!
```

Variables 탭에서 `wid` 값을 **따옴표 없이** `1`로만 입력하세요.

---

### **❌ Error: "INVALID_DEVICE_PASSWORD"**

**원인:** `devicePassword`가 암호화된 값이거나 잘못됨

**해결:**

- `devicePassword`는 **평문** (지갑 생성 시 사용한 원본 비밀번호)
- `encryptDevicePassword`와 혼동하지 마세요!

---

### **❌ Error: "INSUFFICIENT_GAS" (Polygon)**

**원인:** MATIC 잔액 부족

**해결:**

1. API #1로 MATIC 잔액 확인
2. 최소 0.1 MATIC 필요
3. MATIC 충전 후 재시도

---

### **❌ Error: "모든 지갑 데이터 필드를 입력해주세요"**

**원인:** MPC 지갑 데이터 중 일부 누락

**해결:**
다음 변수들이 모두 설정되었는지 확인:

- `uid`
- `wid`
- `senderAddress` (sid)
- `pvencstr`
- `encryptDevicePassword`

---

## 💡 **Tips**

### **1. Environment 대신 Collection Variables 사용**

- 더 간단하고 빠름
- Import 시 자동으로 포함됨

### **2. 변수 자동 완성**

- Body에서 `{{` 입력 시 변수 목록 표시됨
- 자동 완성으로 입력 가능

### **3. 여러 지갑 테스트**

- Environment를 여러 개 만들어 지갑별 데이터 저장
- 예: `Wallet_1`, `Wallet_2`, `Wallet_Test`

### **4. 빠른 테스트 순서**

```
1. API #2 (Faucet) → DP 토큰 받기
2. API #3 (DP Transfer) → DP 토큰 전송 테스트
3. API #1 (Balance) → MATIC 잔액 확인
4. API #4 (Dress Transfer) → Dress 토큰 전송
5. API #5 (Swap) → Dress → DP 스왑
```

---

## 📞 **문제 발생 시**

1. **서버 로그 확인**: `npm run dev` 터미널 확인
2. **Variables 확인**: Collection Variables 탭에서 모든 값 설정 확인
3. **Body 구조 확인**: `storedWalletData` 구조가 올바른지 확인
4. **wid 타입 확인**: 숫자인지 (따옴표 없음) 확인

---

## 🎉 **완료!**

이제 Postman에서 모든 Blockchain Utils API를 테스트할 수 있습니다!
