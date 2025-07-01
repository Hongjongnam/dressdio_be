const pinataSDK = require("@pinata/sdk");
const streamifier = require("streamifier");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Pinata API keys (환경변수로 관리하는 것이 안전합니다)
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;

const pinata = new pinataSDK(PINATA_API_KEY, PINATA_SECRET_API_KEY);

/**
 * Uploads a JSON object to Pinata (IPFS)
 * @param {Object} jsonData
 * @returns {Promise<string>} ipfs:// URI
 */
async function uploadJSONToIPFS(jsonData) {
  try {
    const result = await pinata.pinJSONToIPFS(jsonData);
    return `ipfs://${result.IpfsHash}`;
  } catch (err) {
    console.error("❌ Error uploading JSON to IPFS:", err);
    throw new Error("Failed to upload to IPFS");
  }
}

/**
 * Uploads a file buffer to Pinata (IPFS)
 * @param {Buffer} fileBuffer
 * @param {string} fileName
 * @returns {Promise<string>} ipfs:// URI
 */
async function uploadFileToIPFS(fileBuffer, fileName) {
  const readableStream = streamifier.createReadStream(fileBuffer);

  const options = {
    pinataMetadata: {
      name: fileName,
    },
    pinataOptions: {
      cidVersion: 0,
    },
  };

  try {
    const result = await pinata.pinFileToIPFS(readableStream, options);
    return `ipfs://${result.IpfsHash}`;
  } catch (err) {
    console.error("❌ Error uploading file to IPFS:", err);
    throw new Error("Failed to upload file to IPFS");
  }
}

/**
 * Uploads a base64 image buffer to Pinata (IPFS) via temp file for correct Content-Type
 * @param {string} base64 - base64 string (순수 base64)
 * @param {string} fileName - 파일명 (확장자 포함)
 * @param {string} mimeType - 예: 'image/png'
 * @returns {Promise<string>} ipfs:// URI
 */
async function uploadBase64ImageToIPFS(
  base64,
  fileName,
  mimeType = "image/png"
) {
  const buffer = Buffer.from(base64, "base64");
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, fileName);
  fs.writeFileSync(tempPath, buffer);
  try {
    const ipfsUri = await uploadFileToIPFS(fs.readFileSync(tempPath), fileName);
    return ipfsUri;
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch (e) {}
  }
}

module.exports = {
  uploadJSONToIPFS,
  uploadFileToIPFS,
  uploadBase64ImageToIPFS,
};
