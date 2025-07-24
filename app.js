// Product data
const productData = {
  "Sunflower Microgreens": {
    image: "images/sunflower.jpg",
    price: 60,
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
    price: 55,
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
    image: "images/mustard.png",
    price: 50,
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
    image: "images/Wheat-grass.jpg",
    price: 65,
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
    price: 60,
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

// Google Apps Script endpoint
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyqXsGVNYqX3UQoZLVIYcW9i4zI2No0OCV3JmYc0yEhlN0lhoj8w4bdaX_-Y3ZiRu9N6Q/exec";

// Cart functionality
let cart = JSON.parse(localStorage.getItem('microgreensCart')) || [];
let currentCheckoutStep = 1;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
  initializeModal();
  initializeCart();
  setupProductQuantity();
  setupCheckout();
  
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
});

function initializeModal() {
  const modal = document.getElementById('product-modal');
  const closeBtn = document.querySelector('.close-modal');
  
  // Add click event to all product cards
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', function(e) {
      // Don't open modal if clicking on quantity controls or add to cart button
      if (e.target.closest('.quantity-selector') || e.target.closest('.add-to-cart')) {
        return;
      }
      
      const productName = this.querySelector('.gallery-title').textContent;
      const product = productData[productName];
      
      if (product) {
        document.getElementById('modal-image').src = product.image;
        document.getElementById('modal-image').alt = productName;
        document.getElementById('modal-title').textContent = productName;
        document.getElementById('modal-price').textContent = `₹${product.price} per 50g`;
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
        
        // Set up add to cart button in modal
        document.getElementById('add-to-cart-modal').onclick = function() {
          const quantity = parseInt(document.querySelector('#product-modal .quantity-input').value);
          addToCart(productName, quantity, product.price);
          modal.style.display = 'none';
        };
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
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
}

function initializeCart() {
  // Cart toggle functionality
  document.getElementById('cart-icon').addEventListener('click', function() {
    document.getElementById('cart-dropdown').classList.toggle('show');
  });
  
  // Close cart when clicking outside
  document.addEventListener('click', function(event) {
    const cartContainer = document.getElementById('cart-container');
    if (!cartContainer.contains(event.target) && 
        event.target.id !== 'cart-icon' && 
        event.target.id !== 'cart-count') {
      document.getElementById('cart-dropdown').classList.remove('show');
    }
  });
  
  // Clear cart button
  document.getElementById('clear-cart').addEventListener('click', clearCart);
  
  // View cart button
  document.getElementById('view-cart').addEventListener('click', function() {
    showCheckoutModal();
    document.getElementById('cart-dropdown').classList.remove('show');
  });
  
  // Checkout button
  document.getElementById('checkout-btn').addEventListener('click', function() {
    if (cart.length === 0) {
      alert('Your cart is empty!');
      return;
    }
    showCheckoutModal();
    document.getElementById('cart-dropdown').classList.remove('show');
  });
}

function setupProductQuantity() {
  // Quantity buttons
  document.querySelectorAll('.quantity-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const input = this.parentElement.querySelector('.quantity-input');
      let value = parseInt(input.value);
      const step = parseInt(input.step) || 50;
      const min = parseInt(input.min) || 50;
      
      if (this.classList.contains('minus')) {
        value = Math.max(min, value - step);
      } else {
        value = value + step;
      }
      
      input.value = value;
    });
  });
  
  // Add to cart buttons
  document.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', function() {
      const product = this.getAttribute('data-product');
      const price = parseFloat(this.getAttribute('data-price'));
      const quantityInput = this.parentElement.querySelector('.quantity-input');
      const quantity = parseInt(quantityInput.value);
      
      addToCart(product, quantity, price);
    });
  });
}

function setupCheckout() {
  // Continue button
  document.getElementById('btn-continue').addEventListener('click', function() {
    if (cart.length === 0) {
      alert('Your cart is empty!');
      return;
    }
    showCheckoutStep(2);
  });

  // Back buttons
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', function() {
      const currentStep = parseInt(document.querySelector('.step.active').getAttribute('data-step'));
      showCheckoutStep(currentStep - 1);
    });
  });

  // To Payment button
  document.getElementById('btn-to-payment').addEventListener('click', function() {
    if (validateCustomerInfo()) {
      showCheckoutStep(3);
      updatePaymentSummary();
    }
  });

  // Payment method selection
  document.querySelectorAll('.payment-option').forEach(option => {
    option.addEventListener('click', function() {
      document.querySelectorAll('.payment-option').forEach(opt => {
        opt.classList.remove('active');
      });
      this.classList.add('active');
    });
  });

  // Place Order button
  document.getElementById('btn-place-order').addEventListener('click', function() {
    submitOrder();
  });

  // Close checkout modal
  document.querySelector('#checkout-modal .close-modal').addEventListener('click', function() {
    document.getElementById('checkout-modal').style.display = 'none';
  });
}

function addToCart(product, quantity, price) {
  const existingItem = cart.find(item => item.product === product);
  
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.push({
      product: product,
      quantity: quantity,
      price: price
    });
  }
  
  localStorage.setItem('microgreensCart', JSON.stringify(cart));
  updateCartDisplay();
  showCartNotification(`${product} added to cart`);
}

function removeFromCart(index) {
  cart.splice(index, 1);
  localStorage.setItem('microgreensCart', JSON.stringify(cart));
  updateCartDisplay();
}

function updateItemQuantity(index, newQuantity) {
  if (newQuantity >= 50) {
    cart[index].quantity = newQuantity;
    localStorage.setItem('microgreensCart', JSON.stringify(cart));
    updateCartDisplay();
  }
}

function clearCart() {
  cart = [];
  localStorage.removeItem('microgreensCart');
  updateCartDisplay();
  
  // Close cart dropdown if open
  document.getElementById('cart-dropdown').classList.remove('show');
}

function updateCartDisplay() {
  const cartCount = document.getElementById('cart-count');
  const cartItems = document.getElementById('cart-items');
  const cartSubtotal = document.getElementById('cart-subtotal');
  const cartDelivery = document.getElementById('cart-delivery');
  const cartTotal = document.getElementById('cart-total');
  
  // Update cart count
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = cart.reduce((sum, item) => sum + (item.quantity / 50), 0);
  
  // Update cart items
  cartItems.innerHTML = '';
  
  if (cart.length === 0) {
    cartItems.innerHTML = '<p style="text-align:center; color:#666;">Your cart is empty</p>';
    cartSubtotal.textContent = '₹0';
    cartDelivery.textContent = '₹0';
    cartTotal.textContent = 'Total: ₹0';
    return;
  }
  
  let subtotal = 0;
  
  cart.forEach((item, index) => {
    const itemElement = document.createElement('div');
    itemElement.className = 'cart-item';
    
    // Calculate item price
    const itemPrice = (item.quantity / 50) * item.price;
    subtotal += itemPrice;
    
    itemElement.innerHTML = `
      <div class="cart-item-info">
        <h4>${item.product}</h4>
        <div>${item.quantity}g (₹${item.price}/50g)</div>
      </div>
      <div class="cart-item-controls">
        <button class="decrease-item" data-index="${index}">-</button>
        <span>${item.quantity}g</span>
        <button class="increase-item" data-index="${index}">+</button>
        <button class="remove-item" data-index="${index}">×</button>
      </div>
    `;
    
    cartItems.appendChild(itemElement);
  });
  
  // Calculate delivery fee
  const deliveryFee = calculateDeliveryFee(subtotal);
  const total = subtotal + deliveryFee;
  
  // Update summary
  cartSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
  cartDelivery.textContent = deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`;
  cartTotal.innerHTML = `<span>Total:</span> <span>₹${total.toFixed(2)}</span>`;
  
  // Add event listeners to the new buttons
  document.querySelectorAll('.decrease-item').forEach(btn => {
    btn.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      updateItemQuantity(index, cart[index].quantity - 50);
    });
  });
  
  document.querySelectorAll('.increase-item').forEach(btn => {
    btn.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      updateItemQuantity(index, cart[index].quantity + 50);
    });
  });
  
  document.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      removeFromCart(index);
    });
  });
}

function calculateDeliveryFee(subtotal) {
  // Free delivery for orders over ₹500
  return subtotal > 500 ? 0 : 50;
}

function showCartNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'cart-notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

function showCheckoutModal() {
  document.getElementById('checkout-modal').style.display = 'block';
  showCheckoutStep(1);
}

function showCheckoutStep(step) {
  currentCheckoutStep = step;
  
  // Update step indicators
  document.querySelectorAll('.step').forEach(stepEl => {
    stepEl.classList.remove('active');
    if (parseInt(stepEl.getAttribute('data-step')) <= step) {
      stepEl.classList.add('active');
    }
  });

  // Show/hide steps
  document.querySelectorAll('.checkout-step').forEach(stepEl => {
    stepEl.style.display = 'none';
  });
  document.getElementById(`step-${step}`).style.display = 'block';

  // Update content for step 1
  if (step === 1) {
    updateCheckoutItems();
  }
}

function updateCheckoutItems() {
  const itemsContainer = document.getElementById('checkout-items');
  itemsContainer.innerHTML = '';
  
  let subtotal = 0;
  
  cart.forEach(item => {
    const itemElement = document.createElement('div');
    itemElement.className = 'order-item';
    
    const itemPrice = (item.quantity / 50) * item.price;
    subtotal += itemPrice;
    
    itemElement.innerHTML = `
      <div class="order-item-name">${item.product} (${item.quantity}g)</div>
      <div class="order-item-price">₹${itemPrice.toFixed(2)}</div>
    `;
    
    itemsContainer.appendChild(itemElement);
  });
  
  const deliveryFee = subtotal > 500 ? 0 : 50;
  const total = subtotal + deliveryFee;
  
  document.getElementById('checkout-subtotal').textContent = `₹${subtotal.toFixed(2)}`;
  document.getElementById('checkout-delivery').textContent = deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`;
  document.getElementById('checkout-total').textContent = `₹${total.toFixed(2)}`;
}

function updatePaymentSummary() {
  const container = document.getElementById('payment-order-items');
  container.innerHTML = '';
  
  cart.forEach(item => {
    const itemElement = document.createElement('div');
    itemElement.className = 'order-item';
    const itemPrice = (item.quantity / 50) * item.price;
    
    itemElement.innerHTML = `
      <div class="order-item-name">${item.product} (${item.quantity}g)</div>
      <div class="order-item-price">₹${itemPrice.toFixed(2)}</div>
    `;
    
    container.appendChild(itemElement);
  });
  
  const subtotal = cart.reduce((sum, item) => sum + (item.quantity / 50) * item.price, 0);
  const deliveryFee = subtotal > 500 ? 0 : 50;
  const total = subtotal + deliveryFee;
  
  document.getElementById('payment-total').textContent = `₹${total.toFixed(2)}`;
}

function validateCustomerInfo() {
  const name = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  const email = document.getElementById('customer-email').value.trim();
  const address = document.getElementById('customer-address').value.trim();
  
  if (!name || !phone || !email || !address) {
    alert('Please fill all required fields');
    return false;
  }
  
  if (phone.length < 10) {
    alert('Please enter a valid phone number');
    return false;
  }
  
  if (!email.includes('@')) {
    alert('Please enter a valid email address');
    return false;
  }
  
  return true;
}

async function submitOrder() {
  const name = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  const email = document.getElementById('customer-email').value.trim();
  const address = document.getElementById('customer-address').value.trim();
  const notes = document.getElementById('customer-notes').value.trim();
  const paymentMethod = document.querySelector('.payment-option.active').getAttribute('data-method');
  
  // Calculate total
  const subtotal = cart.reduce((sum, item) => sum + (item.quantity / 50) * item.price, 0);
  const deliveryFee = subtotal > 500 ? 0 : 50;
  const total = subtotal + deliveryFee;
  
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        name: name,
        contact: phone,
        email: email,
        products: JSON.stringify(cart),
        total: total,
        address: address,
        notes: notes,
        payment_method: paymentMethod,
        status: paymentMethod === 'cod' ? 'Pending Payment' : 'Pending',
        sendEmail: 'yes'
      })
    });
    
    const data = await response.json();
    
    if (data.status === "success") {
      // Show confirmation
      document.getElementById('confirmation-id').textContent = `#${data.orderId}`;
      document.getElementById('confirmation-total').textContent = `₹${total.toFixed(2)}`;
      showCheckoutStep(4);
      
      // Clear cart
      cart = [];
      localStorage.removeItem('microgreensCart');
      updateCartDisplay();
      
      // Send WhatsApp confirmation
      sendWhatsAppConfirmation(name, phone, data.orderId, total, paymentMethod, address, notes);
    } else {
      alert('Order submission failed. Please try again.');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Network error. Please check your connection and try again.');
  }
}

function sendWhatsAppConfirmation(name, phone, orderId, total, paymentMethod, address, notes) {
  const cleanedPhone = phone.replace(/\D/g, '');
  const whatsappNumber = cleanedPhone.startsWith('91') ? cleanedPhone : `91${cleanedPhone}`;
  
  if (whatsappNumber.length >= 12) {
    let message = `Namaskara ${name}! Thank you for your order with Aishaura Microgreens.\n\n`;
    message += `📦 *Order Confirmation:*\n`;
    message += `🆔 Order ID: #${orderId}\n`;
    
    // Add cart items
    cart.forEach(item => {
      message += `🌱 ${item.product}: ${item.quantity}g (₹${item.price}/50g)\n`;
    });
    
    message += `\n💰 *Order Total:* ₹${total.toFixed(2)}\n`;
    message += `💳 *Payment Method:* ${paymentMethod === 'upi' ? 'UPI' : 'Cash on Delivery'}\n`;
    message += `🏠 *Delivery Address:* ${address}\n`;
    
    if (notes) {
      message += `📝 *Special Instructions:* ${notes}\n`;
    }
    
    if (paymentMethod === 'upi') {
      message += `\nPlease complete your UPI payment to:\n`;
      message += `UPI ID: your.upi.id@bank\n\n`;
      message += `We'll process your order once payment is confirmed.`;
    } else {
      message += `\nWe'll process your order shortly. Please keep cash ready for delivery.`;
    }
    
    message += `\n\nThank you for choosing Aishaura Microgreens!`;
    
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  }
}
