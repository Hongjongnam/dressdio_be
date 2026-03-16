const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "DressDio API Documentation",
      version: "1.0.0",
      description:
        "DressDio 플랫폼 API 문서 - 블록체인 기반 패션 크리에이터 플랫폼",
      contact: {
        name: "DressDio Support",
        email: "support@dressdio.me",
      },
      license: {
        name: "ISC",
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || "https://fs.dressdio.me",
        description: "Production server",
      },
      {
        url: "http://localhost:5000",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT 토큰을 입력하세요. 예: Bearer {token}",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "Error description" },
            error: { type: "string", example: "Detailed error message" },
          },
        },
        Success: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Operation completed successfully" },
            data: { type: "object" },
          },
        },
        StoredWalletData: {
          type: "object",
          properties: {
            uid: {
              type: "string",
              example: "a5a9b9a4-54be-4692-8046-4855ecd6d0f0",
            },
            wid: { type: "number", example: 805 },
            sid: {
              type: "string",
              example: "0x78bBD87Ad705C67837CD5616995E1d67B36693c3",
            },
            pvencstr: {
              type: "string",
              example: "UBxpgNm4ZDFNLxXv7fU2Tu4gTTaWZZWOEtX8G8sERvYAlFN5C",
            },
            encryptDevicePassword: {
              type: "string",
              example: "JjTdTKiAa0rWVkEGzAehxFa0cEr3EeyewFyJ1hsmu8E=",
            },
            ucpubkey: { type: "string", nullable: true, example: null },
            ourpubkey: { type: "string", nullable: true, example: null },
          },
        },
      },
    },
    tags: [
      { name: "Auth", description: "인증 관련 API" },
      { name: "SBT", description: "Soulbound Token 관련 API" },
      { name: "IP NFT", description: "IP NFT 관련 API" },
      { name: "Merchandise", description: "Merchandise NFT 관련 API" },
      { name: "Platform", description: "플랫폼 관리 API" },
      { name: "Utils", description: "유틸리티 API" },
    ],
  },
  apis: ["./src/routes/**/*.js", "./src/controllers/**/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

const swaggerSetup = (app) => {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "DressDio API Documentation",
    })
  );

  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
};

module.exports = { swaggerSetup, swaggerSpec };

