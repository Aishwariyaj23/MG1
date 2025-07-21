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
  testImg.onload = function () {
    logoImg.src = logoBasePath + ext;
    logoImg.style.display = "inline";
  };
  testImg.onerror = function () { tryLogo(i + 1); };
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

  let msg = `Namaste! My name is ${name}.`;
  if (quantity && product) msg += ` I'd like to order ${quantity} of ${product}.`;
  if (contact) msg += ` Contact: ${contact}.`;
  if (address) msg += ` Address: ${address}.`;
  if (notes) msg += ` Notes: ${notes}.`;
  msg += ` Looking forward to your reply!`;

  document.getElementById('msg-preview').innerText = msg;
}

// Connect preview updater
document.getElementById("order-form").oninput = updateMessage;

// ✅ Setup your Google Apps Script endpoint here
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx9NEKxlLwMx-5cOBYlWlM4blXvlHTixCpcbsw_sFNZSmnMmKbMwrzGLOOZBPNZG6dN/exec";

// Select form and result box
const form = document.forms['order-form'];
const responseBox = document.getElementById("submit-response");

// Handle form submission
form.addEventListener('submit', function (event) {
  event.preventDefault();

  const name = document.getElementById('cname').value.trim();
  const contact = document.getElementById('ccontact').value.trim();
  const product = document.getElementById('cprod').value;
  const quantity = document.getElementById('cqty').value.trim();
  const address = document.getElementById('caddr').value.trim();
  const notes = document.getElementById('cnotes').value.trim();

  // ✅ Validate required fields
  if (!name || !contact || !product || !quantity || !address) {
    responseBox.innerText = "❌ Please fill all required fields.";
    responseBox.style.color = "red";
    return;
  }

  // 📨 Package data for submission (via FormData)
  const formData = new FormData(form);
  formData.append("status", "Pending");

  // ✅ Send Fetch request
  fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    body: formData
  })
    .then(res => res.text())
    .then(text => {
      if (text.toLowerCase().includes("success")) {
        responseBox.innerText = "✅ Order submitted successfully!";
        responseBox.style.color = "green";

        // Open WhatsApp message after success
        let waMsg = `Namaste! My name is ${name}. I’d like to order ${quantity} of ${product}.`;
        if (contact) waMsg += ` Contact: ${contact}.`;
        if (address) waMsg += ` Address: ${address}.`;
        if (notes) waMsg += ` Notes: ${notes}.`;
        waMsg += ` Looking forward to your reply!`;

        const waURL = `https://wa.me/919738560719?text=${encodeURIComponent(waMsg)}`;
        window.open(waURL, "_blank");

        // Reset form + preview
        form.reset();
        updateMessage();
      } else {
        responseBox.innerText = "⚠️ Order not saved. Please try again!";
        responseBox.style.color = "red";
      }
    })
    .catch(error => {
      console.error('Submit Error:', error);
      responseBox.innerText = "⚠️ Network error. Please try again.";
      responseBox.style.color = "red";
    });
});
