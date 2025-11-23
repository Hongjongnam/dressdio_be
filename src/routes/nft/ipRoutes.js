const express = require("express");
const router = express.Router();
const ipController = require("../../controllers/nft/ipController");
const auth = require("../../middleware/auth");
const { upload } = require("../../services/upload"); // upload.js에서 가져오도록 수정

/**
 * @swagger
 * /api/nft/ip/mint:
 *   post:
 *     summary: IP NFT 발행
 *     tags: [IP NFT]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - devicePassword
 *               - storedWalletData
 *               - ipfsImage
 *               - name
 *               - description
 *               - price
 *               - supplyPrice
 *               - creatorType
 *             properties:
 *               devicePassword:
 *                 type: string
 *                 example: device123
 *               storedWalletData:
 *                 $ref: '#/components/schemas/StoredWalletData'
 *               ipfsImage:
 *                 type: string
 *                 example: ipfs://Qm...
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: string
 *               supplyPrice:
 *                 type: string
 *               creatorType:
 *                 type: string
 *                 enum: [brand, creator, designer]
 *     responses:
 *       200:
 *         description: IP NFT 발행 성공
 */
router.post("/mint", auth, ipController.mintIpNft);

/**
 * @swagger
 * /api/nft/ip/list:
 *   get:
 *     summary: 전체 IP NFT 목록 조회
 *     tags: [IP NFT]
 *     responses:
 *       200:
 *         description: 목록 조회 성공
 */
router.get("/list", ipController.getAllIpNfts);

/**
 * @swagger
 * /api/nft/ip/my:
 *   get:
 *     summary: 내 IP NFT 목록 조회
 *     tags: [IP NFT]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 목록 조회 성공
 */
router.get("/my", auth, ipController.getMyIpNfts);

/**
 * @swagger
 * /api/nft/ip/info/{tokenId}:
 *   get:
 *     summary: IP NFT 정보 조회
 *     tags: [IP NFT]
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 정보 조회 성공
 */
router.get("/info/:tokenId", ipController.getIpNftInfo);

/**
 * @swagger
 * /api/nft/ip/minting-fee:
 *   get:
 *     summary: 현재 민팅 수수료 조회
 *     tags: [IP NFT]
 *     responses:
 *       200:
 *         description: 수수료 조회 성공
 */
router.get("/minting-fee", ipController.getMintingFee);

/**
 * @swagger
 * /api/nft/ip/set-minting-fee:
 *   post:
 *     summary: 민팅 수수료 변경
 *     tags: [IP NFT]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - devicePassword
 *               - storedWalletData
 *               - newFee
 *             properties:
 *               devicePassword:
 *                 type: string
 *               storedWalletData:
 *                 $ref: '#/components/schemas/StoredWalletData'
 *               newFee:
 *                 type: string
 *                 example: "10"
 *     responses:
 *       200:
 *         description: 수수료 변경 성공
 */
router.post("/set-minting-fee", auth, ipController.setMintingFee);

/**
 * @swagger
 * /api/nft/ip/upload-image:
 *   post:
 *     summary: IP NFT 이미지 업로드 (IPFS)
 *     tags: [IP NFT]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: 이미지 업로드 성공
 */
router.post(
  "/upload-image",
  auth,
  upload.single("image"),
  ipController.uploadImage
);

module.exports = router;
