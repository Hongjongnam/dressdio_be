const pinataSDK = require("@pinata/sdk");
const streamifier = require("streamifier");

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

module.exports = {
  uploadJSONToIPFS,
  uploadFileToIPFS,
};
