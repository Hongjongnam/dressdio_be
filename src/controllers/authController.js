const register = async (req, res) => {
  try {
    // 환경 변수 로깅
    logger.debug("Environment variables in register:", {
      baseUrl: process.env.BASEURL,
      serviceId: process.env.SERVICE_ID,
      clientId: process.env.CLIENT_ID,
      hasClientSecret: !!process.env.CLIENT_SECRET,
      secureChannelMessage: process.env.SECURE_CHANNEL_MESSAGE,
    });

    // 1. 요청 데이터 검증
    console.log("=== Register function input ===");
    console.log("req.body:", req.body);
    console.log("typeof password:", typeof req.body.password);
    console.log("password value:", req.body.password);
    console.log("Is password object?", typeof req.body.password === "object");
    console.log("Password field exists?", "password" in req.body);
    console.log("Request body keys:", Object.keys(req.body));

    logger.debug("Register request body:", {
      body: req.body,
      bodyType: typeof req.body,
      bodyKeys: Object.keys(req.body),
      passwordField: req.body.password,
      passwordType: typeof req.body.password,
      passwordValue: req.body.password,
      isObject: typeof req.body.password === "object",
      isNull: req.body.password === null,
      isUndefined: req.body.password === undefined,
    });

    // 2. 요청 본문 구조 검증
    if (!req.body || typeof req.body !== "object") {
      logger.error("Invalid request body:", {
        body: req.body,
        type: typeof req.body,
      });
      return res.status(400).json({
        status: "failed",
        message: "Invalid request body",
      });
    }

    const {
      email,
      password,
      code,
      overage,
      agree,
      collect,
      thirdParty,
      advertise,
    } = req.body;

    // 3. 비밀번호 필드 검증
    console.log("=== Password field validation ===");
    console.log("Password field:", password);
    console.log("Password type:", typeof password);
    console.log("Password value:", password);
    console.log("Is password object?", typeof password === "object");
    console.log("Is password null?", password === null);
    console.log("Is password undefined?", password === undefined);
    console.log("Is password string?", typeof password === "string");

    logger.debug("Password field validation:", {
      passwordField: password,
      passwordType: typeof password,
      passwordValue: password,
      isObject: typeof password === "object",
      isNull: password === null,
      isUndefined: password === undefined,
    });

    // 4. 필수 필드 검증
    if (!email || !password || !code) {
      logger.error("Missing required fields:", {
        email: !!email,
        password: !!password,
        code: !!code,
        emailType: typeof email,
        passwordType: typeof password,
        codeType: typeof code,
      });
      return res.status(400).json({
        status: "failed",
        message: "Email, password, and code are required",
      });
    }

    // 5. 비밀번호 유효성 검사
    if (typeof password !== "string") {
      logger.error("Invalid password type:", {
        type: typeof password,
        value: password,
        isObject: typeof password === "object",
        isNull: password === null,
        isUndefined: password === undefined,
      });
      return res.status(400).json({
        status: "failed",
        message: "Password must be a string",
      });
    }

    logger.debug("Register request data:", {
      email,
      password: "***",
      code,
      overage,
      agree,
      collect,
      thirdParty,
      advertise,
    });

    // 6. 보안 채널 생성
    const secureChannelRes = await authService.createSecureChannel();
    if (!secureChannelRes || !secureChannelRes.ChannelID) {
      logger.error("Failed to create secure channel:", {
        response: secureChannelRes,
        hasChannelId: !!secureChannelRes?.ChannelID,
      });
      throw new Error("Failed to create secure channel");
    }

    logger.debug("Secure channel created:", {
      channelId: secureChannelRes.ChannelID,
      hasServerPublicKey: !!secureChannelRes.ServerPublicKey,
      hasPrivateKey: !!secureChannelRes.PrivateKey,
      secureChannelKeys: Object.keys(secureChannelRes),
    });

    // 7. 비밀번호 암호화
    console.log("=== Starting password encryption ===");
    console.log("Password to encrypt:", password);
    console.log("Password type:", typeof password);
    console.log("Secure Channel:", {
      channelId: secureChannelRes.ChannelID,
      hasServerPublicKey: !!secureChannelRes.ServerPublicKey,
      hasPrivateKey: !!secureChannelRes.PrivateKey,
      secureChannelKeys: Object.keys(secureChannelRes),
    });

    let encryptedPassword;
    try {
      // 암호화 함수 호출 - await 추가 및 인자 순서 수정
      encryptedPassword = await authService.encrypt(
        secureChannelRes, // 첫 번째 인자: 보안 채널 객체
        password // 두 번째 인자: 암호화할 비밀번호
      );

      console.log("=== Encryption result ===");
      console.log("Result:", {
        type: typeof encryptedPassword,
        value: encryptedPassword,
      });

      // 암호화 결과 검증
      if (!encryptedPassword || typeof encryptedPassword !== "string") {
        throw new Error("Password encryption failed");
      }

      logger.debug("Password encrypted successfully");
    } catch (error) {
      logger.error("Password encryption failed:", {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        status: "failed",
        message: "Password encryption failed",
        error: error.message,
      });
    }

    // 8. 회원가입 요청
    const registerData = {
      email,
      password: encryptedPassword,
      code,
      overage: overage ? 1 : 0,
      agree: agree ? 1 : 0,
      collect: collect ? 1 : 0,
      thirdParty: thirdParty ? 1 : 0,
      advertise: advertise ? 1 : 0,
      channelId: secureChannelRes.ChannelID,
    };

    // registerData 검증
    if (typeof registerData.password !== "string") {
      logger.error("Invalid register data password type:", {
        type: typeof registerData.password,
        value: registerData.password,
        isObject: typeof registerData.password === "object",
        isNull: registerData.password === null,
        isUndefined: registerData.password === undefined,
      });
      throw new Error("Invalid register data password type");
    }

    // registerUser 호출 전 상세 로깅
    console.log("=== Calling registerUser ===");
    console.log("Email:", registerData.email);
    console.log("Password type:", typeof registerData.password);
    console.log("Password length:", registerData.password.length);
    console.log("Code:", registerData.code);
    console.log("Channel ID:", registerData.channelId);
    console.log(
      "Is password string?",
      typeof registerData.password === "string"
    );

    logger.debug("Calling registerUser with data:", {
      email: registerData.email,
      passwordType: typeof registerData.password,
      passwordLength: registerData.password.length,
      code: registerData.code,
      channelId: registerData.channelId,
    });

    // registerUser 호출 전 최종 검증
    if (!registerData.email || !registerData.password || !registerData.code) {
      logger.error("Missing required fields in register data:", {
        email: !!registerData.email,
        password: !!registerData.password,
        code: !!registerData.code,
      });
      throw new Error("Missing required fields in register data");
    }

    // registerUser 호출
    await authService.registerUser(registerData);

    // registerUser 호출 후 로깅
    console.log("=== registerUser call completed ===");
    logger.debug("registerUser call completed successfully");

    logger.info(`User registered successfully: ${email}`);
    res.json({ status: "success", message: "User registered successfully" });
  } catch (error) {
    console.error("=== Registration error ===");
    console.error("Error:", error);
    console.error("Error stack:", error.stack);
    console.error("Error type:", error.constructor.name);

    logger.error("ABC Wallet API registration failed:", {
      error: error.message,
      stack: error.stack,
      errorType: error.constructor.name,
    });
    res.status(500).json({
      status: "failed",
      message: "Failed to register with ABC Wallet",
      error: error.message,
    });
  }
};
