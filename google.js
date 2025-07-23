/******************************
 * MICROGREENS ORDER PROCESSOR *
 ******************************/

// ========== CONFIGURATION ========== //
const CONFIG = {
  SPREADSHEET_ID: "1J5OAhoDek9H66LFNp2MlEK-vzhs_E1i-jw9iG_4iP7Y",
  SHEET_NAME: "Sheet1",
  ADMIN_EMAIL: "shashi.shashi727@gmail.com",
  BUSINESS_NAME: "Aishaura Microgreens",
  FEEDBACK_FORM_URL: "https://docs.google.com/forms/d/1ijZin9b2qS9Tn1DiOxA9gskoTmnr9FAZrwlKlHTtISs/edit",
  LOG_PREFIX: "🌱 [Aishaura]",

  // Column configuration (must match your spreadsheet EXACTLY)
  COLUMNS: {
    TIMESTAMP: "Timestamp",
    ORDER_ID: "Order ID",
    NAME: "Name",
    PHONE: "Phone",
    PRODUCT: "Product",
    QUANTITY: "Quantity",
    ADDRESS: "Address",
    NOTES: "Notes",
    STATUS: "Status",
    FEEDBACK_SENT: "Feedback Sent",
    EMAIL: "email" // CRITICAL: Must match EXACTLY (case-sensitive) your spreadsheet header
  },

  // Field mappings (form fields -> spreadsheet columns)
  FIELD_MAPPINGS: {
    name: "NAME",
    contact: "PHONE",
    email: "EMAIL", // This maps 'email' from form to spreadsheet column
    product: "PRODUCT",
    quantity: "QUANTITY",
    address: "ADDRESS",
    notes: "NOTES"
  }
};

// ========== ENHANCED LOGGING ========== //
function log(message, level = "INFO") {
  const timestamp = new Date().toISOString();
  const logMessage = `${CONFIG.LOG_PREFIX} [${timestamp}] [${level}] ${message}`;
  Logger.log(logMessage);
  
  // Also log to Stackdriver for better debugging
  console.log(JSON.stringify({
    message: logMessage,
    severity: level
  }));
}

// ========== MAIN ORDER PROCESSOR ========== //
function doPost(e) {
  log("Starting order processing");
  
  try {
    // 1. Parse incoming data with enhanced debugging
    const params = parseRequestData(e);
    log(`Parsed parameters keys: ${Object.keys(params).join(', ')}`, "DEBUG");
    log(`Email in params: '${params.email}' (exists: ${!!params.email})`, "DEBUG");

    // 2. Validate required fields
    const validation = validateOrderFields(params);
    if (!validation.valid) {
      log(`Validation failed: ${validation.message}`, "WARN");
      return createErrorResponse(validation.message);
    }

    // 3. Prepare spreadsheet with header verification
    const { sheet, headers } = setupSpreadsheet();
    log(`Spreadsheet headers: ${headers.join(' | ')}`, "DEBUG");
    log(`Looking for email column: '${CONFIG.COLUMNS.EMAIL}'`, "DEBUG");
    
    const emailColIndex = headers.indexOf(CONFIG.COLUMNS.EMAIL);
    if (emailColIndex === -1) {
      throw new Error(`Email column '${CONFIG.COLUMNS.EMAIL}' not found in sheet headers. Actual headers: ${headers.join(', ')}`);
    }
    log(`Email column found at index: ${emailColIndex}`, "DEBUG");

    // 4. Generate order ID
    const orderId = generateSequentialOrderId(sheet);
    log(`Generated Order ID: ${orderId}`);

    // 5. Record order with email verification
    const timestamp = recordOrder(sheet, headers, params, orderId);
    log(`Order recorded at ${timestamp}`);

    // 6. Verify email was actually saved
    verifyEmailSaved(sheet, orderId, params.email);

    // 7. Send notifications
    if (params.sendEmail === 'yes' || params.email) {
      sendNotifications(params, orderId);
    }

    // 8. Return success response
    return createSuccessResponse(orderId);

  } catch (error) {
    log(`Order processing failed: ${error.message}\nStack: ${error.stack}`, "ERROR");
    return createErrorResponse(error.message);
  }
}

// ========== CORE FUNCTIONS WITH ENHANCED DEBUGGING ========== //

function parseRequestData(e) {
  try {
    if (!e || !e.postData) {
      log("No postData in request", "DEBUG");
      return {};
    }

    log(`Raw request content type: ${e.postData.type}`, "DEBUG");
    log(`Raw request content (first 500 chars): ${e.postData.contents.substring(0, 500)}`, "DEBUG");

    let params = {};
    if (e.postData.type === "application/x-www-form-urlencoded") {
      e.postData.contents.split('&').forEach(part => {
        const [key, value] = part.split('=');
        if (key) {
          const decodedKey = decodeURIComponent(key);
          const decodedValue = decodeURIComponent(value || '');
          params[decodedKey] = decodedValue;
          log(`Parsed form field: ${decodedKey} = ${decodedValue}`, "DEBUG");
        }
      });
    } else {
      params = JSON.parse(e.postData.contents);
      log("Parsed JSON request data", "DEBUG");
    }

    log(`Final parsed params: ${JSON.stringify(params)}`, "DEBUG");
    return params;
  } catch (error) {
    log(`Parse error: ${error.message}`, "ERROR");
    throw new Error("Failed to parse request data");
  }
}

function validateOrderFields(params) {
  const requiredFields = {
    name: "Full Name",
    contact: "Phone Number",
    email: "Email Address", 
    product: "Product Selection",
    quantity: "Quantity",
    address: "Delivery Address"
  };

  const missingFields = [];
  const invalidFields = [];

  // Check required fields
  Object.keys(requiredFields).forEach(field => {
    if (!params[field] || String(params[field]).trim() === '') {
      missingFields.push(requiredFields[field]);
    }
  });

  // Validate email format if present
  if (params.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email)) {
    invalidFields.push("Email (invalid format)");
  }

  if (missingFields.length > 0 || invalidFields.length > 0) {
    const messages = [];
    if (missingFields.length > 0) messages.push(`Missing: ${missingFields.join(', ')}`);
    if (invalidFields.length > 0) messages.push(`Invalid: ${invalidFields.join(', ')}`);
    return { valid: false, message: messages.join(' | ') };
  }

  return { valid: true };
}

function setupSpreadsheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    if (!spreadsheet) throw new Error("Spreadsheet not found");
    
    const sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) throw new Error(`Sheet '${CONFIG.SHEET_NAME}' not found`);
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    log(`Spreadsheet headers: ${headers.map((h, i) => `${i+1}:${h}`).join(', ')}`, "DEBUG");
    
    // Verify all configured columns exist
    const missingColumns = Object.values(CONFIG.COLUMNS).filter(col => !headers.includes(col));
    if (missingColumns.length > 0) {
      throw new Error(`Missing columns in sheet: ${missingColumns.join(', ')}`);
    }
    
    return { spreadsheet, sheet, headers };
  } catch (error) {
    log(`Spreadsheet setup failed: ${error.message}`, "ERROR");
    throw error;
  }
}

function generateSequentialOrderId(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const orderIdCol = headers.indexOf(CONFIG.COLUMNS.ORDER_ID) + 1;
  
  if (orderIdCol === 0) throw new Error("Order ID column not found");

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1; // First order
  
  const orderIds = sheet.getRange(2, orderIdCol, lastRow-1, 1)
    .getValues()
    .flat()
    .filter(id => !isNaN(id))
    .map(Number);
  
  return Math.max(0, ...orderIds) + 1; // Handle empty case with Math.max(0, ...)
}

function recordOrder(sheet, headers, params, orderId) {
  // Create empty row with correct number of columns
  const rowData = new Array(headers.length).fill('');
  log(`Preparing row with ${headers.length} columns`, "DEBUG");

  // Set static values
  const timestamp = new Date();
  rowData[headers.indexOf(CONFIG.COLUMNS.TIMESTAMP)] = timestamp;
  rowData[headers.indexOf(CONFIG.COLUMNS.ORDER_ID)] = orderId;
  rowData[headers.indexOf(CONFIG.COLUMNS.STATUS)] = "Pending";
  rowData[headers.indexOf(CONFIG.COLUMNS.FEEDBACK_SENT)] = "";

  // Map all form fields to columns
  Object.keys(CONFIG.FIELD_MAPPINGS).forEach(formField => {
    const configKey = CONFIG.FIELD_MAPPINGS[formField];
    const columnName = CONFIG.COLUMNS[configKey];
    const colIndex = headers.indexOf(columnName);
    
    if (colIndex >= 0) {
      const value = params[formField] || '';
      rowData[colIndex] = value;
      log(`Mapped ${formField}='${value}' to ${columnName} (col ${colIndex+1})`, "DEBUG");
    } else {
      log(`Column ${columnName} not found for field ${formField}`, "WARN");
    }
  });

  // DEBUG: Verify email is in the right position
  const emailColIndex = headers.indexOf(CONFIG.COLUMNS.EMAIL);
  log(`Email should be at index ${emailColIndex}: '${rowData[emailColIndex]}'`, "DEBUG");

  // Write to spreadsheet
  sheet.appendRow(rowData);
  SpreadsheetApp.flush();
  log("Row written to spreadsheet", "DEBUG");

  return timestamp;
}

function verifyEmailSaved(sheet, orderId, expectedEmail) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const orderIdCol = headers.indexOf(CONFIG.COLUMNS.ORDER_ID) + 1;
  const emailCol = headers.indexOf(CONFIG.COLUMNS.EMAIL) + 1;

  // Find the order row
  const orderIds = sheet.getRange(2, orderIdCol, sheet.getLastRow()-1, 1)
    .getValues()
    .flat();
  const rowIndex = orderIds.indexOf(orderId) + 2;

  if (rowIndex < 2) throw new Error(`Order ${orderId} not found after saving`);

  // Get the saved email
  const savedEmail = sheet.getRange(rowIndex, emailCol).getValue();
  log(`Verify: Expected email '${expectedEmail}', Saved email '${savedEmail}'`, "DEBUG");

  if (String(savedEmail).trim() !== String(expectedEmail).trim()) {
    throw new Error(`Email not saved correctly! Expected '${expectedEmail}' but found '${savedEmail}'`);
  }
}

// ========== NOTIFICATION FUNCTIONS ========== //
function sendNotifications(params, orderId) {
  const orderDetails = {
    name: params.name,
    email: params.email,
    product: params.product,
    quantity: params.quantity,
    address: params.address,
    contact: params.contact,
    notes: params.notes || ""
  };
  
  sendCustomerConfirmation(orderDetails, orderId);
  sendAdminNotification(orderDetails, orderId);
}

function sendCustomerConfirmation(order, orderId) {
  try {
    const subject = `Your ${CONFIG.BUSINESS_NAME} Order #${orderId}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2e7d32;">Thank you for your order, ${order.name}!</h2>
        <p>Your order <strong>#${orderId}</strong> has been received.</p>
        
        <h3 style="color: #2e7d32; border-bottom: 1px solid #eee; padding-bottom: 8px;">Order Details</h3>
        <p><strong>Product:</strong> ${order.product}</p>
        <p><strong>Quantity:</strong> ${order.quantity}</p>
        ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
        
        <h3 style="color: #2e7d32; border-bottom: 1px solid #eee; padding-bottom: 8px;">Delivery Information</h3>
        <p><strong>Address:</strong><br>${order.address.replace(/\n/g, '<br>')}</p>
        <p><strong>Contact:</strong> ${order.contact}</p>
        
        <p style="margin-top: 20px; font-size: 0.9em; color: #666;">
          Questions? Reply to this email or contact ${CONFIG.ADMIN_EMAIL}
        </p>
      </div>
    `;
    
    MailApp.sendEmail({
      to: order.email,
      subject: subject,
      htmlBody: htmlBody
    });
    log(`Sent confirmation to ${order.email}`, "DEBUG");
  } catch (error) {
    log(`Failed to send customer email: ${error.message}`, "ERROR");
  }
}

function sendAdminNotification(order, orderId) {
  try {
    const subject = `New Order #${orderId} - ${order.name}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #d32f2f;">New Order Received</h2>
        
        <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0;"><strong>Order #${orderId}</strong> from ${order.name}</p>
        </div>
        
        <h3 style="color: #d32f2f; border-bottom: 1px solid #eee; padding-bottom: 8px;">Customer Details</h3>
        <p><strong>Name:</strong> ${order.name}</p>
        <p><strong>Email:</strong> ${order.email}</p>
        <p><strong>Phone:</strong> ${order.contact}</p>
        
        <h3 style="color: #d32f2f; border-bottom: 1px solid #eee; padding-bottom: 8px;">Order Details</h3>
        <p><strong>Product:</strong> ${order.product}</p>
        <p><strong>Quantity:</strong> ${order.quantity}</p>
        ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
        
        <h3 style="color: #d32f2f; border-bottom: 1px solid #eee; padding-bottom: 8px;">Delivery Address</h3>
        <p>${order.address.replace(/\n/g, '<br>')}</p>
        
        <p style="margin-top: 20px; text-align: center;">
          <a href="https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/edit" 
             style="display: inline-block; padding: 10px 20px; background-color: #d32f2f; color: white; text-decoration: none; border-radius: 4px;">
            View in Order Sheet
          </a>
        </p>
      </div>
    `;
    
    MailApp.sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: subject,
      htmlBody: htmlBody
    });
    log(`Sent admin notification for order #${orderId}`, "DEBUG");
  } catch (error) {
    log(`Failed to send admin notification: ${error.message}`, "ERROR");
  }
}

// ========== UTILITY FUNCTIONS ========== //
function createSuccessResponse(orderId) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    orderId: orderId,
    message: "Order processed successfully"
  })).setMimeType(ContentService.MimeType.JSON);
}

function createErrorResponse(message) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "error",
    message: message
  })).setMimeType(ContentService.MimeType.JSON);
}

// ========== TEST FUNCTIONS ========== //
function testEmailCapture() {
  const testParams = {
    name: "Test User",
    contact: "9876543210",
    email: "test@example.com",
    product: "Sunflower Microgreens",
    quantity: "2 Trays",
    address: "123 Test Street",
    notes: "Please test this order",
    sendEmail: "yes"
  };
  
  const result = doPost({
    postData: {
      type: "application/x-www-form-urlencoded",
      contents: Object.keys(testParams)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(testParams[key])}`)
        .join('&')
    }
  });
  
  Logger.log(result.getContent());
}

function debugCheckSpreadsheet() {
  const { sheet, headers } = setupSpreadsheet();
  const lastRow = sheet.getLastRow();
  
  Logger.log("=== SPREADSHEET DEBUG ===");
  Logger.log(`Headers: ${headers.join(', ')}`);
  Logger.log(`Total rows: ${lastRow}`);
  
  if (lastRow > 1) {
    const lastOrder = sheet.getRange(lastRow, 1, 1, headers.length).getValues()[0];
    Logger.log("=== LAST ORDER ===");
    headers.forEach((header, i) => {
      Logger.log(`${header}: ${lastOrder[i]}`);
    });
    
    const emailCol = headers.indexOf(CONFIG.COLUMNS.EMAIL) + 1;
    if (emailCol > 0) {
      Logger.log(`Email column (${emailCol}) value: ${lastOrder[emailCol-1]}`);
    } else {
      Logger.log("Email column not found!");
    }
  }
}