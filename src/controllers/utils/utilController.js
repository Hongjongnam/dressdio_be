const {
  web3,
  dpTokenContract,
  dressdioAdminAccount,
} = require("../../config/web3");

// POST /api/utils/faucet
exports.faucet = async (req, res) => {
  try {
    const { address } = req.body;
    if (!address || !web3.utils.isAddress(address)) {
      return res
        .status(400)
        .json({ success: false, message: "유효한 지갑 주소를 입력하세요." });
    }

    // 10 DP (10 * 10^18 wei)
    const amount = web3.utils.toWei("10", "ether");

    // 트랜잭션 데이터 생성 (ERC20 transfer)
    const data = dpTokenContract.methods.transfer(address, amount).encodeABI();

    // 최신 web3 및 EIP-1559 호환 트랜잭션 옵션
    const gas = 100000;
    const gasPrice = await web3.eth.getGasPrice();

    const tx = {
      from: dressdioAdminAccount.address,
      to: dpTokenContract.options.address,
      data,
      gas: web3.utils.toHex(gas),
      gasPrice: web3.utils.toHex(gasPrice),
    };

    // 서명 및 전송
    const signed = await web3.eth.accounts.signTransaction(
      tx,
      dressdioAdminAccount.privateKey
    );
    const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);

    return res.json({
      success: true,
      txHash: receipt.transactionHash,
      message: "DP 토큰이 성공적으로 지급되었습니다.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
