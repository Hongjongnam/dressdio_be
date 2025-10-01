# Polygon Dress Token 전송 에러 가이드

## 🔍 에러 코드별 해결 방법

### 1. `INSUFFICIENT_GAS` - 가스비(MATIC) 부족

**에러 메시지:**

```json
{
  "success": false,
  "message": "가스비(MATIC)가 부족합니다. Polygon 네트워크에서 트랜잭션을 전송하려면 MATIC이 필요합니다.",
  "error": "INSUFFICIENT_GAS",
  "details": {
    "network": "Polygon",
    "requiredToken": "MATIC",
    "fromAddress": "0x...",
    "suggestion": "지갑에 최소 0.1 MATIC을 추가해주세요."
  }
}
```

**해결 방법:**

1. Polygon 네트워크에서 MATIC을 해당 지갑 주소로 전송
2. 필요 수량: 최소 **0.1 MATIC** (여유 있게)
3. MATIC 구매처: Binance, Coinbase, KuCoin 등

**예상 가스비:**

- 일반 ERC20 전송: 약 0.001-0.01 MATIC (약 $0.01-0.10)

---

### 2. `INSUFFICIENT_TOKEN_BALANCE` - Dress 토큰 잔액 부족

**에러 메시지:**

```json
{
  "success": false,
  "message": "Dress 토큰 잔액이 부족합니다.",
  "error": "INSUFFICIENT_TOKEN_BALANCE",
  "details": {
    "token": "DRESS",
    "network": "Polygon",
    "fromAddress": "0x...",
    "requestedAmount": "100"
  }
}
```

**해결 방법:**

1. Dress 토큰 잔액 확인
2. 부족하면 추가 구매 또는 전송 받기

---

### 3. `TRANSACTION_REVERTED` - 트랜잭션 실패

**에러 메시지:**

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
    "fromAddress": "0x...",
    "network": "Polygon"
  }
}
```

**해결 방법:**

1. **MATIC 잔액 확인** (가장 흔한 원인)
2. **Dress 토큰 잔액 확인**
3. 컨트랙트 상태 확인 (Polygonscan)

---

### 4. `NETWORK_ERROR` - RPC 연결 실패

**에러 메시지:**

```json
{
  "success": false,
  "message": "Polygon 네트워크 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
  "error": "NETWORK_ERROR",
  "details": {
    "network": "Polygon",
    "rpcUrl": "https://polygon-rpc.com"
  }
}
```

**해결 방법:**

1. 잠시 후 다시 시도 (RPC 일시적 과부하)
2. `.env` 파일에서 다른 RPC URL로 변경:
   ```bash
   POLYGON_RPC_URL=https://polygon-mainnet.public.blastapi.io
   ```

**추천 RPC URLs:**

- `https://polygon-rpc.com` (공식)
- `https://polygon-mainnet.public.blastapi.io` (Chainstack)
- `https://rpc-mainnet.matic.quiknode.pro` (QuickNode)

---

### 5. `INVALID_DEVICE_PASSWORD` - 장치 비밀번호 오류

**에러 메시지:**

```json
{
  "success": false,
  "message": "장치 비밀번호가 올바르지 않습니다.",
  "error": "INVALID_DEVICE_PASSWORD"
}
```

**해결 방법:**

1. 지갑 생성 시 사용한 비밀번호 확인
2. localStorage의 암호화된 비밀번호 확인

---

### 6. `NONCE_ERROR` - 트랜잭션 순서 오류

**에러 메시지:**

```json
{
  "success": false,
  "message": "트랜잭션 순서 오류입니다. 이전 트랜잭션이 완료될 때까지 기다려주세요.",
  "error": "NONCE_ERROR"
}
```

**해결 방법:**

1. 이전 트랜잭션이 완료될 때까지 대기 (30초~1분)
2. Polygonscan에서 트랜잭션 상태 확인

---

### 7. `SIGNING_FAILED` - 서명 실패

**에러 메시지:**

```json
{
  "success": false,
  "message": "트랜잭션 서명에 실패했습니다.",
  "error": "SIGNING_FAILED"
}
```

**해결 방법:**

1. ABC Wallet WaaS API 상태 확인
2. localStorage의 지갑 데이터 확인
3. 서버 로그 확인

---

## 🔧 디버깅 팁

### 1. MATIC 잔액 확인

```bash
curl -X POST https://polygon-rpc.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"eth_getBalance",
    "params":["YOUR_ADDRESS","latest"],
    "id":1
  }'
```

### 2. Dress Token 잔액 확인

```bash
curl -X POST https://polygon-rpc.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"eth_call",
    "params":[{
      "to":"0x5Fc44144218353584FC36Aaa3C0C401348870230",
      "data":"0x70a08231000000000000000000000000YOUR_ADDRESS"
    },"latest"],
    "id":1
  }'
```

### 3. 서버 로그 확인

```bash
tail -f logs/combined.log | grep "POLYGON"
```

---

## 📊 체크리스트

전송하기 전에 확인하세요:

- [ ] **MATIC 잔액** 최소 0.1 MATIC 이상
- [ ] **Dress Token 잔액** 충분한지 확인
- [ ] **올바른 받는 주소** (0x로 시작하는 42자 주소)
- [ ] **장치 비밀번호** 정확한지 확인
- [ ] **네트워크 연결** RPC URL 작동 확인

---

## 🔗 유용한 링크

- **Polygonscan**: https://polygonscan.com/
- **Dress Token 컨트랙트**: https://polygonscan.com/token/0x5Fc44144218353584FC36Aaa3C0C401348870230
- **Polygon Gas Tracker**: https://polygonscan.com/gastracker
- **Polygon Faucet** (테스트넷): https://faucet.polygon.technology/

---

## 🚀 성공 사례

**성공적인 응답:**

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

**Polygonscan에서 확인:**
`https://polygonscan.com/tx/YOUR_TX_HASH`
