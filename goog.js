
function doPost(e) {
  try {
    // Parse incoming data
    const params = e.parameter;
    Logger.log("Incoming parameters: " + JSON.stringify(params));
    
    // Validate required fields
    if (!params.name || !params.phone || !params.amount) {
      throw new Error("Missing required fields");
    }

    // Generate sequential order ID
    const orderId = generateOrderId();
    
    // Generate payment details
    const paymentLink = generateUPILink(params.amount, orderId);
    const qrCode = generateQRCode(paymentLink);
    const whatsappMsg = generateWhatsappMessage(
      WHATSAPP_TEMPLATES.ORDER_CONFIRMED.template,
      {
        name: params.name,
        orderId: orderId,
        amount: params.amount,
        product: params.product || "microgreens",
        payment_link: paymentLink,
        //qr_code: qrCode
      }
    );

    // Prepare order data with all fields populated
    const orderData = [
      new Date(),
      orderId,
      params.name,
      params.phone,
      params.product || "Mixed Microgreens",
      params.quantity || "1",
      params.address || "",
      params.notes || "",
      params.payment_method === 'upi' ? 'Pending UPI Payment' : 'Pending COD',
      "Pending",
      params.email || "",
      parseFloat(params.amount).toFixed(2),
      params.payment_method || "UPI",
      paymentLink, // Payment Link
      qrCode,      // QR Code
      whatsappMsg, // WhatsApp Message
      ""           // UTR Reference
    ];

    // Write to sheet
    const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
    sheet.appendRow(orderData);
     if (params.email) {

      Logger.log("Attempting to send customer email...");

      const paymentLink = generateUPILink(params.amount, orderId);

      const qrCode = generateQRCode(paymentLink);

      

      const emailSent = sendOrderConfirmationEmail(
        params.email, 
        orderId, 
        params.name, 
        params.amount,
        paymentLink,
        qrCode
      );

      

      Logger.log("Customer email result: " + (emailSent ? "SUCCESS" : "FAILED"));

    } else {

      Logger.log("No customer email to send");

    }



    // Admin notification with logging

    Logger.log("Sending admin notification...");

    sendAdminNotification("NEW_ORDER", orderId, params.name, params.amount);

    Logger.log("Admin notification sent");

    // Return proper JSON response
    const response = {
      status: "success",
      orderId: orderId,
      amount: params.amount
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // Return proper error response
    const errorResponse = {
      status: "error",
      message: error.message
    };
    return ContentService.createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}