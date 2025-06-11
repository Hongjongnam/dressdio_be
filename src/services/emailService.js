const axios = require("axios");
const logger = require("../utils/logger");

class EmailService {
  constructor() {
    this.baseUrl = process.env.BASEURL;
    this.serviceId = process.env.SERVICE_ID;

    if (!this.baseUrl) {
      throw new Error("BASEURL environment variable is not set");
    }
  }

  /**
   * 인증 코드 이메일 발송
   * @param {string} email - 수신자 이메일 주소
   * @param {string} [lang='ko'] - 이메일 언어 설정
   * @param {string} [template='default'] - 이메일 템플릿
   * @returns {Promise<boolean>} 이메일 발송 성공 여부
   */
  async sendVerificationEmail(email, lang = "ko", template = "default") {
    try {
      if (!email) {
        throw new Error("Email address is required");
      }

      const url = new URL(
        `${this.baseUrl}/member/mail-service/${email}/sendcode`
      );
      url.searchParams.append("lang", lang);
      url.searchParams.append("template", template);

      await axios.get(url.toString());
      logger.info(`Verification email sent successfully to ${email}`);
      return true;
    } catch (error) {
      logger.error("Failed to send verification email:", {
        email,
        error: error.message,
        stack: error.stack,
      });
      return false;
    }
  }
}

module.exports = new EmailService();
