  /***************************************
  * COMPLETE ORDER PROCESSING SYSTEM *
  * For Aishaura Microgreens         *
  ***************************************/

  // ======================
  // CONFIGURATION
  // ======================
  const CONFIG = {
    SPREADSHEET_ID: "1Le-LIcGwuAtDKL8v-rNSKD2ENCLx3TjOsX5gmc0T61Q",
    SHEET_NAME: "Orders",
    AUTH_USERS_SPREADSHEET_ID: "1lQvRoXPzdUxcoh4H9NYpvH5Vbrl_miMkSBl-Ks5sM2s",
    AUTH_USERS_SHEET: "Users",
    ADMIN_EMAIL: "aishauramicrogreens@gmail.com",
    BUSINESS_NAME: "Aishaura Microgreens",
    UPI_ID: "9738560719-0@airtel",
    BUSINESS_MOBILE: "08073047946",
    
    COLUMNS: [
      "Timestamp", "Order ID", "Customer Name", "Phone", 
      "Product", "Quantity", "Address", "Notes",
      "Status", "Payment Status", "Email", "amount",
      "Payment Method", "Payment Link","WhatsApp Message","UTR Reference","WhatsApp Link",
      "Auth User ID", "Auth Email", "Auth Referral Code", "Auth Referred By Code",
      "Subtotal Amount", "Referral Discount", "Final Amount", "Referral Offer Applied"
    ],
    
    TRACKING_URL: "https://track.aishaura.com/order=",
    FEEDBACK_URL: "https://tinyurl.com/Aishauramicrogreens"+"?usp=pp_url&entry.621561002=",
    DEFAULT_DELIVERY_TIME: "today by 6 PM",
    REFERRAL: {
      ENABLED: true,
      MIN_ORDER_AMOUNT: 199,
      DISCOUNT_TYPE: "percent", // "percent" or "flat"
      DISCOUNT_PERCENT: 10,
      DISCOUNT_CAP: 80,
      FLAT_DISCOUNT: 60
    }
  };
  // WhatsApp message templates
  const WHATSAPP_TEMPLATES = {
    ORDER_CONFIRMED: {
    template: `Namaskara 🙏{name}! 🌱\n\n*Your {business} Order #{orderId}*\n💰 amount: ₹{amount}\n\n{product} microgreens.\n\n*Pay via UPI*\nUPI ID: ${CONFIG.UPI_ID}\n\n🔗 Pay Now: {paymentLink}\n\nCould you please share the payment details for confirmation?`,
      trigger: "Pending Payment"
    },
    PAYMENT_RECEIVED: {
      template: `Hello {name}! ✅\n\n*Payment Received*\nOrder #: {orderId}\namount: ₹{amount}\n\nWe're now preparing your {product} microgreens.`,
      trigger: "Payment Verified"
    },
    OUT_FOR_DELIVERY: {
      template: `Hello {name}! 🚚\n\n*Your Order is Out for Delivery*\nOrder #: {orderId}\n\nExpected delivery: {deliveryTime}\n\n`,
      trigger: "Out for Delivery"
    },
    DELIVERED: {
      template: `Hello {name}! 🎉\n\n*Order Delivered Successfully*\nOrder #: {orderId}\n\nHope you enjoy your {product} microgreens!\n\nPlease share your feedback: {feedbackLink}`,
      trigger: "Delivered"
    }
  };

  // ======================
  // CORE ORDER PROCESSING
  // ======================


  function doOptions() {
    return ContentService.createTextOutput("")
      .setMimeType(ContentService.MimeType.JSON);
  }

  function doOptions() {
    return ContentService.createTextOutput("");
  }
  function doOptions() {
    return HtmlService.createHtmlOutput()
      .setContent('') // Empty content for preflight
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  function generateOrderId() {
    const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const today = Utilities.formatDate(new Date(), "IST", "yyyyMMdd");
    const prefix = `AM-${today}-`;
    let maxNumber = 1000;
    data.forEach(row => {
      if (row[1] && row[1].startsWith(prefix)) {
        const currentNum = parseInt(row[1].split('-')[2] || '1000');
        if (currentNum > maxNumber) maxNumber = currentNum;
      }
    });
    return `${prefix}${maxNumber + 1}`;
  }

  function toMoney_(value) {
    const num = Number(value);
    if (!isFinite(num)) return 0;
    return Math.round(Math.max(num, 0) * 100) / 100;
  }

  function isReferralLinkedUser_(authUserId, referredByCode, authEmail) {
    // Checks whether a referred-by code should grant a discount.  The original
    // behaviour required a matching authUserId and a row in the users sheet that
    // had that ID *and* the given referred-by code.  This meant anonymous buyers
    // who simply entered a valid code would never get a discount.  The new logic
    // also accepts a code alone (without user ID) as long as the code exists in
    // the users sheet under the "Referral Code" column.
    const userId = String(authUserId || "").trim();
    const referredCode = String(referredByCode || "").trim().toUpperCase();
    const email = String(authEmail || "").trim().toLowerCase();
    
    Logger.log("isReferralLinkedUser_ called:");
    Logger.log("  userId: " + (userId || "EMPTY"));
    Logger.log("  referredCode: " + (referredCode || "EMPTY"));
    Logger.log("  email: " + (email || "EMPTY"));
    
    if (!referredCode) {
      Logger.log("  Result: FALSE (no code provided)");
      return false; // no code, nothing to verify
    }

    try {
      const ss = SpreadsheetApp.openById(CONFIG.AUTH_USERS_SPREADSHEET_ID);
      const usersSheet = ss.getSheetByName(CONFIG.AUTH_USERS_SHEET);
      if (!usersSheet || usersSheet.getLastRow() < 2) {
        Logger.log("  Result: FALSE (users sheet not found or empty)");
        return false;
      }

      const headers = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
      Logger.log("  User sheet headers: " + JSON.stringify(headers));
      
      const userIdIdx = headers.indexOf("User ID");
      const emailIdx = headers.indexOf("Email");
      const referredByIdx = headers.indexOf("Referred By Code");
      const referralCodeIdx = headers.indexOf("Referral Code");
      
      Logger.log("  Column indices - UserID: " + userIdIdx + ", Email: " + emailIdx + ", ReferredBy: " + referredByIdx + ", ReferralCode: " + referralCodeIdx);

      const rows = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, usersSheet.getLastColumn()).getValues();
      Logger.log("  Checking " + rows.length + " user rows");
      
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];

        if (userId && userIdIdx >= 0) {
          // original path: verify that the logged in user was indeed referred
          const rowUserId = String(row[userIdIdx] || "").trim();
          if (!rowUserId || rowUserId !== userId) continue;

          const rowReferredBy = String(row[referredByIdx] || "").trim().toUpperCase();
          if (rowReferredBy !== referredCode) {
            Logger.log("  UserId path: User found but code mismatch");
            return false;
          }

          if (email && emailIdx >= 0) {
            const rowEmail = String(row[emailIdx] || "").trim().toLowerCase();
            if (rowEmail && rowEmail !== email) {
              Logger.log("  UserId path: Email mismatch");
              return false;
            }
          }

          Logger.log("  Result: TRUE (user ID path matched)");
          return true;
        } else if (referralCodeIdx >= 0) {
          // code-only path: just check that the code exists among users
          const rowReferralCode = String(row[referralCodeIdx] || "").trim().toUpperCase();
          if (rowReferralCode === referredCode) {
            Logger.log("  Result: TRUE (code-only path matched, row " + i + ")");
            return true;
          }
        }
      }
      Logger.log("  Result: FALSE (no matching code found in any row)");
    } catch (error) {
      Logger.log("Referral verification failed: " + error);
      Logger.log("  Result: FALSE (exception)");
    }

    return false;
  }

  function computeReferralPricing_(subtotalInput, params) {
    const subtotal = toMoney_(subtotalInput);
    const referralCfg = CONFIG.REFERRAL || {};

    // accept either field name for the code; frontend uses auth_referred_by_code
    const referredByCode = String(
      params.auth_referred_by_code || params.referral_code || ""
    ).trim().toUpperCase();

    const authUserId = String(params.auth_user_id || "").trim();
    const authEmail = String(params.auth_email || params.email || "").trim().toLowerCase();

    const referralLinked = isReferralLinkedUser_(authUserId, referredByCode, authEmail);

    console.log("Referral pricing check", {
      subtotal,
      referredByCode,
      authUserId,
      authEmail,
      referralLinked,
      referralCfg
    });

    if (!referralCfg.ENABLED || !referralLinked) {
      return {
        subtotal: subtotal,
        discount: 0,
        finalAmount: subtotal,
        applied: false,
        reason: referralLinked ? "disabled" : "not-linked"
      };
    }

    if (subtotal < Number(referralCfg.MIN_ORDER_AMOUNT || 0)) {
      return {
        subtotal: subtotal,
        discount: 0,
        finalAmount: subtotal,
        applied: false,
        reason: "below-min-order"
      };
    }

    let discount = 0;
    if (String(referralCfg.DISCOUNT_TYPE || "").toLowerCase() === "flat") {
      discount = Number(referralCfg.FLAT_DISCOUNT || 0);
    } else {
      const percent = Math.max(0, Number(referralCfg.DISCOUNT_PERCENT || 0));
      const cap = Math.max(0, Number(referralCfg.DISCOUNT_CAP || 0));
      discount = (subtotal * percent) / 100;
      if (cap > 0) {
        discount = Math.min(discount, cap);
      }
    }

    discount = toMoney_(Math.min(discount, subtotal));
    const finalAmount = toMoney_(Math.max(subtotal - discount, 0));
    return {
      subtotal: subtotal,
      discount: discount,
      finalAmount: finalAmount,
      applied: discount > 0,
      reason: discount > 0 ? "applied" : "zero"
    };
  }

  function generateWhatsappMessage(template, data) {
    console.log(`Generating message from template: ${template}`);
    console.log(`Data: ${JSON.stringify(data)}`);
    
    let message = template
      .replace(/{name}/g, data.name || "")
      .replace(/{orderId}/g, data.orderId || "")
      .replace(/{amount}/g, data.amount || "0")
      .replace(/{product}/g, data.product || "microgreens")
      .replace(/{business}/g, CONFIG.BUSINESS_NAME)
      .replace(/{paymentLink}/g, data.payment_link || "")
      .replace(/{deliveryTime}/g, CONFIG.DEFAULT_DELIVERY_TIME)
      .replace(/{trackingLink}/g, `${CONFIG.TRACKING_URL}${data.orderId}`)
      .replace(/{feedbackLink}/g, `${CONFIG.FEEDBACK_URL}${data.orderId}`);
      
    console.log(`Final message: ${message}`);
    return message;
  }/**
  * Generates a WhatsApp API link with a pre-filled message.
  * @param {string} phone The recipient's phone number (with country code, e.g., '919738560719').
  * @param {string} message The text message to pre-fill.
  * @return {string} The full WhatsApp URL or empty string if invalid phone.
  */
  // function generateWhatsAppLink(phone, message) {
  //   if (!phone || typeof phone !== 'string') {
  //     console.log("Invalid phone number:", phone);
  //     return "";
  //   }
    
    
  //  // Remove all non-digits
  //   let cleanPhone = phone.replace(/[^0-9]/g, '');

  //   // Remove leading zeros
  //   cleanPhone = cleanPhone.replace(/^0+/, '');
    
  //   // Prepend country code if missing
  //   if (!cleanPhone.startsWith(countryCode)) {
  //     cleanPhone = countryCode + cleanPhone;
  //   }
  //   if (!cleanPhone) {
  //     console.log("Phone number contains no digits:", phone);
  //     return "";
  //   }
    
  //   const encodedMessage = encodeURIComponent(message);
  //   return `https://api.whatsapp.com/send/?phone=${cleanPhone}&text=${encodedMessage}&type=phone_number&app_absent=0`;
  // }

  function generateWhatsAppLink(phone, message, countryCode = "91") {
    if (!phone) {
      console.log("Invalid phone number:", phone);
      return "";
    }

    // Convert to string
    phone = String(phone).trim();

    // Remove all non-digits
    let cleanPhone = phone.replace(/[^0-9]/g, '');

    // Remove all leading zeros
    cleanPhone = cleanPhone.replace(/^0+/, '');
    
    // Validate phone length (should be 10 digits after cleaning)
    if (cleanPhone.length !== 10) {
      console.log("Invalid phone number length:", cleanPhone.length, "for:", phone);
      return "";
    }
    // If phone is only zeros, reject
    if (/^0+$/.test(cleanPhone)) {
      console.log("Phone number is invalid (all zeros):", phone);
      return "";
    }

    // Remove leading zero only if length > 10
    if (cleanPhone.length > 10) {
      cleanPhone = cleanPhone.replace(/^0+/, '');
    }

    // Prepend country code if not present
    if (!cleanPhone.startsWith(countryCode)) {
      cleanPhone = countryCode + cleanPhone;
    }

    const encodedMessage = encodeURIComponent(message || "");
    return `https://api.whatsapp.com/send/?phone=${cleanPhone}&text=${encodedMessage}&type=phone_number&app_absent=0`;
    function updateAllWhatsAppLinks(){

    }
  }


  function doPost(e) {
    let params;
    // Handle both test calls and actual web requests
    if (e && e.parameter){
      // Normal web request
      params = e.parameter;
    } else {
      // Test call (direct function invocation)
      params = e;
    }

    try {
      // Parse incoming data
      Logger.log("Incoming parameters: " + JSON.stringify(params));
      
      // Validate required fields with better error messages
      const requiredFields = ['name', 'phone', 'amount'];
      const missingFields = requiredFields.filter(field => !params[field]);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Generate sequential order ID
      const orderId = generateOrderId();
      const subtotalAmount = toMoney_(params.subtotal_amount || params.amount);
      
      // Debug: Log before pricing calculation
      Logger.log("=== REFERRAL DEBUG ===");
      Logger.log("Subtotal Amount: " + subtotalAmount);
      Logger.log("Referral Code (from params): " + (params.referral_code || "EMPTY"));
      Logger.log("Auth Referred By Code: " + (params.auth_referred_by_code || "EMPTY"));
      Logger.log("Auth User ID: " + (params.auth_user_id || "EMPTY"));
      Logger.log("Auth Email: " + (params.auth_email || "EMPTY"));
      
      const pricing = computeReferralPricing_(subtotalAmount, params);
      
      // Debug: Log after pricing calculation
      Logger.log("Pricing Result: " + JSON.stringify(pricing));
      Logger.log("=== END DEBUG ===");
      
      const finalAmount = toMoney_(pricing.finalAmount);
      
      // Generate payment details
      const paymentLink = generateUPILink(finalAmount.toFixed(2), orderId);
      //const qrCode = generateQRCode(paymentLink);
      
    const whatsappMsg = generateWhatsappMessage( // Change this line
        WHATSAPP_TEMPLATES.ORDER_CONFIRMED.template,
        {
          name: params.name,
          orderId: orderId,
          amount: finalAmount.toFixed(2),
          product: params.product || "microgreens",
          payment_link: paymentLink,
        }

      );
      
      // Prepare order data - map to exact column positions
        const whatsappLink = generateWhatsAppLink(params.phone, whatsappMsg);

      ensureColumnsExist();
      const orderData = new Array(CONFIG.COLUMNS.length).fill("");
      
      // Map each field to its correct column position
      orderData[CONFIG.COLUMNS.indexOf("Timestamp")] = new Date();
      orderData[CONFIG.COLUMNS.indexOf("Order ID")] = orderId;
      orderData[CONFIG.COLUMNS.indexOf("Customer Name")] = params.name;
      orderData[CONFIG.COLUMNS.indexOf("Phone")] = params.phone;
      orderData[CONFIG.COLUMNS.indexOf("Product")] = params.product || "Mixed Microgreens";
      orderData[CONFIG.COLUMNS.indexOf("Quantity")] = params.quantity || "1";
      orderData[CONFIG.COLUMNS.indexOf("Address")] = params.address || "";
      orderData[CONFIG.COLUMNS.indexOf("Notes")] = params.notes || "";
      orderData[CONFIG.COLUMNS.indexOf("Status")] = params.payment_method === 'cod' ? 'Pending Payment' : 'Pending Payment';
      orderData[CONFIG.COLUMNS.indexOf("Payment Status")] = "Pending";
      orderData[CONFIG.COLUMNS.indexOf("Email")] = params.email || "";
      orderData[CONFIG.COLUMNS.indexOf("amount")] = finalAmount.toFixed(2);
      orderData[CONFIG.COLUMNS.indexOf("Payment Method")] = params.payment_method || "UPI";
      orderData[CONFIG.COLUMNS.indexOf("Payment Link")] = paymentLink;
      orderData[CONFIG.COLUMNS.indexOf("WhatsApp Message")] = whatsappMsg;
      orderData[CONFIG.COLUMNS.indexOf("WhatsApp Link")] = whatsappLink;    // Store clickable link
      orderData[CONFIG.COLUMNS.indexOf("UTR Reference")] = "";
      orderData[CONFIG.COLUMNS.indexOf("Auth User ID")] = params.auth_user_id || "";
      orderData[CONFIG.COLUMNS.indexOf("Auth Email")] = params.auth_email || params.email || "";
      orderData[CONFIG.COLUMNS.indexOf("Auth Referral Code")] = params.auth_referral_code || "";
      orderData[CONFIG.COLUMNS.indexOf("Auth Referred By Code")] = params.auth_referred_by_code || params.referral_code || "";
      orderData[CONFIG.COLUMNS.indexOf("Subtotal Amount")] = pricing.subtotal.toFixed(2);
      orderData[CONFIG.COLUMNS.indexOf("Referral Discount")] = pricing.discount.toFixed(2);
      orderData[CONFIG.COLUMNS.indexOf("Final Amount")] = finalAmount.toFixed(2);
      orderData[CONFIG.COLUMNS.indexOf("Referral Offer Applied")] = pricing.applied ? "YES" : "NO";

      // Debug: Log what's being saved for referral columns
      Logger.log("=== SHEET WRITE DEBUG ===");
      Logger.log("Subtotal Amount Column Index: " + CONFIG.COLUMNS.indexOf("Subtotal Amount"));
      Logger.log("Subtotal Amount Value: " + pricing.subtotal.toFixed(2));
      Logger.log("Referral Discount Column Index: " + CONFIG.COLUMNS.indexOf("Referral Discount"));
      Logger.log("Referral Discount Value: " + pricing.discount.toFixed(2));
      Logger.log("Final Amount Column Index: " + CONFIG.COLUMNS.indexOf("Final Amount"));
      Logger.log("Final Amount Value: " + finalAmount.toFixed(2));
      Logger.log("Referral Offer Applied Column Index: " + CONFIG.COLUMNS.indexOf("Referral Offer Applied"));
      Logger.log("Referral Offer Applied Value: " + (pricing.applied ? "YES" : "NO"));
      Logger.log("=== END SHEET WRITE DEBUG ===");

      // Write to sheet
      const sheet = getSheet();
      sheet.appendRow(orderData);
    setupStatusDropdownsForRow(sheet.getLastRow()); 
      // Send notifications
      if (params.email) {
        sendOrderConfirmationEmail(
          params.email, 
          orderId, 
          params.name, 
          finalAmount.toFixed(2),
          paymentLink,
        );
      }
      
      sendAdminNotification("NEW_ORDER", orderId, params.name, finalAmount.toFixed(2));

      // Return success response
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        orderId: orderId,
        amount: finalAmount.toFixed(2),
        subtotal_amount: pricing.subtotal.toFixed(2),
        referral_discount: pricing.discount.toFixed(2),
        referral_applied: pricing.applied,
        paymentLink: paymentLink,
        whatsappLink: whatsappLink,
      })).setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
      console.error("Error in doPost:", error);
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: error.message,
        stack: error.stack
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }



  // ======================
  // SHEET MANAGEMENT
  // ======================
  function getSheet() {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
      sheet.getRange(1, 1, 1, CONFIG.COLUMNS.length).setValues([CONFIG.COLUMNS]);
      return sheet;
    }

    // Auto-heal headers even if setup() was not run
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, CONFIG.COLUMNS.length).setValues([CONFIG.COLUMNS]);
      return sheet;
    }

    ensureColumnsExist(sheet);
    return sheet;
  }

  function getSheetData() {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    return { sheet, data, headers: data[0] };
  }

  function getOrderById(orderId, data, headers) {
    const row = data.find(row => row[1] === orderId);
    if (!row) throw new Error(`Order ${orderId} not found`);
    
    const order = {};
    headers.forEach((header, index) => {
      // Convert column names to consistent lowercase with underscores
      const cleanHeader = header.toLowerCase().replace(/ /g, '_');
      order[cleanHeader] = row[index];
    });
    return order;
  }


  function getOrderRow(orderId, sheet, data) {
    if (!data) data = sheet.getDataRange().getValues();
    const rowIndex = data.findIndex(row => row[1] === orderId);
    if (rowIndex === -1) throw new Error(`Order ${orderId} not found`);
    return rowIndex + 1;
  }

  // ======================

  // DROPDOWN MANAGEMENT

  // ======================

  function setupStatusDropdownsForRow(rowNumber) {
    const sheet = getSheet();
    const statusCol = CONFIG.COLUMNS.indexOf("Status") + 1;
    const paymentStatusCol = CONFIG.COLUMNS.indexOf("Payment Status") + 1;
    // Status options - must match WHATSAPP_TEMPLATES triggers exactly
    const statusOptions = [
      "Pending Payment",
      "Payment Verified",
      "Out for Delivery",
      "Delivered"
    ];
      const statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(statusOptions)
      .setAllowInvalid(false)
      .build();
      
    // Apply validation to the specific row
    sheet.getRange(rowNumber, statusCol).setDataValidation(statusRule);
    //sheet.getRange(rowNumber, paymentStatusCol).setDataValidation(paymentStatusRule);
      console.log("Dropdowns created for row " + rowNumber);
  }
  function setupStatusDropdowns() {
    const sheet = getSheet();
    const statusCol = CONFIG.COLUMNS.indexOf("Status") + 1;
    const paymentStatusCol = CONFIG.COLUMNS.indexOf("Payment Status") + 1;
    const lastRow = sheet.getLastRow();
      // Status options - must match WHATSAPP_TEMPLATES triggers exactly
    const statusOptions = [
      "Pending Payment",
      "Payment Verified",
      "Out for Delivery",
      "Delivered"
    ];
      const statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(statusOptions)
      .setAllowInvalid(false)
      .build();
      
    if (lastRow > 1) {
      // Apply to all existing rows
      sheet.getRange(2, statusCol, lastRow - 1, 1).setDataValidation(statusRule);
      //sheet.getRange(2, paymentStatusCol, lastRow - 1, 1).setDataValidation(paymentStatusRule);
    }
    console.log("Dropdowns setup completed for " + (lastRow - 1) + " rows");
  }
  function checkDropdowns() {

    const sheet = getSheet();

    const statusCol = CONFIG.COLUMNS.indexOf("Status") + 1;

    const paymentStatusCol = CONFIG.COLUMNS.indexOf("Payment Status") + 1;

    const lastRow = sheet.getLastRow();

    

    console.log("Checking dropdowns in sheet:");

    console.log("Status column: " + statusCol);

    console.log("Payment Status column: " + paymentStatusCol);

    console.log("Last row: " + lastRow);

    

    if (lastRow > 1) {
      for (let i = 2; i <= lastRow; i++) {
        const statusValidation = sheet.getRange(i, statusCol).getDataValidation();
        const paymentValidation = sheet.getRange(i, paymentStatusCol).getDataValidation();   
        console.log("Row " + i + ":");
        console.log("  Status validation: " + (statusValidation ? "Exists" : "Missing"));
        console.log("  Payment validation: " + (paymentValidation ? "Exists" : "Missing"));
      }
    }
  }
  // ======================
  // INSTALLATION
  // ======================


  function ensureColumnsExist(sheetRef) {
    const sheet = sheetRef || getSheet();
    const requiredLen = CONFIG.COLUMNS.length;
    const headerRange = sheet.getRange(1, 1, 1, requiredLen);
    const current = headerRange.getValues()[0];
    const next = current.slice();
    let changed = false;

    // Enforce exact header names/positions for all required columns.
    for (let i = 0; i < requiredLen; i++) {
      if (String(next[i] || "").trim() !== CONFIG.COLUMNS[i]) {
        next[i] = CONFIG.COLUMNS[i];
        changed = true;
      }
    }

    if (changed) {
      // Old sheets may have validation on header cells (e.g., Status list on I1).
      headerRange.clearDataValidations();
      headerRange.setValues([next]);
    }
  }

  // ======================
  // EDIT TRIGGER
  // ======================
  function onEdit(e) {
    console.log("onEdit triggered");
    
    const range = e.range;
    const sheet = range.getSheet();
    
    console.log("Sheet name: " + sheet.getName());
    console.log("Edited range: " + range.getA1Notation());
    console.log("Edited value: " + range.getValue());
    
    if (sheet.getName() !== CONFIG.SHEET_NAME) {
      console.log("Not the Orders sheet, skipping");
      return;
    }
    
    const statusCol = CONFIG.COLUMNS.indexOf("Status") + 1;
    const paymentStatusCol = CONFIG.COLUMNS.indexOf("Payment Status") + 1;
    
    console.log("Status column: " + statusCol);
    console.log("Payment Status column: " + paymentStatusCol);
    console.log("Edited column: " + range.getColumn());
    
    // Handle Status changes
    if (range.getColumn() === statusCol) {
      const row = range.getRow();
      if (row === 1) {
        console.log("Header row edited, skipping");
        return;
      }
      
      const orderId = sheet.getRange(row, 2).getValue(); // Column 2 is Order ID
      const newStatus = range.getValue();
      
      console.log(`Status changed to: ${newStatus} for order: ${orderId} at row: ${row}`);
      
      try {
        storeWhatsAppMessage(orderId, newStatus);
      } catch (error) {
        console.error(`Error updating WhatsApp message for order ${orderId}:`, error);
      }
    }
    
    // Handle Payment Status changes
    if (range.getColumn() === paymentStatusCol) {
      const row = range.getRow();
      if (row === 1) {
        console.log("Header row edited, skipping");
        return;
      }
      
      const newPaymentStatus = range.getValue();
      const statusCell = sheet.getRange(row, statusCol);
      
      console.log(`Payment Status changed to: ${newPaymentStatus} at row: ${row}`);
      
      // Auto-update main status based on payment status
      if (newPaymentStatus === "Paid") {
        statusCell.setValue("Payment Verified");
        
        // Also update WhatsApp message for payment status change
        const orderId = sheet.getRange(row, 2).getValue();
        try {
          storeWhatsAppMessage(orderId, "Payment Verified");
        } catch (error) {
          console.error(`Error updating WhatsApp message for order ${orderId}:`, error);
        }
      } else if (newPaymentStatus === "Failed") {
        statusCell.setValue("Pending Payment");
      }
    }
  }
  // ======================
  // NOTIFICATION FUNCTIONS
  // ======================
  function sendOrderConfirmationEmail(email, orderId, name, amount, UPI_ID, product = "", quantity = "") {
    try {
      const subject = `Your ${CONFIG.BUSINESS_NAME} Order #${orderId} Confirmation`;
      
      // Build product description
      let productDescription = "";
      if (product && quantity) {
        productDescription = `<p><strong>Product:</strong> ${quantity} x ${product} Microgreens</p>`;
      } else if (product) {
        productDescription = `<p><strong>Product:</strong> ${product} Microgreens</p>`;
      }
      
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2e7d32;">Thank you for your order, ${name}!</h2>
          <p>Your order #${orderId} has been received and is being processed.</p>
          
          <h3 style="color: #2e7d32;">Order Summary</h3>
          ${productDescription}
          <p><strong>Amount:</strong> ₹${amount}</p>
          
          
          
          <p>If you have any questions, please reply to this email or contact us at ${CONFIG.BUSINESS_MOBILE}.</p>
          
          <p style="margin-top: 30px; font-size: 0.9em; color: #666;">
            ${CONFIG.BUSINESS_NAME}<br>
            ${CONFIG.ADMIN_EMAIL}<br>
            ${CONFIG.BUSINESS_MOBILE}
          </p>
        </div>
      `;
      
      MailApp.sendEmail({
        to: email,
        subject: subject,
        htmlBody: htmlBody,
        name: CONFIG.BUSINESS_NAME
      });
      
      return true;
    } catch (e) {
      console.error("Error sending email:", e);
      return false;
    }
  }


  function sendAdminNotification(type, orderId, customerName, amount) {
    try {
      const subject = `[ADMIN] New ${type.replace('_', ' ')} - Order #${orderId}`;
      
      const htmlBody = `
        <div style="font-family: Arial, sans-serif;">
          <h2 style="color: #2e7d32;">New ${type.replace('_', ' ')} Notification</h2>
          <p><strong>Order ID:</strong> ${orderId}</p>
          <p><strong>Customer:</strong> ${customerName}</p>
          <p><strong>amount:</strong> ₹${amount}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          
          <p style="margin-top: 30px;">
            <a href="${CONFIG.SPREADSHEET_URL}" style="background-color: #2e7d32; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px;">View Order in Sheet</a>
          </p>
        </div>
      `;
      
      MailApp.sendEmail({
        to: CONFIG.ADMIN_EMAIL,
        subject: subject,
        htmlBody: htmlBody
      });
      
      return true;
    } catch (e) {
      console.error("Error sending admin notification:", e);
      return false;
    }
  }

  // ======================
  // PAYMENT FUNCTIONS
  // ======================
  function generateUPILink(amount, orderId) {
    const payeeName = encodeURIComponent(CONFIG.BUSINESS_NAME);
    const transactionRef = encodeURIComponent(orderId);
    const amountValue = amount; // The amount is already a number or string ready to be inserted.

    return `upi://pay?pa=${CONFIG.UPI_ID}&pn=${payeeName}&tr=${transactionRef}&am=${amountValue}`;
  }



  function storeWhatsAppMessage(orderId, newStatus) {
    try {
      console.log(`storeWhatsAppMessage called for order: ${orderId}, status: ${newStatus}`);
      
      const { sheet, data, headers } = getSheetData();
      
      // Verify columns exist
      const whatsappMsgColIndex = headers.indexOf("WhatsApp Message");
      const whatsappLinkColIndex = headers.indexOf("WhatsApp Link");
      const phoneColIndex = headers.indexOf("Phone");
      const amountColIndex = headers.indexOf("amount"); // Find the amount column
      const totalPriceColIndex = headers.indexOf("total_price"); // Also look for total_price
      
      console.log(`Column indices - Message: ${whatsappMsgColIndex}, Link: ${whatsappLinkColIndex}, Phone: ${phoneColIndex}, Amount: ${amountColIndex}, Total Price: ${totalPriceColIndex}`);
      
      if (whatsappMsgColIndex === -1) {
        throw new Error("WhatsApp Message column not found in sheet");
      }
      if (whatsappLinkColIndex === -1) {
        throw new Error("WhatsApp Link column not found in sheet");
      }
      if (phoneColIndex === -1) {
        throw new Error("Phone column not found in sheet");
      }
      
      const order = getOrderById(orderId, data, headers);
      const row = getOrderRow(orderId, sheet, data);
      
      console.log(`Found order ${orderId} at row ${row}`);
      
      // Find matching template
      let templateKey = Object.keys(WHATSAPP_TEMPLATES).find(key => 
        WHATSAPP_TEMPLATES[key].trigger === newStatus
      );
      
      if (!templateKey) {
        console.log(`No WhatsApp template found for status: ${newStatus}`);
        return;
      }
      
      console.log(`Using template: ${templateKey} for status: ${newStatus}`);
      
      const template = WHATSAPP_TEMPLATES[templateKey].template;
      
      // Get field values - use total_price if amount is not available
      let actualAmount = order.amount || order.amount_ || order.amt || '0';
      
      // If amount is empty but total_price exists, use total_price
      if ((!actualAmount || actualAmount === '0') && order.total_price) {
        actualAmount = order.total_price;
        console.log(`Using total_price instead of amount: ${actualAmount}`);
      }
      
      // Get phone number
      let phone = '';
      if (order.phone !== undefined && order.phone !== null) {
        phone = order.phone.toString();
      } else if (order.phone_number !== undefined && order.phone_number !== null) {
        phone = order.phone_number.toString();
      } else if (order.mobile !== undefined && order.mobile !== null) {
        phone = order.mobile.toString();
      }
      
      const customerName = order.customer_name || order.name || order.customer || '';
      const product = order.product || "microgreens";
      const paymentLink = order.payment_link || order.upi_payment_link || "";
      
      console.log(`Extracted values - Amount: '${actualAmount}', Phone: '${phone}', Name: '${customerName}'`);
      
      // Generate the message text
      const whatsappMsg = generateWhatsappMessage(template, {
        name: customerName,
        orderId: order.order_id || orderId,
        amount: actualAmount,
        product: product,
        payment_link: paymentLink,
        business: CONFIG.BUSINESS_NAME,
        deliveryTime: CONFIG.DEFAULT_DELIVERY_TIME,
        trackingLink: `${CONFIG.TRACKING_URL}${order.order_id || orderId}`,
        feedbackLink: `${CONFIG.FEEDBACK_URL}${order.order_id || orderId}`
      });
      
      console.log(`Generated WhatsApp message: ${whatsappMsg}`);
      
      // Generate the WhatsApp link
      let whatsappLink = "";
      if (phone && phone.trim() !== '') {
        whatsappLink = generateWhatsAppLink(phone, whatsappMsg);
        console.log(`Generated WhatsApp link: ${whatsappLink}`);
      } else {
        console.log("No valid phone number found, cannot generate WhatsApp link");
        whatsappLink = "No phone number available";
      }
      
      // Update both columns in the sheet
      const whatsappMsgCol = whatsappMsgColIndex + 1;
      const whatsappLinkCol = whatsappLinkColIndex + 1;
      
      sheet.getRange(row, whatsappMsgCol).setValue(whatsappMsg);
      sheet.getRange(row, whatsappLinkCol).setValue(whatsappLink);
      SpreadsheetApp.flush(); // Force immediate write
      
      console.log(`Successfully updated WhatsApp message and link for order ${orderId}`);
      
    } catch (e) {
      console.error("Error in storeWhatsAppMessage:", e);
      console.error("Error stack: " + e.stack);
      throw e;
    }
  }
  function updateAllWhatsAppLinks() {
    const { sheet, data, headers } = getSheetData();
    
    const phoneColIndex = headers.indexOf("Phone");
    const whatsappMsgColIndex = headers.indexOf("WhatsApp Message");
    const whatsappLinkColIndex = headers.indexOf("WhatsApp Link");
    
    if (phoneColIndex === -1 || whatsappMsgColIndex === -1 || whatsappLinkColIndex === -1) {
      throw new Error("Required columns not found");
    }
    
    let updatedCount = 0;
    
    // Start from row 2 (skip header)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const phone = row[phoneColIndex];
      const message = row[whatsappMsgColIndex];
      
      if (phone && message) {
        const whatsappLink = generateWhatsAppLink(phone, message);
        sheet.getRange(i + 1, whatsappLinkColIndex + 1).setValue(whatsappLink);
        updatedCount++;
      }
    }
    
    SpreadsheetApp.flush();
    console.log(`Updated ${updatedCount} WhatsApp links`);
    return updatedCount;
  }
  // ======================
  // SETUP FUNCTIONS
  // ======================
  function setup() {
    // 1. Verify columns exist
    ensureColumnsExist();
    
    // 2. Set up status dropdowns
    setupStatusDropdowns();
    
    // 3. Update existing WhatsApp messages to links
    try {
      const updatedCount = updateAllWhatsAppLinks();
      console.log(`Updated ${updatedCount} existing WhatsApp links`);
    } catch (e) {
      console.log("Could not update existing WhatsApp links:", e.message);
    }
    
    // 4. Set up triggers
    const triggers = ScriptApp.getProjectTriggers();
    const hasEditTrigger = triggers.some(t => t.getHandlerFunction() === 'onEdit');
    
    if (!hasEditTrigger) {
      ScriptApp.newTrigger('onEdit')
        .forSpreadsheet(SpreadsheetApp.getActive())
        .onEdit()
        .create();
    }
    
    // 5. Set up onOpen trigger
    const hasOpenTrigger = triggers.some(t => t.getHandlerFunction() === 'onOpen');
    
    if (!hasOpenTrigger) {
      ScriptApp.newTrigger('onOpen')
        .forSpreadsheet(SpreadsheetApp.getActive())
        .onOpen()
        .create();
    }
    
    console.log("Setup complete - new columns added and links updated");
  }


  function testDoPost() {
    const mockData = {
      parameter: {
        name: "Test Customer",
        phone: "9876543210",
        email: "Shashi.shashi727@gmail.com",
        address: "123 Test St",
        product: "Sunflower Microgreens",
        quantity: "100",
        amount: "240.00",
        payment_method: "upi",
        notes: "Test order from script"
      }
    };
    
    Logger.log("Starting test...");
    const result = doPost(mockData);
    Logger.log("Response: " + result.getContent());
    
    // Verify the sheet
    const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const lastRow = data[data.length-1];
    Logger.log("Last row in sheet: " + lastRow);
  }
  function testSheetAccess() {
    try {
      const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
      const testData = [new Date(), "TEST", "Access Test"];
      sheet.appendRow(testData);
      Logger.log("Successfully wrote test data to sheet");
    } catch (e) {
      Logger.log("Sheet access error: " + e.toString());
    }
  }


  function testWhatsAppMessages() {
    const testData = {
      name: "Test Customer",
      order_id: "AM-20250821-1001",
      amount: "350.00",
      product: "Sunflower Microgreens",
      payment_link: generateUPILink(350, "AM-20230801-1001"),
      phone: CONFIG.BUSINESS_MOBILE
    };
    
    Object.keys(WHATSAPP_TEMPLATES).forEach(key => {
      const template = WHATSAPP_TEMPLATES[key].template;
      const message = generateWhatsappMessage(template, testData);
      console.log(`=== ${key} ===`);
      console.log(message);
      console.log("\n");
    });
  }
  // Modified test function
  function testFullFlow() {
    const testParams = {
      name: "Test Customer",
      phone: CONFIG.BUSINESS_MOBILE,
      email: "shashi.shashi727@gmail.com",
      address: "123 Test St",
      product: "Sunflower Microgreens",
      quantity: "100",
      amount: "350.00",
      payment_method: "upi",
      notes: "Test order from script"
    };
    
    console.log("Starting test...");
    
    // Call doPost with the test parameters
    const result = doPost(testParams);
    
    // For testing, log the entire response
    if (result && typeof result.getContent === 'function') {
      console.log("Response:", result.getContent());
    } else {
      console.log("Raw response:", result);
    }
    
    // Verify the sheet
    const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    // Find the test order in the sheet
    const testOrder = data.find(row => row[CONFIG.COLUMNS.indexOf("Customer Name")] === "Test Customer");
    
    if (testOrder) {
      console.log("Test order found in sheet:");
      CONFIG.COLUMNS.forEach((col, index) => {
        console.log(`${col}: ${testOrder[index]}`);
      });
    } else {
      console.log("Test order not found in sheet");
    }
  }
  function testManualStatusChange() {
    // Manually test status change for a specific order
    const testOrderId = "AM-20250821-1001"; // Replace with actual order ID
    const testStatus = "Payment Verified";
    
    console.log(`Manually testing status change for order: ${testOrderId} to status: ${testStatus}`);
    
    try {
      storeWhatsAppMessage(testOrderId, testStatus);
      console.log("Manual test completed successfully");
    } catch (error) {
      console.error("Manual test failed:", error);
    }
  }

  function testAllStatusChanges() {
    // Test all status templates for a specific order
    const testOrderId = "AM-20250821-1001"; // Replace with actual order ID
    
    const statuses = [
      "Pending Payment",
      "Payment Verified", 
      "Out for Delivery",
      "Delivered"
    ];
    
    statuses.forEach(status => {
      console.log(`\n=== Testing status: ${status} ===`);
      try {
        storeWhatsAppMessage(testOrderId, status);
        console.log(`✓ Successfully tested ${status}`);
      } catch (error) {
        console.log(`✗ Failed to test ${status}: ${error.message}`);
      }
      Utilities.sleep(1000); // Wait 1 second between tests
    });
  }
