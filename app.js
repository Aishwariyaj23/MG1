// Dynamic logo auto-detection
const logoExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
const logoBasePath = 'images/generated-image.';
const logoImg = document.getElementById('logo-img');

(function tryLogo(i = 0) {
    if (i >= logoExtensions.length) {
        logoImg.alt = "Logo not found";
        logoImg.style.display = "none";
        return;
    }
    const ext = logoExtensions[i];
    const testImg = new Image();
    testImg.onload = function() {
        logoImg.src = logoBasePath + ext;
        logoImg.style.display = "inline";
    };
    testImg.onerror = function() {
        tryLogo(i + 1);
    };
    testImg.src = logoBasePath + ext;
})();

// Set quick-weight button functionality
function setWeight(qty) {
    document.getElementById('cqty').value = qty;
    updateMessage();
}

// Live preview message updater
function updateMessage() {
    const name = document.getElementById('cname').value.trim();
    const contact = document.getElementById('ccontact').value.trim();
    const product = document.getElementById('cprod').value;
    const quantity = document.getElementById('cqty').value.trim();
    const address = document.getElementById('caddr').value.trim();
    const notes = document.getElementById('cnotes').value.trim();

    let msg = `Namaskara! My name is ${name}.`;
    if (quantity && product) msg += ` I'd like to order ${quantity} of ${product}.`;
    if (contact) msg += ` Contact: ${contact}.`;
    if (address) msg += ` Address: ${address}.`;
    if (notes) msg += ` Notes: ${notes}.`;
    msg += ` Looking forward to your reply!`;

    document.getElementById('msg-preview').innerText = msg;
}

// Connect preview updater
document.getElementById("order-form").addEventListener('input', updateMessage);

// Google Apps Script endpoint
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyqXsGVNYqX3UQoZLVIYcW9i4zI2No0OCV3JmYc0yEhlN0lhoj8w4bdaX_-Y3ZiRu9N6Q/exec";

// Form submission handler
document.getElementById("order-form").addEventListener('submit', async function(event) {
    event.preventDefault();
    
    const responseBox = document.getElementById("submit-response");
    const form = event.target;
    
    // Validate required fields
    const requiredFields = ['cname', 'ccontact', 'cemail', 'cprod', 'cqty', 'caddr'];
    const missingFields = requiredFields.filter(id => !document.getElementById(id).value.trim());
    
    if (missingFields.length > 0) {
        responseBox.innerHTML = '<span style="color:red">❌ Please fill all required fields.</span>';
        return;
    }

    // Show loading state
    responseBox.innerHTML = '<span style="color:blue">⏳ Submitting order...</span>';

    try {
        // Get contact number and clean it
        const rawContact = document.getElementById('ccontact').value.trim();
        const cleanedContact = rawContact.replace(/\D/g, ''); // Remove all non-digit characters
        const whatsappNumber = cleanedContact.startsWith('91') ? cleanedContact : `91${cleanedContact}`;
        
        // Prepare form data
        const formData = {
            name: document.getElementById('cname').value.trim(),
            contact: rawContact,
            email: document.getElementById('cemail').value.trim(),
            product: document.getElementById('cprod').value,
            quantity: document.getElementById('cqty').value.trim(),
            address: document.getElementById('caddr').value.trim(),
            notes: document.getElementById('cnotes').value.trim(),
            status: 'Pending',
            sendEmail: 'yes'
        };

        // Convert to URL-encoded string
        const urlEncoded = Object.entries(formData)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');

        // Submit to Google Sheets
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: urlEncoded
        });
        
        const data = await response.json();
        
        if (data.status === "success") {
            // Enhanced success message with prominent order ID
            responseBox.innerHTML = `
                <div style="color:green; font-weight:bold; font-size:1.1em; margin-bottom:10px">
                    ✅ Order Submitted Successfully!
                </div>
                <div style="background:#f0f8ff; padding:12px; border-radius:8px; margin-bottom:10px">
                    <div style="font-weight:bold; margin-bottom:5px">Your Order Details:</div>
                    <div><strong>Order ID:</strong> #${data.orderId}</div>
                    <div><strong>Product:</strong> ${formData.product}</div>
                    <div><strong>Quantity:</strong> ${formData.quantity}</div>
                    ${formData.notes ? `<div><strong>Notes:</strong> ${formData.notes}</div>` : ''}
                </div>
                <div style="color:#555; font-size:0.9em">
                    We've sent confirmation to your WhatsApp and email.
                </div>
            `;
            
            // Prepare WhatsApp message
            const waMsg = `Namaskara ${formData.name}! Thank you for your order with Aishaura Microgreens.

📦 *Order Confirmation:*
🆔 Order ID: #${data.orderId}
🌱 Product: ${formData.product}
📦 Quantity: ${formData.quantity}
🏠 Delivery Address: ${formData.address}
${formData.notes ? `📝 Notes: ${formData.notes}` : ''}

We'll process your order shortly. You'll receive another message when your order is out for delivery.

Thank you for choosing Aishaura Microgreens!`;

            // Send WhatsApp message to customer
            if (whatsappNumber.length >= 12) { // 91 + 10 digit number
                const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(waMsg)}`;
                
                // Open WhatsApp in new tab (visible to user)
                window.open(whatsappUrl, '_blank');
                
                // Also send silently in background
                fetch(whatsappUrl, { mode: 'no-cors' })
                    .catch(e => console.log('WhatsApp notification sent'));
            }
            
            // Reset form
            form.reset();
            updateMessage();
        } else {
            responseBox.innerHTML = `
                <div style="color:red; font-weight:bold">
                    ⚠️ Order Submission Failed
                </div>
                <div style="margin-top:5px">
                    ${data.message || 'Please try again later.'}
                </div>
            `;
        }
    } catch (error) {
        console.error('Submission error:', error);
        responseBox.innerHTML = `
            <div style="color:red; font-weight:bold">
                ⚠️ Network Error
            </div>
            <div style="margin-top:5px">
                Please check your internet connection and try again.
            </div>
        `;
    }
});