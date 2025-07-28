/******************************
 * MICROGREENS ORDER PROCESSOR *
 ******************************/

// ========== CONFIGURATION ========== //
const CONFIG = {
  SPREADSHEET_ID: "1J5OAhoDek9H66LFNp2MlEK-vzhs_E1i-jw9iG_4iP7Y",
  SHEET_NAME: "Sheet1",
  ADMIN_EMAIL: "aishauramicrogreens@gmail.com",
  BUSINESS_NAME: "Aishaura Microgreens",
  LOG_PREFIX: "🌱 [Aishaura]",

  // Column configuration
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
    EMAIL: "Email"
  }
};

// ========== CORS HEADERS ========== //
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

// ========== LOGGING ========== //
function log(message, level = "INFO") {
  const timestamp = new Date().toISOString();
  const logMessage = `${CONFIG.LOG_PREFIX} [${timestamp}] [${level}] ${message}`;
  Logger.log(logMessage);
}

// ========== MAIN ORDER PROCESSOR ========== //
// In your Google Apps Script (additional code)
function doPost(e) {
  try {
    let params;
    
    // Check content type
    if (e.postData && e.postData.type === "application/json") {
      params = JSON.parse(e.postData.contents);
    } else {
      params = e.parameter || {};
    }
    
    // Validate required fields
    const validation = validateOrderFields(params);
    if (!validation.valid) {
      return ContentService.createTextOutput(
        JSON.stringify({status: "error", message: validation.message})
      ).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Process order
    const { sheet, headers } = setupSpreadsheet();
    const orderId = generateSequentialOrderId(sheet);
    recordOrder(sheet, headers, params, orderId);
    
    // Send notifications if requested
    if (params.sendEmail === "yes") {
      sendNotifications(params, orderId);
    }
    
    return ContentService.createTextOutput(
      JSON.stringify({status: "success", orderId: orderId})
    ).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({status: "error", message: error.message})
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function processOrder(params) {
  try {
    const { sheet } = setupSpreadsheet();
    const orderId = generateSequentialOrderId(sheet);
    
    return {
      status: "success",
      orderId: orderId,
      message: "Order processed via JSONP"
    };
  } catch (e) {
    return {
      status: "error",
      message: e.message
    };
  }
}
function generateOrderId() {
  return Utilities.getUuid(); // Generates a unique ID
}

// Handle CORS preflight requests
function doOptions() {
  return ContentService.createTextOutput()
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders(CORS_HEADERS);
}

// ========== MANUAL TEST FUNCTION ========== //
function manualTestWithRequestData() {
  try {
    log("=== STARTING MANUAL TEST WITH REQUEST DATA ===");
    
    // Simulate the exact POST request data
    const testData = {
      name: "Test User",
      contact: "1234567890",
      email: "test@example.com",
      product: "Sunflower Shoots",
      quantity: "2 Trays",
      address: "123 Test St",
      notes: "Test order",
      sendEmail: "yes"
    };
    
    // Simulate the POST request
    const e = {
      postData: {
        type: "application/x-www-form-urlencoded",
        contents: Object.keys(testData)
          .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(testData[key])}`)
          .join('&')
      }
    };
    
    // Process the test request
    const result = doPost(e);
    log(`Test completed with result: ${result.getContent()}`, "INFO");
    
    return "Manual test completed successfully. Check logs for details.";
  } catch (error) {
    log(`Manual test failed: ${error.message}`, "ERROR");
    return `Manual test failed: ${error.message}`;
  }
}

// ========== CORE FUNCTIONS ========== //
function parseRequestData(e) {
  try {
    if (!e || !e.postData) return {};
    
    if (e.postData.type === "application/x-www-form-urlencoded") {
      const params = {};
      e.postData.contents.split('&').forEach(part => {
        const [key, value] = part.split('=');
        if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
      });
      return params;
    }
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error("Failed to parse request data");
  }
}

function validateOrderFields(params) {
  // Handle both single product and array formats
  const hasProducts = params.products || params.product;
  const hasQuantities = params.products || params.quantity;
  
  const requiredFields = ['name', 'contact', 'email', 'address'];
  const missingFields = requiredFields.filter(field => !params[field]);
  
  if (!hasProducts || !hasQuantities) {
    missingFields.push('products');
  }
  
  if (missingFields.length > 0) {
    return {
      valid: false,
      message: `Missing required fields: ${missingFields.join(', ')}`
    };
  }
  
  // Rest of validation...
}

function setupSpreadsheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Verify critical columns exist
    const requiredColumns = Object.values(CONFIG.COLUMNS);
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    
    if (missingColumns.length > 0) {
      // Auto-create missing columns
      missingColumns.forEach((col, index) => {
        const colNum = headers.length + index + 1;
        sheet.getRange(1, colNum).setValue(col);
        log(`Created missing column: ${col} at position ${colNum}`, "INFO");
      });
      SpreadsheetApp.flush();
      headers.push(...missingColumns);
    }
    
    return { spreadsheet, sheet, headers };
  } catch (error) {
    log(`Spreadsheet error: ${error.message}`, "ERROR");
    throw error;
  }
}

function generateSequentialOrderId(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const orderIdCol = headers.indexOf(CONFIG.COLUMNS.ORDER_ID) + 1;
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;
  
  const orderIds = sheet.getRange(2, orderIdCol, lastRow-1, 1)
    .getValues()
    .flat()
    .filter(id => !isNaN(id))
    .map(Number);
  
  return Math.max(0, ...orderIds) + 1;
}

function recordOrder(sheet, headers, params, orderId) {
  // Create empty row with correct number of columns
  const rowData = new Array(headers.length).fill('');
  
  // Set static values
  const timestamp = new Date();
  rowData[headers.indexOf(CONFIG.COLUMNS.TIMESTAMP)] = timestamp;
  rowData[headers.indexOf(CONFIG.COLUMNS.ORDER_ID)] = orderId;
  rowData[headers.indexOf(CONFIG.COLUMNS.STATUS)] = "Pending";
  
  // Map all form fields to columns
  const fieldMappings = {
    name: CONFIG.COLUMNS.NAME,
    contact: CONFIG.COLUMNS.PHONE,
    email: CONFIG.COLUMNS.EMAIL,
    product: CONFIG.COLUMNS.PRODUCT,
    quantity: CONFIG.COLUMNS.QUANTITY,
    address: CONFIG.COLUMNS.ADDRESS,
    notes: CONFIG.COLUMNS.NOTES
  };
  
  Object.entries(fieldMappings).forEach(([param, columnName]) => {
    const colIndex = headers.indexOf(columnName);
    if (colIndex !== -1) {
      rowData[colIndex] = params[param] || '';
      log(`Mapped ${param} to column ${columnName} (index ${colIndex}) with value: ${params[param] || ''}`, "DEBUG");
    }
  });
  
  // Write to spreadsheet
  sheet.appendRow(rowData);
  SpreadsheetApp.flush();
  
  return timestamp;
}

function verifyEmailStored(sheet, headers, orderId, expectedEmail) {
  const orderIdCol = headers.indexOf(CONFIG.COLUMNS.ORDER_ID) + 1;
  const emailCol = headers.indexOf(CONFIG.COLUMNS.EMAIL) + 1;
  
  // Find the order row
  const orderIds = sheet.getRange(2, orderIdCol, sheet.getLastRow()-1, 1)
    .getValues()
    .flat();
  const rowIndex = orderIds.indexOf(orderId) + 2;
  
  if (rowIndex < 2) throw new Error(`Order ${orderId} not found after saving`);
  
  // Get the stored email
  const storedEmail = sheet.getRange(rowIndex, emailCol).getValue();
  log(`Verify email: Expected '${expectedEmail}', Found '${storedEmail}'`, "DEBUG");
  
  if (String(storedEmail).trim() !== String(expectedEmail).trim()) {
    throw new Error(`Email not stored correctly! Expected '${expectedEmail}' but got '${storedEmail}'`);
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
  const subject = `Your ${CONFIG.BUSINESS_NAME} Order Confirmation (#${orderId})`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2e7d32;">Thank you for your order, ${order.name}!</h2>
      <p>We've received your order (#${orderId}) and will process it shortly.</p>
      
      <h3 style="color: #2e7d32;">Order Details</h3>
      <p><strong>Product:</strong> ${order.product}</p>
      <p><strong>Quantity:</strong> ${order.quantity}</p>
      ${order.notes ? `<p><strong>Your Notes:</strong> ${order.notes}</p>` : ''}

      <h3 style="color: #2e7d32;">Delivery Information</h3>
      <p><strong>Address:</strong> ${order.address}</p>
      <p><strong>Contact:</strong> ${order.contact}</p>
      <p><strong>Email:</strong> ${order.email}</p>

      <p>If you have any questions, please reply to this email.</p>
      <p>Regards,<br>${CONFIG.BUSINESS_NAME}</p>
    </div>
  `;
  
  MailApp.sendEmail({
    to: order.email,
    subject: subject,
    htmlBody: htmlBody
  });
}

function sendAdminNotification(order, orderId) {
  const subject = `New Order Received (#${orderId}) - ${order.name}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>New Order Notification</h2>
      <p><strong>Order ID:</strong> #${orderId}</p>
      <p><strong>Customer:</strong> ${order.name}</p>
      <p><strong>Contact:</strong> ${order.contact}</p>
      <p><strong>Email:</strong> ${order.email}</p>
      
      <h3>Order Details</h3>
      <p><strong>Product:</strong> ${order.product}</p>
      <p><strong>Quantity:</strong> ${order.quantity}</p>
      ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
      
      <h3>Delivery Address</h3>
      <p>${order.address}</p>
      
      <p><a href="https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/edit">View in Order Sheet</a></p>
    </div>
  `;
  
  MailApp.sendEmail({
    to: CONFIG.ADMIN_EMAIL,
    subject: subject,
    htmlBody: htmlBody
  });
}

// ========== UTILITY FUNCTIONS ========== //
function createSuccessResponse(orderId) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    orderId: orderId,
    message: "Order processed successfully"
  }))
  .setMimeType(ContentService.MimeType.JSON)
  .setHeaders(CORS_HEADERS);
}

function createErrorResponse(message) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "error",
    message: message
  }))
  .setMimeType(ContentService.MimeType.JSON)
  .setHeaders(CORS_HEADERS);
}

// ========== INITIALIZATION ========== //
function initialize() {
  log("Initializing system...");
  // Run any initialization tests here
}