/***************************************
 * EMAIL OTP AUTH SERVICE (STANDALONE)
 * Deploy as a separate Apps Script Web App.
 ***************************************/

const CONFIG = {
  SPREADSHEET_ID: "1lQvRoXPzdUxcoh4H9NYpvH5Vbrl_miMkSBl-Ks5sM2s",
  APP_NAME: "Aishaura Microgreens",
  SECRET_SEED: "REPLACE_WITH_LONG_RANDOM_SECRET",
  ENABLE_TEST_APIS: true,
   OTP_MAX_ATTEMPTS: 5,
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  SESSION_EXPIRY_DAYS: 1,
  USERS_SHEET: "Users",
  OTP_SHEET: "OtpCodes",
  SESSIONS_SHEET: "Secession"
};

const USERS_COLUMNS = [
  "Created At",
  "User ID",
  "Email",
  "Name",
  "Phone",
  "Referral Code",
  "Referred By Code",
  "Referred By User ID",
  "Referred At",
  "Referral Count",
  "Last Referred At",
  "Status",
  "Last Login At"
];

const OTP_COLUMNS = [
  "Timestamp",
  "OTP ID",
  "Email",
  "OTP Hash",
  "OTP Salt",
  "Expires At",
  "Attempts",
  "Max Attempts",
  "Used",
  "Used At",
  "Request IP"
];

const SESSIONS_COLUMNS = [
  "Issued At",
  "Session ID",
  "User ID",
  "Email",
  "Session Hash",
  "Expires At",
  "Revoked",
  "Revoked At",
  "Last Seen At"
];

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "health").toLowerCase();

    if (action === "health") {
      setupAuthSheets();
      return jsonResponse_({
        status: "success",
        service: "email-otp-auth",
        sheets_ready: true,
        timestamp: new Date().toISOString()
      });
    }

    if (action === "setup_auth_sheets" || action === "setup") {
      setupAuthSheets();
      return jsonResponse_({
        status: "success",
        message: "Auth sheets and columns are ready",
        sheets: [CONFIG.USERS_SHEET, CONFIG.OTP_SHEET, CONFIG.SESSIONS_SHEET]
      });
    }

    return jsonResponse_({
      status: "error",
      message: "This login service link is working. Please continue from the website Login button.",
      availableActions: ["health", "setup_auth_sheets"]
    });
  } catch (error) {
    return jsonResponse_({ status: "error", message: error.message || String(error) });
  }
}

function doPost(e) {
  try {
    const params = extractParams_(e);
    const action = String(params.action || "").trim().toLowerCase();

    if (!action) {
      return jsonResponse_({
        status: "error",
        message: "We could not understand this request. Please try again from the website Login button."
      });
    }

    if (action === "setup_auth_sheets" || action === "setup") {
      setupAuthSheets();
      return jsonResponse_({
        status: "success",
        message: "Auth sheets and columns are ready",
        sheets: [CONFIG.USERS_SHEET, CONFIG.OTP_SHEET, CONFIG.SESSIONS_SHEET]
      });
    }

    // Always prepare sheet structure before processing auth logic.
    setupAuthSheets();
    assertConfigReady_();

    if (action === "request_otp") {
      return jsonResponse_(requestOtp_(params, e));
    }

    if (action === "check_user") {
      return jsonResponse_(checkUser_(params));
    }

    if (action === "validate_referral") {
      return jsonResponse_(validateReferral_(params));
    }

    if (action === "verify_otp") {
      return jsonResponse_(verifyOtp_(params));
    }

    if (action === "test_request_otp") {
      return jsonResponse_(testRequestOtpApi_(params));
    }

    if (action === "test_verify_otp") {
      return jsonResponse_(testVerifyOtpApi_(params));
    }

    if (action === "test_create_user") {
      return jsonResponse_(testCreateUserApi_(params));
    }

    if (action === "test_full_flow") {
      return jsonResponse_(testFullFlowApi_(params));
    }

    if (action === "me") {
      return jsonResponse_(getCurrentUser_(params));
    }

    if (action === "logout") {
      return jsonResponse_(logout_(params));
    }

    return jsonResponse_({
      status: "error",
      message: "This request type is not supported here. Please use the website login flow and try again.",
      availableActions: [
        "setup_auth_sheets",
        "check_user",
        "validate_referral",
        "request_otp",
        "verify_otp",
        "test_request_otp",
        "test_verify_otp",
        "test_create_user",
        "test_full_flow",
        "me",
        "logout"
      ]
    });
  } catch (error) {
    return jsonResponse_({
      status: "error",
      message: error.message || String(error)
    });
  }
}

function doOptions() {
  return ContentService.createTextOutput("");
}

function setupAuthSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  ensureSheetHeaders_(ss, CONFIG.USERS_SHEET, USERS_COLUMNS);
  ensureSheetHeaders_(ss, CONFIG.OTP_SHEET, OTP_COLUMNS);
  ensureSheetHeaders_(ss, CONFIG.SESSIONS_SHEET, SESSIONS_COLUMNS);
  SpreadsheetApp.flush();
}

function requestOtp_(params, eventObj) {
  const now = new Date();
  const email = normalizeEmail_(params.email);
  const name = String(params.name || "").trim();

  if (!isValidEmail_(email)) {
    return { status: "error", message: "Invalid email address" };
  }

  const otpCtx = getSheetContext_(CONFIG.OTP_SHEET);
  const latest = findLatestRowByValue_(otpCtx, "Email", email);

  if (latest) {
    const latestUsed = toBool_(latest.record["Used"]);
    const latestTs = asDate_(latest.record["Timestamp"]);
    const latestExpires = asDate_(latest.record["Expires At"]);

    if (!latestUsed && latestTs && latestExpires && latestExpires.getTime() > now.getTime()) {
      const secondsSinceLast = Math.floor((now.getTime() - latestTs.getTime()) / 1000);
      if (secondsSinceLast < CONFIG.OTP_RESEND_COOLDOWN_SECONDS) {
        return {
          status: "error",
          message: "Please wait before requesting another OTP",
          retry_after_seconds: CONFIG.OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLast
        };
      }
    }
  }

  const otp = generateOtp_();
  const otpSalt = randomToken_();
  const otpHash = buildOtpHash_(email, otp, otpSalt);
  const expiresAt = new Date(now.getTime() + CONFIG.OTP_EXPIRY_MINUTES * 60 * 1000);

  const otpRow = {
    "Timestamp": now,
    "OTP ID": generateOtpId_(),
    "Email": email,
    "OTP Hash": otpHash,
    "OTP Salt": otpSalt,
    "Expires At": expiresAt,
    "Attempts": 0,
    "Max Attempts": CONFIG.OTP_MAX_ATTEMPTS,
    "Used": false,
    "Used At": "",
    "Request IP": getClientIp_(eventObj)
  };

  appendRow_(otpCtx, otpRow);
  const insertedRow = otpCtx.sheet.getLastRow();

  try {
    sendOtpEmail_(email, otp, name);
  } catch (mailError) {
    markOtpUsed_(otpCtx, insertedRow);
    return {
      status: "error",
      message: "Unable to send OTP now. Please try again in a few minutes."
    };
  }

  return {
    status: "success",
    message: "OTP sent to email",
    expires_in_seconds: CONFIG.OTP_EXPIRY_MINUTES * 60
  };
}

function checkUser_(params) {
  const email = normalizeEmail_(params.email);
  if (!isValidEmail_(email)) {
    return { status: "error", message: "Invalid email address" };
  }

  const usersCtx = getSheetContext_(CONFIG.USERS_SHEET);
  const existing = findLatestRowByValue_(usersCtx, "Email", email);

  if (!existing) {
    return {
      status: "success",
      exists: false,
      email: email
    };
  }

  return {
    status: "success",
    exists: true,
    email: email,
    user: {
      user_id: String(existing.record["User ID"] || ""),
      email: String(existing.record["Email"] || ""),
      name: String(existing.record["Name"] || ""),
      has_name: isReasonableName_(existing.record["Name"]),
      phone: String(existing.record["Phone"] || ""),
      referral_code: normalizeReferralCode_(existing.record["Referral Code"]),
      referred_by_code: normalizeReferralCode_(existing.record["Referred By Code"]),
      referral_count: toInt_(existing.record["Referral Count"], 0),
      status: String(existing.record["Status"] || "ACTIVE")
    }
  };
}

function validateReferral_(params) {
  const referralCode = normalizeReferralCode_(params.referral_code || params.code);
  const email = normalizeEmail_(params.email || "");

  if (!referralCode) {
    return { status: "error", message: "Please enter a referral code." };
  }

  if (!isValidReferralCodeFormat_(referralCode)) {
    return { status: "error", message: "Referral code format is invalid." };
  }

  const usersCtx = getSheetContext_(CONFIG.USERS_SHEET);
  const referrerRow = findUserByReferralCode_(usersCtx, referralCode);
  if (!referrerRow) {
    return { status: "error", message: "Referral code not found. Please check and try again." };
  }
  const referrerStatus = String(referrerRow.record["Status"] || "ACTIVE").trim().toUpperCase();
  if (referrerStatus !== "ACTIVE") {
    return { status: "error", message: "This referral code is not active right now." };
  }

  const referrerEmail = normalizeEmail_(referrerRow.record["Email"]);
  if (email && referrerEmail && email === referrerEmail) {
    return { status: "error", message: "You cannot use your own referral code." };
  }

  return {
    status: "success",
    valid: true,
    referral_code: referralCode,
    referrer: {
      user_id: String(referrerRow.record["User ID"] || ""),
      name: String(referrerRow.record["Name"] || ""),
      referral_code: normalizeReferralCode_(referrerRow.record["Referral Code"])
    }
  };
}

function verifyOtp_(params) {
  const now = new Date();
  const email = normalizeEmail_(params.email);
  const otpInput = String(params.otp || "").trim();
  const name = sanitizeName_(params.name);
  const phone = String(params.phone || "").trim();
  const authMode = String(params.auth_mode || "auto").trim().toLowerCase();
  const referralCode = normalizeReferralCode_(params.referral_code || "");

  if (!isValidEmail_(email)) {
    return { status: "error", message: "Invalid email address" };
  }

  if (!/^\d{6}$/.test(otpInput)) {
    return { status: "error", message: "OTP must be 6 digits" };
  }

  if (authMode !== "auto" && authMode !== "signin" && authMode !== "signup") {
    return { status: "error", message: "Invalid auth_mode. Use signin, signup, or auto." };
  }

  const usersCtx = getSheetContext_(CONFIG.USERS_SHEET);
  const existingUser = findLatestRowByValue_(usersCtx, "Email", email);

  if (authMode === "signin" && !existingUser) {
    return { status: "error", message: "No account found for this email. Please sign up first." };
  }

  if (authMode === "signup" && existingUser) {
    return { status: "error", message: "Account already exists. Please sign in instead." };
  }

  if (authMode === "signup" && !isReasonableName_(name)) {
    return { status: "error", message: "Please enter your full name for sign up." };
  }

  if (referralCode && !isValidReferralCodeFormat_(referralCode)) {
    return { status: "error", message: "Referral code format is invalid." };
  }

  let referrerRow = null;
  if (authMode === "signup" && referralCode) {
    referrerRow = findUserByReferralCode_(usersCtx, referralCode);
    if (!referrerRow) {
      return { status: "error", message: "Referral code not found. Please check and try again." };
    }
    const referrerStatus = String(referrerRow.record["Status"] || "ACTIVE").trim().toUpperCase();
    if (referrerStatus !== "ACTIVE") {
      return { status: "error", message: "This referral code is not active right now." };
    }
    const referrerEmail = normalizeEmail_(referrerRow.record["Email"]);
    if (referrerEmail === email) {
      return { status: "error", message: "You cannot use your own referral code." };
    }
  }

  const otpCtx = getSheetContext_(CONFIG.OTP_SHEET);
  const latest = findLatestOpenOtp_(otpCtx, email);

  if (!latest) {
    return { status: "error", message: "No active OTP found for this email" };
  }

  const maxAttempts = toInt_(latest.record["Max Attempts"], CONFIG.OTP_MAX_ATTEMPTS);
  let attempts = toInt_(latest.record["Attempts"], 0);
  const expiresAt = asDate_(latest.record["Expires At"]);

  if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
    markOtpUsed_(otpCtx, latest.rowNumber);
    return { status: "error", message: "OTP has expired. Please request a new OTP." };
  }

  if (attempts >= maxAttempts) {
    markOtpUsed_(otpCtx, latest.rowNumber);
    return { status: "error", message: "OTP attempts exceeded. Please request a new OTP." };
  }

  const expectedHash = buildOtpHash_(email, otpInput, String(latest.record["OTP Salt"] || ""));
  const isValid = expectedHash === String(latest.record["OTP Hash"] || "");

  if (!isValid) {
    attempts += 1;
    otpCtx.sheet.getRange(latest.rowNumber, otpCtx.map["Attempts"]).setValue(attempts);

    if (attempts >= maxAttempts) {
      markOtpUsed_(otpCtx, latest.rowNumber);
    }

    return {
      status: "error",
      message: "Invalid OTP",
      attempts_remaining: Math.max(maxAttempts - attempts, 0)
    };
  }

  markOtpUsed_(otpCtx, latest.rowNumber);
  const isNewUser = !existingUser;
  const user = upsertUser_(email, name, phone, {
    auth_mode: authMode,
    referral_code: referralCode,
    referrer_row: referrerRow
  });
  const session = createSession_(user);

  return {
    status: "success",
    message: "Login successful",
    auth_mode: authMode,
    is_new_user: isNewUser,
    session_token: session.sessionToken,
    session_expires_at: session.expiresAt.toISOString(),
    user: user
  };
}

function testRequestOtpApi_(params) {
  assertTestApisEnabled_();
  const now = new Date();
  const email = normalizeEmail_(params.email);

  if (!isValidEmail_(email)) {
    return { status: "error", message: "Invalid email address" };
  }

  const otp = generateOtp_();
  const otpSalt = randomToken_();
  const otpHash = buildOtpHash_(email, otp, otpSalt);
  const expiresAt = new Date(now.getTime() + CONFIG.OTP_EXPIRY_MINUTES * 60 * 1000);
  const otpId = generateOtpId_();
  const otpCtx = getSheetContext_(CONFIG.OTP_SHEET);

  appendRow_(otpCtx, {
    "Timestamp": now,
    "OTP ID": otpId,
    "Email": email,
    "OTP Hash": otpHash,
    "OTP Salt": otpSalt,
    "Expires At": expiresAt,
    "Attempts": 0,
    "Max Attempts": CONFIG.OTP_MAX_ATTEMPTS,
    "Used": false,
    "Used At": "",
    "Request IP": "TEST_API"
  });
  SpreadsheetApp.flush();

  return {
    status: "success",
    message: "Test OTP created (email not sent)",
    email: email,
    otp: otp,
    otp_id: otpId,
    expires_at: expiresAt.toISOString(),
    otp_sheet_last_row: otpCtx.sheet.getLastRow()
  };
}

function testVerifyOtpApi_(params) {
  assertTestApisEnabled_();
  return verifyOtp_({
    email: normalizeEmail_(params.email),
    otp: String(params.otp || "").trim(),
    name: String(params.name || "").trim(),
    phone: String(params.phone || "").trim()
  });
}

function testCreateUserApi_(params) {
  assertTestApisEnabled_();
  const email = normalizeEmail_(params.email);
  const name = sanitizeName_(params.name);
  const phone = String(params.phone || "").trim();
  const shouldCreateSession = String(params.create_session || "true").toLowerCase() !== "false";

  if (!isValidEmail_(email)) {
    return { status: "error", message: "Invalid email address" };
  }

  const user = upsertUser_(email, name, phone);
  const response = {
    status: "success",
    message: "User created/updated for test",
    user: user
  };

  if (shouldCreateSession) {
    const session = createSession_(user);
    response.session_token = session.sessionToken;
    response.session_expires_at = session.expiresAt.toISOString();
  }

  return response;
}

function testFullFlowApi_(params) {
  assertTestApisEnabled_();
  const email = normalizeEmail_(params.email);
  const name = sanitizeName_(params.name);
  const phone = String(params.phone || "").trim();

  if (!isValidEmail_(email)) {
    return { status: "error", message: "Invalid email address" };
  }

  const otpRes = testRequestOtpApi_({ email: email });
  if (otpRes.status !== "success") return otpRes;

  const verifyRes = testVerifyOtpApi_({
    email: email,
    otp: otpRes.otp,
    name: name,
    phone: phone
  });
  if (verifyRes.status !== "success") return verifyRes;

  return {
    status: "success",
    message: "Test full auth flow completed",
    email: email,
    generated_otp: otpRes.otp,
    user: verifyRes.user,
    session_token: verifyRes.session_token,
    session_expires_at: verifyRes.session_expires_at
  };
}

function getCurrentUser_(params) {
  const sessionToken = String(params.session_token || "").trim();
  if (!sessionToken) {
    return { status: "error", message: "Missing session_token" };
  }

  const auth = authenticateSession_(sessionToken, true);
  if (!auth.ok) {
    return { status: "error", message: auth.message };
  }

  return {
    status: "success",
    user: auth.user,
    session_expires_at: auth.session.expiresAt.toISOString()
  };
}

function logout_(params) {
  const sessionToken = String(params.session_token || "").trim();
  if (!sessionToken) {
    return { status: "error", message: "Missing session_token" };
  }

  const sessionsCtx = getSheetContext_(CONFIG.SESSIONS_SHEET);
  const sessionHash = buildSessionHash_(sessionToken);
  const row = findLatestRowByValue_(sessionsCtx, "Session Hash", sessionHash);

  if (!row) {
    return { status: "success", message: "Logged out" };
  }

  const now = new Date();
  sessionsCtx.sheet.getRange(row.rowNumber, sessionsCtx.map["Revoked"]).setValue(true);
  sessionsCtx.sheet.getRange(row.rowNumber, sessionsCtx.map["Revoked At"]).setValue(now);
  if (sessionsCtx.map["Expires At"]) {
    sessionsCtx.sheet.getRange(row.rowNumber, sessionsCtx.map["Expires At"]).setValue(now);
  }
  if (sessionsCtx.map["Last Seen At"]) {
    sessionsCtx.sheet.getRange(row.rowNumber, sessionsCtx.map["Last Seen At"]).setValue(now);
  }

  return { status: "success", message: "Logged out" };
}

function authenticateSession_(sessionToken, updateLastSeen) {
  const now = new Date();
  const sessionsCtx = getSheetContext_(CONFIG.SESSIONS_SHEET);
  const usersCtx = getSheetContext_(CONFIG.USERS_SHEET);
  const sessionHash = buildSessionHash_(sessionToken);
  const sessionRow = findLatestRowByValue_(sessionsCtx, "Session Hash", sessionHash);

  if (!sessionRow) {
    return { ok: false, message: "Invalid session" };
  }

  const revoked = toBool_(sessionRow.record["Revoked"]);
  const expiresAt = asDate_(sessionRow.record["Expires At"]);
  if (revoked || !expiresAt || expiresAt.getTime() <= now.getTime()) {
    return { ok: false, message: "Session expired. Please login again." };
  }

  if (updateLastSeen) {
    sessionsCtx.sheet.getRange(sessionRow.rowNumber, sessionsCtx.map["Last Seen At"]).setValue(now);
  }

  const userId = String(sessionRow.record["User ID"] || "");
  const userRow = findLatestRowByValue_(usersCtx, "User ID", userId);
  if (!userRow) {
    return { ok: false, message: "User not found" };
  }

  return {
    ok: true,
    user: {
      user_id: String(userRow.record["User ID"] || ""),
      email: String(userRow.record["Email"] || ""),
      name: String(userRow.record["Name"] || ""),
      phone: String(userRow.record["Phone"] || ""),
      referral_code: normalizeReferralCode_(userRow.record["Referral Code"]),
      referred_by_code: normalizeReferralCode_(userRow.record["Referred By Code"]),
      referral_count: toInt_(userRow.record["Referral Count"], 0),
      status: String(userRow.record["Status"] || "ACTIVE")
    },
    session: {
      sessionId: String(sessionRow.record["Session ID"] || ""),
      expiresAt: expiresAt
    }
  };
}

function upsertUser_(email, name, phone, options) {
  const now = new Date();
  const usersCtx = getSheetContext_(CONFIG.USERS_SHEET);
  const existing = findLatestRowByValue_(usersCtx, "Email", email);
  const cleanName = sanitizeName_(name);
  const cleanPhone = String(phone || "").trim();
  const opts = options || {};
  const authMode = String(opts.auth_mode || "").trim().toLowerCase();
  const referralCodeInput = normalizeReferralCode_(opts.referral_code || "");
  const referrerRow = opts.referrer_row || null;

  if (!existing) {
    const userId = generateUserId_();
    const ownReferralCode = generateReferralCode_(usersCtx, email);
    const referredByCode = (authMode === "signup" && referralCodeInput && referrerRow)
      ? normalizeReferralCode_(referrerRow.record["Referral Code"] || referralCodeInput)
      : "";
    const referredByUserId = (authMode === "signup" && referralCodeInput && referrerRow)
      ? String(referrerRow.record["User ID"] || "")
      : "";
    const referredAt = referredByCode ? now : "";

    const newUser = {
      "Created At": now,
      "User ID": userId,
      "Email": email,
      "Name": cleanName || email.split("@")[0],
      "Phone": cleanPhone || "",
      "Referral Code": ownReferralCode,
      "Referred By Code": referredByCode,
      "Referred By User ID": referredByUserId,
      "Referred At": referredAt,
      "Referral Count": 0,
      "Last Referred At": "",
      "Status": "ACTIVE",
      "Last Login At": now
    };
    appendRow_(usersCtx, newUser);

    if (referredByCode && referrerRow) {
      incrementReferrerStats_(usersCtx, referrerRow.rowNumber);
    }

    return {
      user_id: newUser["User ID"],
      email: newUser["Email"],
      name: newUser["Name"],
      phone: newUser["Phone"],
      referral_code: newUser["Referral Code"],
      referred_by_code: newUser["Referred By Code"],
      referral_count: 0,
      status: newUser["Status"]
    };
  }

  const currentName = String(existing.record["Name"] || "").trim();
  const currentPhone = String(existing.record["Phone"] || "").trim();
  const currentReferralCode = normalizeReferralCode_(existing.record["Referral Code"]);
  const currentReferredByCode = normalizeReferralCode_(existing.record["Referred By Code"]);
  const currentReferralCount = toInt_(existing.record["Referral Count"], 0);

  const nextName = cleanName || currentName || email.split("@")[0];
  const nextPhone = cleanPhone || currentPhone || "";
  const nextReferralCode = currentReferralCode || generateReferralCode_(usersCtx, email);

  usersCtx.sheet.getRange(existing.rowNumber, usersCtx.map["Name"]).setValue(nextName);
  usersCtx.sheet.getRange(existing.rowNumber, usersCtx.map["Phone"]).setValue(nextPhone);
  if (usersCtx.map["Referral Code"]) {
    usersCtx.sheet.getRange(existing.rowNumber, usersCtx.map["Referral Code"]).setValue(nextReferralCode);
  }
  if (usersCtx.map["Referral Count"]) {
    usersCtx.sheet.getRange(existing.rowNumber, usersCtx.map["Referral Count"]).setValue(currentReferralCount);
  }
  usersCtx.sheet.getRange(existing.rowNumber, usersCtx.map["Status"]).setValue("ACTIVE");
  usersCtx.sheet.getRange(existing.rowNumber, usersCtx.map["Last Login At"]).setValue(now);

  return {
    user_id: String(existing.record["User ID"] || ""),
    email: email,
    name: nextName,
    phone: nextPhone,
    referral_code: nextReferralCode,
    referred_by_code: currentReferredByCode,
    referral_count: currentReferralCount,
    status: "ACTIVE"
  };
}

function createSession_(user) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const sessionToken = randomToken_() + randomToken_();
  const sessionHash = buildSessionHash_(sessionToken);

  const sessionsCtx = getSheetContext_(CONFIG.SESSIONS_SHEET);
  appendRow_(sessionsCtx, {
    "Issued At": now,
    "Session ID": generateSessionId_(),
    "User ID": user.user_id,
    "Email": user.email,
    "Session Hash": sessionHash,
    "Expires At": expiresAt,
    "Revoked": false,
    "Revoked At": "",
    "Last Seen At": now
  });

  return {
    sessionToken: sessionToken,
    expiresAt: expiresAt
  };
}

function sendOtpEmail_(email, otp, name) {
  const displayName = name || "there";
  const subject = CONFIG.APP_NAME + " login code";
  const plainText = [
    "Hello " + displayName + ",",
    "",
    "Your login OTP is: " + otp,
    "This code will expire in " + CONFIG.OTP_EXPIRY_MINUTES + " minutes.",
    "",
    "If you did not request this code, you can ignore this email."
  ].join("\n");

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;">' +
    "<h3>" + escapeHtml_(CONFIG.APP_NAME) + " login code</h3>" +
    "<p>Hello " + escapeHtml_(displayName) + ",</p>" +
    "<p>Your OTP is:</p>" +
    '<p style="font-size:30px;font-weight:700;letter-spacing:4px;margin:14px 0;">' + escapeHtml_(otp) + "</p>" +
    "<p>This code expires in " + CONFIG.OTP_EXPIRY_MINUTES + " minutes.</p>" +
    "<p style=\"color:#666;\">If you did not request this code, you can ignore this email.</p>" +
    "</div>";

  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: plainText,
    htmlBody: htmlBody,
    name: CONFIG.APP_NAME
  });
}

function markOtpUsed_(otpCtx, rowNumber) {
  otpCtx.sheet.getRange(rowNumber, otpCtx.map["Used"]).setValue(true);
  otpCtx.sheet.getRange(rowNumber, otpCtx.map["Used At"]).setValue(new Date());
}

function getSheetContext_(sheetName) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("Missing sheet: " + sheetName + ". Run setupAuthSheets first.");
  }
  const headerValues = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  for (let i = 0; i < headerValues.length; i++) {
    const header = String(headerValues[i] || "").trim();
    if (header) map[header] = i + 1;
  }
  return { sheet: sheet, map: map };
}

function appendRow_(ctx, dataByHeader) {
  const row = [];
  const lastCol = ctx.sheet.getLastColumn();
  const headers = ctx.sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (let i = 0; i < headers.length; i++) {
    const key = String(headers[i] || "").trim();
    row.push(Object.prototype.hasOwnProperty.call(dataByHeader, key) ? dataByHeader[key] : "");
  }
  ctx.sheet.appendRow(row);
}

function findLatestOpenOtp_(otpCtx, email) {
  const lastRow = otpCtx.sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = otpCtx.sheet.getRange(2, 1, lastRow - 1, otpCtx.sheet.getLastColumn()).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const record = rowToRecord_(otpCtx, row);
    if (normalizeEmail_(record["Email"]) !== email) continue;
    if (toBool_(record["Used"])) continue;
    return { rowNumber: i + 2, record: record };
  }
  return null;
}

function findLatestRowByValue_(ctx, columnName, value) {
  if (!ctx.map[columnName]) return null;
  const colIdx = ctx.map[columnName];
  const target = String(value || "").trim().toLowerCase();
  const lastRow = ctx.sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = ctx.sheet.getRange(2, 1, lastRow - 1, ctx.sheet.getLastColumn()).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const cell = String(values[i][colIdx - 1] || "").trim().toLowerCase();
    if (cell === target) {
      return { rowNumber: i + 2, record: rowToRecord_(ctx, values[i]) };
    }
  }
  return null;
}

function findUserByReferralCode_(usersCtx, referralCode) {
  const code = normalizeReferralCode_(referralCode);
  if (!code) return null;
  if (!usersCtx || !usersCtx.map || !usersCtx.map["Referral Code"]) return null;
  return findLatestRowByValue_(usersCtx, "Referral Code", code);
}

function incrementReferrerStats_(usersCtx, referrerRowNumber) {
  if (!usersCtx || !referrerRowNumber) return;
  const now = new Date();

  if (usersCtx.map["Referral Count"]) {
    const countCell = usersCtx.sheet.getRange(referrerRowNumber, usersCtx.map["Referral Count"]);
    const currentCount = toInt_(countCell.getValue(), 0);
    countCell.setValue(Math.max(currentCount, 0) + 1);
  }

  if (usersCtx.map["Last Referred At"]) {
    usersCtx.sheet.getRange(referrerRowNumber, usersCtx.map["Last Referred At"]).setValue(now);
  }
}

function generateReferralCode_(usersCtx, email) {
  const prefix = "AM";
  const safeEmail = normalizeEmail_(email);

  for (let i = 0; i < 16; i++) {
    const entropy = safeEmail + "|" + new Date().getTime() + "|" + Math.random() + "|" + i;
    const candidate = prefix + sha256_(entropy).toUpperCase().slice(0, 8);
    if (!findUserByReferralCode_(usersCtx, candidate)) {
      return candidate;
    }
  }

  return prefix + randomToken_().toUpperCase().slice(0, 8);
}

function rowToRecord_(ctx, rowValues) {
  const record = {};
  for (const key in ctx.map) {
    if (Object.prototype.hasOwnProperty.call(ctx.map, key)) {
      record[key] = rowValues[ctx.map[key] - 1];
    }
  }
  return record;
}

function ensureSheetHeaders_(ss, sheetName, expectedHeaders) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const hasAnyHeader = sheet.getLastRow() >= 1 && sheet.getLastColumn() >= 1;
  if (!hasAnyHeader || String(sheet.getRange(1, 1).getValue() || "").trim() === "") {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    return;
  }

  const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (v) {
    return String(v || "").trim();
  });

  for (let i = 0; i < expectedHeaders.length; i++) {
    if (existing.indexOf(expectedHeaders[i]) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(expectedHeaders[i]);
      existing.push(expectedHeaders[i]);
    }
  }
}

function extractParams_(e) {
  if (!e) return {};

  let bodyParams = {};
  if (e.postData && e.postData.contents) {
    const raw = String(e.postData.contents || "").trim();
    if (raw) {
      try {
        bodyParams = JSON.parse(raw);
      } catch (jsonError) {
        bodyParams = {};
      }
    }
  }

  const queryParams = (e.parameter && typeof e.parameter === "object") ? e.parameter : {};

  const merged = {};
  for (const k1 in bodyParams) {
    if (Object.prototype.hasOwnProperty.call(bodyParams, k1)) merged[k1] = bodyParams[k1];
  }
  for (const k2 in queryParams) {
    if (Object.prototype.hasOwnProperty.call(queryParams, k2)) merged[k2] = queryParams[k2];
  }

  if (Object.keys(merged).length > 0) return merged;

  if (!e.parameter && !e.postData && typeof e === "object") {
    return e;
  }

  return {};
}

function assertConfigReady_() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.indexOf("REPLACE_WITH_") === 0) {
    throw new Error("Please set CONFIG.SPREADSHEET_ID in auth script.");
  }
  const seed = getSecretSeed_();
  if (!seed || String(seed).length < 32) {
    throw new Error("Auth secret seed is missing or too short.");
  }
}

function assertTestApisEnabled_() {
  if (!CONFIG.ENABLE_TEST_APIS) {
    throw new Error("Test APIs are disabled. Set CONFIG.ENABLE_TEST_APIS=true for testing.");
  }
}

function normalizeEmail_(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeName_(name) {
  const cleaned = String(name || "")
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z.\s'-]/g, "")
    .trim();
  return cleaned;
}

function normalizeReferralCode_(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function isValidReferralCodeFormat_(code) {
  const clean = normalizeReferralCode_(code);
  return /^[A-Z0-9]{6,16}$/.test(clean);
}

function isReasonableName_(name) {
  const cleaned = sanitizeName_(name);
  if (cleaned.length < 2) return false;
  const parts = cleaned.split(" ").filter(function (p) { return p.length > 0; });
  return parts.length >= 1;
}

function generateOtp_() {
  const n = Math.floor(Math.random() * 1000000);
  return String(n).padStart(6, "0");
}

function generateOtpId_() {
  return "OTP-" + Utilities.formatDate(new Date(), "GMT+5:30", "yyyyMMdd-HHmmss") + "-" + Math.floor(1000 + Math.random() * 9000);
}

function generateUserId_() {
  return "USR-" + Utilities.formatDate(new Date(), "GMT+5:30", "yyyyMMdd-HHmmss") + "-" + Math.floor(1000 + Math.random() * 9000);
}

function generateSessionId_() {
  return "SES-" + Utilities.formatDate(new Date(), "GMT+5:30", "yyyyMMdd-HHmmss") + "-" + Math.floor(1000 + Math.random() * 9000);
}

function randomToken_() {
  return Utilities.getUuid().replace(/-/g, "");
}

function buildOtpHash_(email, otp, salt) {
  return sha256_(normalizeEmail_(email) + "|" + String(otp || "") + "|" + String(salt || "") + "|" + getSecretSeed_());
}

function buildSessionHash_(sessionToken) {
  return sha256_(String(sessionToken || "") + "|" + getSecretSeed_());
}

function getSecretSeed_() {
  const props = PropertiesService.getScriptProperties();
  let seed = String(props.getProperty("AUTH_SECRET_SEED") || "").trim();
  if (seed.length >= 32) return seed;

  const configSeed = String(CONFIG.SECRET_SEED || "").trim();
  if (configSeed && !configSeed.startsWith("REPLACE_WITH_") && configSeed.length >= 32) {
    props.setProperty("AUTH_SECRET_SEED", configSeed);
    return configSeed;
  }

  // Auto-generate once and persist for all future requests.
  seed = randomToken_() + randomToken_();
  props.setProperty("AUTH_SECRET_SEED", seed);
  return seed;
}

function sha256_(input) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(input),
    Utilities.Charset.UTF_8
  );
  let out = "";
  for (let i = 0; i < digest.length; i++) {
    const v = (digest[i] + 256) % 256;
    const h = v.toString(16);
    out += h.length === 1 ? "0" + h : h;
  }
  return out;
}

function toBool_(value) {
  if (typeof value === "boolean") return value;
  const s = String(value || "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function toInt_(value, fallbackValue) {
  const n = parseInt(value, 10);
  return isNaN(n) ? fallbackValue : n;
}

function asDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === "[object Date]") return value;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

function getClientIp_(eventObj) {
  if (!eventObj || !eventObj.parameter) return "";
  return String(eventObj.parameter.ip || eventObj.parameter.client_ip || "");
}

function escapeHtml_(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function testRequestOtp() {
  const result = doPost({
    action: "request_otp",
    email: "test@example.com",
    name: "Test User"
  });
  const content = (result && typeof result.getContent === "function")
    ? result.getContent()
    : String(result);
  Logger.log("testRequestOtp response: " + content);
  return content;
}

function testRequestOtpForEmail(email) {
  const safeEmail = normalizeEmail_(email || "");
  if (!isValidEmail_(safeEmail)) {
    throw new Error("Provide a valid email. Example: test@example.com");
  }
  const result = doPost({
    action: "request_otp",
    email: safeEmail,
    name: "Test User"
  });
  const content = (result && typeof result.getContent === "function")
    ? result.getContent()
    : String(result);
  Logger.log("testRequestOtpForEmail response: " + content);
  return content;
}

function testAuthSetup() {
  try {
    setupAuthSheets();
    assertConfigReady_();
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheets = ss.getSheets().map(function (s) { return s.getName(); });
    const seed = getSecretSeed_();
    const out = {
      status: "success",
      spreadsheet_id: CONFIG.SPREADSHEET_ID,
      sheets: sheets,
      secret_ready: !!seed,
      secret_length: String(seed || "").length,
      sheet_debug: getAuthSheetDebug_()
    };
    Logger.log(JSON.stringify(out));
    return JSON.stringify(out);
  } catch (error) {
    const out = {
      status: "error",
      message: error.message || String(error)
    };
    Logger.log(JSON.stringify(out));
    return JSON.stringify(out);
  }
}

function getAuthSheetDebug_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetNames = [CONFIG.USERS_SHEET, CONFIG.OTP_SHEET, CONFIG.SESSIONS_SHEET];
  const debug = {};

  sheetNames.forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh) {
      debug[name] = { exists: false };
      return;
    }
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    const headers = (lastRow >= 1 && lastCol >= 1)
      ? sh.getRange(1, 1, 1, lastCol).getValues()[0]
      : [];
    debug[name] = {
      exists: true,
      last_row: lastRow,
      last_col: lastCol,
      headers: headers
    };
  });

  return debug;
}

function testWriteOtpRowNoMail(email) {
  const safeEmail = normalizeEmail_(email || "");
  if (!isValidEmail_(safeEmail)) {
    throw new Error("Provide a valid email. Example: test@example.com");
  }

  setupAuthSheets();
  assertConfigReady_();

  const now = new Date();
  const otpCtx = getSheetContext_(CONFIG.OTP_SHEET);
  const otp = generateOtp_();
  const otpSalt = randomToken_();
  const otpHash = buildOtpHash_(safeEmail, otp, otpSalt);

  appendRow_(otpCtx, {
    "Timestamp": now,
    "OTP ID": generateOtpId_(),
    "Email": safeEmail,
    "OTP Hash": otpHash,
    "OTP Salt": otpSalt,
    "Expires At": new Date(now.getTime() + CONFIG.OTP_EXPIRY_MINUTES * 60 * 1000),
    "Attempts": 0,
    "Max Attempts": CONFIG.OTP_MAX_ATTEMPTS,
    "Used": false,
    "Used At": "",
    "Request IP": "MANUAL_TEST"
  });

  SpreadsheetApp.flush();
  const out = {
    status: "success",
    message: "Test row inserted into OtpCodes",
    email: safeEmail,
    otp_sheet_last_row: otpCtx.sheet.getLastRow()
  };
  Logger.log(JSON.stringify(out));
  return JSON.stringify(out);
}
