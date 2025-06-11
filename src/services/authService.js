const axios = require("axios");
const qs = require("qs");
const logger = require("../utils/logger");
const crypto = require("crypto");
const CryptoJS = require("crypto-js");

class AuthService {
  constructor() {
    // ABC Waas API 설정
    this.abcBaseUrl = process.env.BASEURL; // https://api.waas.myabcwallet.com
    this.abcServiceId = process.env.SERVICE_ID; // https://mw.myabcwallet.com
    this.abcClientId = process.env.CLIENT_ID; // brbx1Woq4SsaWLURbCMcCu
    this.abcClientSecret = process.env.CLIENT_SECRET; // 8928TSzgAgybRIkXCle4Nva1UJHWl5AF89jSnA4e16s4
    this.abcSecureChannelMessage = process.env.SECURE_CHANNEL_MESSAGE; // TltFNwBoHjDRESSDIOCtsWLADTZl
    this.abcDevicePassword = process.env.DEVICE_PASSWORD; // for_Dressdio

    // Futuresense API 설정
    this.fsBaseUrl = process.env.API_BASE_URL || "https://fs.dressdio.me";

    // 필수 환경 변수 검증
    this.validateEnvVariables();

    // API 설정 로깅
    logger.info("AuthService initialized with settings:", {
      abcBaseUrl: this.abcBaseUrl,
      abcServiceId: this.abcServiceId,
      fsBaseUrl: this.fsBaseUrl,
    });
  }

  /**
   * 환경 변수 검증
   * @throws {Error} 필수 환경 변수가 없는 경우
   */
  validateEnvVariables() {
    const requiredVars = {
      BASEURL: this.abcBaseUrl,
      SERVICE_ID: this.abcServiceId,
      CLIENT_ID: this.abcClientId,
      CLIENT_SECRET: this.abcClientSecret,
      SECURE_CHANNEL_MESSAGE: this.abcSecureChannelMessage,
      DEVICE_PASSWORD: this.abcDevicePassword,
      API_BASE_URL: this.fsBaseUrl,
    };

    const missingVars = Object.entries(requiredVars)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
    }
  }

  /**
   * ABC API 요청 헤더 생성
   * @returns {Object} API 요청 헤더
   */
  getAbcHeaders(contentType = "application/x-www-form-urlencoded") {
    const headers = {
      "Content-Type": contentType,
      serviceid: this.abcServiceId,
      clientid: this.abcClientId,
      clientsecret: this.abcClientSecret,
    };

    logger.debug("Generated ABC API headers:", {
      serviceid: this.abcServiceId,
      clientid: this.abcClientId,
      // clientsecret은 보안상 로깅하지 않음
    });

    return headers;
  }

  /**
   * 사용자 존재 여부 확인 (ABC API)
   * @param {string} email - 확인할 이메일 주소
   * @returns {Promise<boolean>} 사용자 존재 여부
   * @throws {Error} API 호출 실패 시
   */
  async isUserExists(email) {
    try {
      if (!email) {
        throw new Error("Email is required");
      }

      // ABC Wallet API 엔드포인트 수정
      const requestUrl = `${this.abcBaseUrl}/member/user-management/users/${email}?serviceid=${this.abcServiceId}`;

      // 요청 정보 로깅
      const requestConfig = {
        headers: this.getAbcHeaders(),
        validateStatus: function (status) {
          return status < 500;
        },
      };

      logger.debug("Checking user existence - Request details:", {
        url: requestUrl,
        method: "GET",
        headers: requestConfig.headers,
      });

      // API 요청
      const response = await axios.get(requestUrl, requestConfig);

      // 응답 정보 로깅
      logger.debug("ABC API response details:", {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers,
        config: {
          url: response.config.url,
          method: response.config.method,
          headers: response.config.headers,
        },
      });

      // 606 에러 코드는 사용자가 존재함을 의미
      if (response.status === 404 && response.data?.code === 606) {
        logger.info(`User exists: ${email}`);
        return true;
      }

      // 다른 에러의 경우
      if (response.status !== 200) {
        logger.error("ABC API request failed:", {
          url: requestUrl,
          status: response.status,
          data: response.data,
          headers: response.headers,
          config: response.config,
        });
        throw new Error(
          response.data.message ||
            `Failed to check user existence: ${response.status} ${response.statusText}`
        );
      }

      logger.info(`User does not exist: ${email}`);
      return false;
    } catch (error) {
      // 에러 상세 정보 로깅
      logger.error("Error checking user existence:", {
        email,
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code,
        },
        response: error.response
          ? {
              status: error.response.status,
              statusText: error.response.statusText,
              data: error.response.data,
              headers: error.response.headers,
            }
          : null,
        request: error.config
          ? {
              url: error.config.url,
              method: error.config.method,
              headers: error.config.headers,
            }
          : null,
      });

      if (error.response) {
        throw new Error(
          `ABC API error: ${error.response.status} ${
            error.response.statusText
          } - ${error.response.data?.message || error.message}`
        );
      } else if (error.request) {
        throw new Error(`No response received from ABC API: ${error.message}`);
      } else {
        throw new Error(`Failed to check user existence: ${error.message}`);
      }
    }
  }

  /**
   * 이메일 인증 코드 전송 (ABC API)
   * @param {string} email - 인증 코드를 받을 이메일 주소
   * @param {string} lang - 언어 설정 (예: 'ko', 'en')
   * @param {string} template - 이메일 템플릿 (예: 'default')
   * @throws {Error} API 호출 실패 시
   */
  async sendVerificationCode(email, lang = "ko", template = "default") {
    try {
      if (!email) {
        throw new Error("Email is required");
      }

      // ABC Wallet API 엔드포인트
      const requestUrl = `${this.abcBaseUrl}/member/mail-service/${email}/sendcode`;

      // URL 파라미터 추가
      const url = new URL(requestUrl);
      url.searchParams.append("lang", lang);
      url.searchParams.append("template", template);

      // 요청 정보 로깅
      logger.debug("Sending verification code - Request details:", {
        url: url.toString(),
        method: "GET",
        params: {
          lang,
          template,
        },
      });

      // API 요청
      const response = await axios.get(url.toString());

      // 응답 정보 로깅
      logger.debug("ABC API response details:", {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers,
      });

      if (response.status !== 200) {
        logger.error("ABC API request failed:", {
          url: url.toString(),
          status: response.status,
          data: response.data,
          headers: response.headers,
        });
        throw new Error(
          response.data.message ||
            `Failed to send verification code: ${response.status} ${response.statusText}`
        );
      }

      logger.info(`Verification code sent to ${email}`);
    } catch (error) {
      // 에러 상세 정보 로깅
      logger.error("Error sending verification code:", {
        email,
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code,
        },
        response: error.response
          ? {
              status: error.response.status,
              statusText: error.response.statusText,
              data: error.response.data,
              headers: error.response.headers,
            }
          : null,
        request: error.config
          ? {
              url: error.config.url,
              method: error.config.method,
              headers: error.config.headers,
              params: error.config.params,
            }
          : null,
      });

      if (error.response) {
        throw new Error(
          error.response.data.msg ||
            `ABC API error: ${error.response.status} ${error.response.statusText}`
        );
      } else if (error.request) {
        throw new Error(`No response received from ABC API: ${error.message}`);
      } else {
        throw new Error(`Failed to send verification code: ${error.message}`);
      }
    }
  }

  /**
   * 이메일 인증 코드 검증 (ABC API)
   * @param {string} email - 이메일 주소
   * @param {string} code - 검증할 인증 코드
   * @throws {Error} API 호출 실패 시
   */
  async verifyCode(email, code) {
    try {
      if (!email || !code) {
        throw new Error("Email and code are required");
      }

      // ABC Wallet API 엔드포인트
      const requestUrl = `${this.abcBaseUrl}/member/mail-service/${email}/verifycode`;

      // 요청 데이터 준비
      const formData = qs.stringify({
        code: code,
        serviceid: this.abcServiceId,
      });

      // 요청 정보 로깅
      logger.debug("Verifying code - Request details:", {
        url: requestUrl,
        method: "POST",
        data: formData,
      });

      // API 요청
      const response = await axios.post(requestUrl, formData, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      // 응답 정보 로깅
      logger.debug("ABC API response details:", {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers,
      });

      if (response.status !== 200) {
        logger.error("ABC API request failed:", {
          url: requestUrl,
          status: response.status,
          data: response.data,
          headers: response.headers,
        });
        throw new Error(
          response.data.message ||
            `Failed to verify code: ${response.status} ${response.statusText}`
        );
      }

      logger.info(`Code verification successful for ${email}`);
    } catch (error) {
      // 에러 상세 정보 로깅
      logger.error("Error verifying code:", {
        email,
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code,
        },
        response: error.response
          ? {
              status: error.response.status,
              statusText: error.response.statusText,
              data: error.response.data,
              headers: error.response.headers,
            }
          : null,
        request: error.config
          ? {
              url: error.config.url,
              method: error.config.method,
              headers: error.config.headers,
              data: error.config.data,
            }
          : null,
      });

      if (error.response) {
        throw new Error(
          error.response.data.msg ||
            `ABC API error: ${error.response.status} ${error.response.statusText}`
        );
      } else if (error.request) {
        throw new Error(`No response received from ABC API: ${error.message}`);
      } else {
        throw new Error(`Failed to verify code: ${error.message}`);
      }
    }
  }

  /**
   * 회원가입
   * @param {Object} userData - 회원가입 정보
   * @throws {Error} API 호출 실패 시
   */
  async registerUser(userData) {
    try {
      logger.debug("Starting user registration:", {
        email: userData.email,
        hasPassword: !!userData.password,
        passwordType: typeof userData.password,
        code: userData.code,
        channelId: userData.channelId,
      });

      // 1. 입력 데이터 검증
      if (!userData.email || !userData.password || !userData.code) {
        logger.error("Missing required fields:", {
          email: !!userData.email,
          password: !!userData.password,
          code: !!userData.code,
        });
        throw new Error("Email, password, and code are required");
      }

      // 2. 비밀번호 타입 검증
      if (typeof userData.password !== "string") {
        logger.error("Invalid password type:", {
          type: typeof userData.password,
          isObject: typeof userData.password === "object",
          isNull: userData.password === null,
          isUndefined: userData.password === undefined,
        });
        throw new Error("Password must be a string");
      }

      // 3. 요청 데이터 준비
      const requestData = {
        email: userData.email,
        password: userData.password, // 이미 암호화된 비밀번호
        code: userData.code,
        overage: userData.overage || 0,
        agree: userData.agree || 0,
        collect: userData.collect || 0,
        thirdParty: userData.thirdParty || 0,
        advertise: userData.advertise || 0,
        channelId: userData.channelId,
      };

      logger.debug("Registration request data:", {
        email: requestData.email,
        passwordType: typeof requestData.password,
        passwordLength: requestData.password.length,
        code: requestData.code,
        channelId: requestData.channelId,
      });

      // 4. API 요청 설정
      const config = {
        method: "post",
        url: `${this.abcBaseUrl}/member/user-management/users/v2/register`,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        data: requestData,
      };

      logger.debug("Making registration request:", {
        method: config.method,
        url: config.url,
        headers: config.headers,
      });

      // 5. API 호출
      const response = await axios(config);

      logger.debug("Registration response received:", {
        status: response.status,
        statusText: response.statusText,
        hasData: !!response.data,
      });

      // 6. 응답 검증
      if (!response.data || typeof response.data !== "object") {
        logger.error("Invalid registration response:", {
          responseType: typeof response.data,
          isNull: response.data === null,
          isUndefined: response.data === undefined,
        });
        throw new Error("Invalid registration response format");
      }

      // 7. 결과 검증
      if (response.data.code !== 200) {
        logger.error("Registration failed:", {
          code: response.data.code,
          message: response.data.msg,
        });
        throw new Error(response.data.msg || "Registration failed");
      }

      logger.info("User registration completed successfully:", {
        email: userData.email,
      });

      return response.data;
    } catch (error) {
      logger.error("User registration failed:", {
        error: error.message,
        code: error.code,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw error;
    }
  }

  /**
   * 로그인 (ABC API)
   * @param {string} email - 이메일 주소
   * @param {string} password - 비밀번호
   * @returns {Promise<Object>} 로그인 결과
   * @throws {Error} 로그인 실패 시
   */
  async login(email, password) {
    try {
      if (!email || !password) {
        throw new Error("Email and password are required");
      }

      const requestUrl = `${this.abcBaseUrl}/member/user-management/login`;
      const requestBody = { email, password };

      logger.debug("Logging in user:", {
        url: requestUrl,
        email,
      });

      const response = await axios.post(requestUrl, qs.stringify(requestBody), {
        headers: this.getAbcHeaders(),
        validateStatus: function (status) {
          return status < 500;
        },
      });

      if (response.status === 404) {
        logger.error("ABC API endpoint not found:", {
          url: requestUrl,
          status: response.status,
          data: response.data,
        });
        throw new Error("ABC API endpoint not found");
      }

      if (response.status !== 200) {
        logger.error("ABC API request failed:", {
          url: requestUrl,
          status: response.status,
          data: response.data,
        });
        throw new Error(response.data.message || "Invalid email or password");
      }

      logger.info(`User logged in successfully: ${email}`);
      return {
        success: true,
        message: "Login successful",
        data: response.data,
      };
    } catch (error) {
      logger.error("Error logging in:", {
        email,
        error: error.message,
        stack: error.stack,
        response: error.response?.data,
      });
      throw new Error(error.message || "Failed to login");
    }
  }

  /**
   * 키쌍 생성 함수
   * @returns {Object} 생성된 키페어
   */
  generateKeyPair() {
    try {
      const ecdh = crypto.createECDH("prime256v1");
      ecdh.generateKeys();

      return {
        privateKey: ecdh,
        publicKey: ecdh,
      };
    } catch (error) {
      logger.error("Key pair generation failed:", {
        error: error.message,
        code: error.code,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 공개키 생성 함수
   * @param {string} publicKeyPem - PEM 형식의 공개키
   * @returns {string} hex 형식의 공개키
   */
  generatePublicKey(publicKeyPem) {
    try {
      // PEM 형식의 공개키를 Buffer로 변환
      const publicKeyBuffer = Buffer.from(publicKeyPem, "utf8");

      // 공개키를 hex 형식으로 변환
      const publicKeyHex = publicKeyBuffer.toString("hex");

      return publicKeyHex;
    } catch (error) {
      logger.error("Public key generation failed:", {
        error: error.message,
        code: error.code,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 보안 채널 생성
   * @returns {Promise<Object>} 보안 채널 정보
   * @throws {Error} API 호출 실패 시
   */
  async createSecureChannel() {
    try {
      logger.debug("Creating secure channel - Starting process");

      // 환경 변수 로깅
      logger.debug("Environment variables:", {
        baseUrl: process.env.BASEURL,
        serviceId: process.env.SERVICE_ID,
        clientId: process.env.CLIENT_ID,
        hasClientSecret: !!process.env.CLIENT_SECRET,
        secureChannelMessage: process.env.SECURE_CHANNEL_MESSAGE,
      });

      // 1. 키쌍 생성
      const keyPair = this.generateKeyPair();
      logger.debug("Key pair generated:", {
        hasPrivateKey: !!keyPair.privateKey,
        hasPublicKey: !!keyPair.publicKey,
      });

      // 2. 요청 데이터 구성
      const requestData = {
        pubkey: keyPair.publicKey.getPublicKey("hex"),
        plain: process.env.SECURE_CHANNEL_MESSAGE,
      };

      logger.debug("Creating secure channel - Request details:", {
        url: `${process.env.BASEURL}/secure/channel/create`,
        hasPubKey: !!requestData.pubkey,
        hasPlain: !!requestData.plain,
        pubKeyLength: requestData.pubkey?.length,
        plainLength: requestData.plain?.length,
      });

      // 3. API 요청
      const response = await axios.post(
        `${process.env.BASEURL}/secure/channel/create`,
        qs.stringify(requestData),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          validateStatus: function (status) {
            return status < 500;
          },
        }
      );

      // 4. 응답 검증
      if (response.status !== 200) {
        logger.error("Secure channel creation failed:", {
          status: response.status,
          data: response.data,
          headers: response.headers,
        });
        throw new Error(
          `Failed to create secure channel: ${
            response.status
          } - ${JSON.stringify(response.data)}`
        );
      }

      // 5. 응답 데이터 로깅
      logger.debug("Secure channel created successfully:", {
        channelId: response.data.channelid,
        hasEncrypted: !!response.data.encrypted,
        hasServerPublicKey: !!response.data.publickey,
      });

      // 6. 결과 반환
      return {
        ChannelID: response.data.channelid,
        Encrypted: response.data.encrypted,
        ServerPublicKey: response.data.publickey,
        Message: process.env.SECURE_CHANNEL_MESSAGE,
        PrivateKey: keyPair.privateKey.getPrivateKey("hex"),
      };
    } catch (error) {
      logger.error("Secure channel creation failed:", {
        error: error.message,
        code: error.code,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 암호화
   * @param {string} secureChannel - 보안 채널
   * @param {string} message - 암호화할 메시지
   * @returns {Promise<string>} 암호화된 메시지
   * @throws {Error} 암호화 실패 시
   */
  async encrypt(secureChannel, message) {
    try {
      logger.debug("Starting message encryption:", {
        hasSecureChannel: !!secureChannel,
        hasMessage: !!message,
        secureChannelKeys: secureChannel ? Object.keys(secureChannel) : [],
      });

      if (!secureChannel || typeof secureChannel !== "object") {
        logger.error("Invalid secure channel for encryption:", {
          secureChannel: secureChannel,
        });
        throw new Error("Secure channel must be a valid object");
      }

      const { block, iv } = this.getAESCipher(
        secureChannel.PrivateKey,
        secureChannel.ServerPublicKey
      );

      const messageWordArray = CryptoJS.enc.Utf8.parse(message);

      const encMsg = CryptoJS.AES.encrypt(
        messageWordArray,
        CryptoJS.enc.Hex.parse(block.toString("hex")),
        {
          iv: CryptoJS.enc.Hex.parse(iv.toString("hex")),
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7,
        }
      );

      logger.debug("Password encrypted successfully");
      return encMsg.toString();
    } catch (error) {
      logger.error("Encryption failed:", {
        error: error.message,
        code: error.code,
        stack: error.stack,
      });
      throw error;
    }
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
const authService = new AuthService();
module.exports = authService;
