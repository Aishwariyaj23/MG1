// Product data
const productData = {
  "Sunflower Microgreens": {
    image: "images/sunflower.jpg",
    description: "Sunflower microgreens are packed with nutrients and have a delightful crunchy texture.",
    benefits: [
      "High in protein for energy and muscle repair",
      "Rich in vitamin E and B6 for skin and brain health",
      "Contains magnesium and zinc for immune support",
      "Excellent source of healthy fats and amino acids"
    ],
    usage: [
      "Add to salads for extra crunch",
      "Top avocado toast for nutrition boost",
      "Blend into smoothies for protein",
      "Use as garnish for soups and curries"
    ]
  },
  "Radish Microgreens": {
    image: "images/radish.jpg",
    description: "Spicy radish microgreens add a kick to any dish while providing powerful nutrients.",
    benefits: [
      "High in vitamin C for immune support",
      "Contains sulforaphane, a potent antioxidant",
      "Supports healthy digestion",
      "May help regulate blood pressure"
    ],
    usage: [
      "Add to tacos and sandwiches for spice",
      "Mix into stir-fries at the last minute",
      "Combine with milder greens in salads",
      "Use as garnish for Asian dishes"
    ]
  },
  "Mustard Microgreens": {
    image: "images/Mustard.png",
    description: "Mustard microgreens bring bold flavor and impressive health benefits.",
    benefits: [
      "Rich in Vitamin K for bone health",
      "Contains compounds that support detoxification",
      "May help boost metabolism",
      "High in antioxidants"
    ],
    usage: [
      "Add to sandwiches for a flavor punch",
      "Mix into egg dishes like omelets",
      "Combine with cheese plates",
      "Use sparingly in dressings"
    ]
  },
  "Wheat Grass": {
    image: "images/wheat-grass.jpg",
    description: "Wheat grass is a nutrient-packed superfood known for its high chlorophyll content and detoxifying properties.",
    benefits: [
      "Rich in chlorophyll which supports blood health",
      "Contains 17 amino acids for protein building",
      "High in vitamins A, C, and E for immunity",
      "Powerful detoxifier and alkalizing agent"
    ],
    usage: [
      "Juice with lemon and ginger for a health shot",
      "Add to smoothies for nutrient boost",
      "Mix with water as a daily detox drink",
      "Use in salads for texture and nutrition"
    ]
  },
  "Mixed Microgreens": {
    image: "images/mixed.jpg",
    description: "Our mixed microgreens provide a variety of flavors and nutrients in one convenient package.",
    benefits: [
      "Provides diverse range of nutrients",
      "Offers multiple health benefits in one serving",
      "Contains variety of antioxidants",
      "Supports overall health and wellness"
    ],
    usage: [
      "Perfect base for salads",
      "Great addition to wraps and sandwiches",
      "Use as pizza topping after baking",
      "Mix into grain bowls for extra nutrition"
    ]
  }
};

// Modal functionality
document.addEventListener('DOMContentLoaded', function() {
  const modal = document.getElementById('product-modal');
  const closeBtn = document.querySelector('.close-modal');
  
  // Add click event to all product cards
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', function() {
      const productName = this.querySelector('.gallery-title').textContent;
      const product = productData[productName];
      
      if (product) {
        document.getElementById('modal-image').src = product.image;
        document.getElementById('modal-image').alt = productName;
        document.getElementById('modal-title').textContent = productName;
        document.getElementById('modal-description').textContent = product.description;
        
        const benefitsList = document.getElementById('modal-benefits');
        benefitsList.innerHTML = '';
        product.benefits.forEach(benefit => {
          const li = document.createElement('li');
          li.textContent = benefit;
          benefitsList.appendChild(li);
        });
        
        const usageList = document.getElementById('modal-usage');
        usageList.innerHTML = '';
        product.usage.forEach(use => {
          const li = document.createElement('li');
          li.textContent = use;
          usageList.appendChild(li);
        });
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent scrolling
      }
    });
  });
  
  // Close modal when clicking X
  closeBtn.addEventListener('click', function() {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
  });
  
  // Close modal when clicking outside
  window.addEventListener('click', function(event) {
    if (event.target === modal) {
      modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  });

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
});