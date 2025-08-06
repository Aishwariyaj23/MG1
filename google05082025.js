/******************************
 * COMPLETE MICROGREENS ORDER PROCESSOR *
 * - Fixed "Cannot read properties of null" error
 * - Ready for direct implementation
 ******************************/

const CONFIG = {
  // Core Configuration
  SPREADSHEET_ID: "1nlNFnKf-ai3AOGF8-NR45_FZcdOCKHbt5KTt6p_t0-w", // REPLACE WITH YOUR SHEET ID
  SHEET_NAME: "Sheet1",
  ADMIN_EMAIL: "aishauramicrogreens@gmail.com",
  BUSINESS_NAME: "Aishaura Microgreens",
  
  // Payment Configuration
  UPI_ID: "9738560719-0@airtel", // Your UPI ID
  BUSINESS_MOBILE: "9738560719", // Your UPI-registered mobile
  BANK_NOTIFICATION_EMAIL: "alerts@yourbank.com", // Your bank's notification email
  
  // Column Configuration
  COLUMNS: [
    "Timestamp",
    "Order ID",
    "Customer Name",
    "Phone",
    "Product",
    "Quantity",
    "Address",
    "Notes",
    "Status",
    "Payment Status",
    "Email",
    "Amount",
    "Payment Method",
    "Payment Link",
    "QR Code",
    "WhatsApp Message",
    "UTR Reference"
  ]
};

/**
 * Generates custom sequential order IDs in format: MG-{PRODUCTCODE}-{DATE}-{SEQUENCE}
 * Example: MG-SF-150624-1001 (Sunflower Microgreens ordered on 15-June-2024, sequence 1001)
 */
function generateOrderId() {
  try {
    const sheet = getSheet();
    const datePart = Utilities.formatDate(new Date(), "IST", "ddMMyy");
    
    // Get the last order number from sheet
    const lastOrder = sheet.getRange(sheet.getLastRow(), 2).getValue(); // Column B = Order IDs
    
    // Extract last sequence number
    let sequence = 1000; // Starting number
    if (lastOrder && lastOrder.startsWith("Aishaura-")) {
      const parts = lastOrder.split("-");
      if (parts.length === 3) {
        const lastSeq = parseInt(parts[2]);
        if (!isNaN(lastSeq)) sequence = lastSeq + 1;
      }
    }
    
    // Generate the new ID
    return `Aishaura-${datePart}-${sequence}`;
    
  } catch (e) {
    // Fallback format if any error occurs
    const fallbackDate = Utilities.formatDate(new Date(), "IST", "ddMMyy");
    return `Aishaura-${fallbackDate}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
}


// ======================
// 1. SHEET MANAGEMENT
// ======================

function getSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    
    if (!sheet) {
      // Create sheet if it doesn't exist
      sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
      sheet.appendRow(CONFIG.COLUMNS);
      console.log("Created new sheet with headers");
    }
    
    return sheet;
  } catch (error) {
    console.error("Failed to access sheet:", error);
    throw new Error("Could not access spreadsheet. Please check SPREADSHEET_ID and permissions.");
  }
}

// ======================
// 2. ORDER PROCESSING
// ======================

function doPost(e) {
  try {
    // Parse input
    const params = e.postData ? 
         JSON.parse(e.postData.contents) : 
         e.parameter;
    
    // Validate
    if (!params.name || !params.amount) {
      throw new Error("Missing required fields (name and amount)");
    }

    // Generate order ID (without product code)
    const orderId = generateOrderId();
    
    // Create payment assets
    const paymentLink = `upi://pay?pa=${CONFIG.UPI_ID}` +
                       `&pn=${encodeURIComponent(CONFIG.BUSINESS_NAME)}` +
                       `&am=${parseFloat(params.amount).toFixed(2)}` +
                       `&tn=Order%20${orderId}` +
                       `&cu=INR`;
    
    const qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${
      encodeURIComponent(paymentLink)
    }`;
    
    const whatsappMsg = `Namaskara ${params.name}! 🌱\n\n*Your ${CONFIG.BUSINESS_NAME} Order*\n` +
                       `🆔 #${orderId}\n💰 ₹${params.amount}\n\n` +
                       `🔗 Pay Now: ${paymentLink}\n` +
                        `We appreciate your order. You'll receive timely updates as we process it.`;

    // Save to sheet
    const sheet = getSheet();
    sheet.appendRow([
      new Date(),
      orderId,
      params.name,
      params.phone || "",
      params.product || "",
      params.quantity || "1",
      params.address || "",
      params.notes || "",
      "Pending Payment",
      "Awaiting Payment",
      params.email || "",
      params.amount,
      params.payment_method || "UPI",
      paymentLink,
      `=IMAGE("${qrCode}")`,
      whatsappMsg,
      "" // UTR field
    ]);

    // Send notifications
    sendCustomerNotification(params.email, orderId, params.amount, paymentLink, qrCode);
    sendAdminNotification("NEW_ORDER", orderId, params.name, params.amount);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      orderId: orderId,
      paymentLink: paymentLink,
      qrCode: qrCode
    }));

  } catch (error) {
    console.error("Order processing failed:", error);
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.message,
      stack: error.stack
    }));
  }
}

// ======================
// 3. NOTIFICATION SYSTEM
// ======================

function sendCustomerNotification(email, orderId, amount, paymentLink, qrCode) {
  try {
    const htmlBody = `
      <div style="font-family: Arial; max-width: 600px;">
        <h2 style="color: #27ae60;">Thank you for your order!</h2>
        <p>Order #${orderId} - ₹${amount}</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${paymentLink}" style="
            background-color: #4CAF50;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 5px;
          ">PAY NOW</a>
          <img src="${qrCode}" width="180" style="display: block; margin: 10px auto;">
        </div>
      </div>
    `;
    
    MailApp.sendEmail({
      to: email,
      subject: `Your ${CONFIG.BUSINESS_NAME} Order #${orderId}`,
      htmlBody: htmlBody
    });
  } catch (error) {
    console.error("Failed to send customer notification:", error);
  }
}

function sendAdminNotification(type, orderId, name, amount) {
  const templates = {
    NEW_ORDER: {
      subject: `📦 New Order #${orderId}`,
      body: `New order from ${name} for ₹${amount}`
    },
    PAYMENT_RECEIVED: {
      subject: `💰 Payment Received #${orderId}`,
      body: `Payment of ₹${amount} confirmed`
    }
  };
  
  try {
    MailApp.sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: templates[type].subject,
      body: templates[type].body
    });
  } catch (error) {
    console.error("Failed to send admin notification:", error);
  }
}

// ======================
// 4. INITIALIZATION
// ======================

function initialize() {
  try {
    // Verify sheet access
    const sheet = getSheet();
    console.log("Successfully accessed sheet:", sheet.getName());
    
    // Set up triggers
    ScriptApp.newTrigger('checkPayments')
      .timeBased()
      .everyHours(1)
      .create();
    
    console.log("System initialized successfully");
    return "SUCCESS";
  } catch (error) {
    console.error("Initialization failed:", error);
    return "FAILED: " + error.message;
  }
}

// ======================
// 5. TEST FUNCTIONS
// ======================

function testOrder() {
  const mockRequest = {
    postData: {
      contents: JSON.stringify({
        name: "Test Customer",
        phone: "9876543210",
        email: "test@example.com",
        amount: "150.50",
        product: "Sunflower Microgreens"
      }),
      type: "application/json"
    }
  };
  
  const result = doPost(mockRequest);
  console.log(result.getContent());
}

function testSetup() {
  console.log("Initialization result:", initialize());
}

// Run this first
function setup() {
  testSetup();
  testOrder();
}