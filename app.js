// Dynamic logo auto-detection
const logoExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
const logoBasePath = 'images/generated-image.';
const logoImg = document.getElementById('logo-img');
(function tryLogo(i=0) {
  if (i >= logoExtensions.length) {
    logoImg.alt = "Logo not found";
    logoImg.style.display = "none";
    return;
  }
  const ext = logoExtensions[i];
  const testImg = new Image();
  testImg.onload = function () {
    logoImg.src = logoBasePath + ext;
    logoImg.style.display = "inline";
  };
  testImg.onerror = function () { tryLogo(i + 1); };
  testImg.src = logoBasePath + ext;
})();

// Weight quick-fill function
function setWeight(qty) {
  document.getElementById('cqty').value = qty;
  updateMessage();
}

// Live update of WhatsApp preview message
function updateMessage() {
  const name     = document.getElementById('cname').value.trim();
  const contact  = document.getElementById('ccontact').value.trim();
  const product  = document.getElementById('cprod').value;
  const quantity = document.getElementById('cqty').value.trim();
  const address  = document.getElementById('caddr').value.trim();
  const notes    = document.getElementById('cnotes').value.trim();

  let msg = `Namaste! My name is ${name}.`;
  if (quantity && product) msg += ` I'd like to order ${quantity} of ${product}.`;
  if (contact) msg += ` Contact: ${contact}.`;
  if (address) msg += ` Address: ${address}.`;
  if (notes) msg += ` Notes: ${notes}.`;
  msg += ` Looking forward to your reply!`;
  document.getElementById('msg-preview').innerText = msg;
}

document.getElementById("order-form").oninput = updateMessage;

// Google Apps Script endpoint
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx9NEKxlLwMx-5cOBYlWlM4blXvlHTixCpcbsw_sFNZSmnMmKbMwrzGLOOZBPNZG6dN/exec";

// Form submission handler
function submitOrder(event) {
  event.preventDefault();

  const name     = document.getElementById('cname').value.trim();
  const contact  = document.getElementById('ccontact').value.trim();
  const product  = document.getElementById('cprod').value;
  const quantity = document.getElementById('cqty').value.trim();
  const address  = document.getElementById('caddr').value.trim();
  const notes    = document.getElementById('cnotes').value.trim();
  const responseBox = document.getElementById("submit-response");

  if (!name || !product || !quantity || !address || !contact) {
    responseBox.innerText = "❌ Please fill all required fields.";
    responseBox.style.color = "red";
    return false;
  }

  const data = new URLSearchParams();
  data.append("name", name);
  data.append("contact", contact);
  data.append("product", product);
  data.append("quantity", quantity);
  data.append("address", address);
  data.append("notes", notes);
  data.append("status", "Pending");

  // Submit to Google Sheets
  fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    body: data
  })
  .then(res => res.text())
  .then(text => {
    if (text.toLowerCase().includes("success")) {
      responseBox.innerText = "✅ Order submitted successfully!";
      responseBox.style.color = "green";
    } else {
      responseBox.innerText = "⚠️ Failed to save order.";
      responseBox.style.color = "red";
    }
  })
  .catch(() => {
    responseBox.innerText = "⚠️ Network error. Please try again.";
    responseBox.style.color = "red";
  });

  // Send to WhatsApp
  let waMsg = `Namaste! My name is ${name}. I’d like to order ${quantity} of ${product}.`;
  if (contact) waMsg += ` Contact: ${contact}.`;
  if (address) waMsg += ` Address: ${address}.`;
  if (notes) waMsg += ` Notes: ${notes}.`;
  waMsg += ` Looking forward to your reply!`;

  const waURL = `https://wa.me/919738560719?text=${encodeURIComponent(waMsg)}`;
  window.open(waURL, "_blank");

  document.getElementById("order-form").reset();
  updateMessage();
  return false;
}
