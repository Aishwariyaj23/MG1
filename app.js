// QR Code library check
if (typeof QRCode === 'undefined') {
  console.log('QRCode library not loaded - loading dynamically');
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js';
  document.head.appendChild(script);
}

// Debug initialization
console.log('Initializing microgreens application');
console.log('Initial cart from localStorage:', JSON.parse(localStorage.getItem('microgreensCart')));

// Product data with 15% increased prices
const productData = {
  "Sunflower Microgreens": {
    image: "images/sunflower.jpg",
    price: 69,
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
    price: 63,
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
    price: 58,
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
    price: 75,
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
    price: 69,
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

// Recipe data
const recipeData = {
  "Microgreens Avocado Toast": {
    image: "images/avocado-toast.jpg",
    description: "A nutritious and delicious breakfast option packed with healthy fats and microgreen nutrients.",
    ingredients: [
      "2 slices whole grain bread",
      "1 ripe avocado",
      "50g sunflower microgreens",
      "1 tbsp lemon juice",
      "Salt and pepper to taste",
      "Red pepper flakes (optional)"
    ],
    instructions: [
      "Toast the bread until golden and crisp.",
      "Mash the avocado with lemon juice, salt, and pepper.",
      "Spread the avocado mixture evenly on the toast.",
      "Top generously with sunflower microgreens.",
      "Sprinkle with red pepper flakes if desired.",
      "Serve immediately and enjoy!"
    ],
    benefits: [
      "Rich in healthy monounsaturated fats from avocado",
      "High in fiber for digestive health",
      "Packed with vitamins and minerals from microgreens",
      "Provides sustained energy throughout the morning"
    ]
  },
  "Sunflower Green Smoothie": {
    image: "images/sunflower-smoothie.jpg",
    description: "A protein-packed smoothie that's perfect for post-workout recovery or a nutritious breakfast.",
    ingredients: [
      "1 banana",
      "1 cup almond milk",
      "50g sunflower microgreens",
      "1 tbsp almond butter",
      "1 tsp honey (optional)",
      "Ice cubes"
    ],
    instructions: [
      "Add all ingredients to a blender.",
      "Blend until smooth and creamy.",
      "Add more almond milk if needed for desired consistency.",
      "Pour into a glass and enjoy immediately."
    ],
    benefits: [
      "High in plant-based protein",
      "Rich in vitamins and minerals",
      "Great for muscle recovery",
      "Provides sustained energy"
    ]
  },
  "Microgreen Buddha Bowl": {
    image: "images/buddha-bowl.jpg",
    description: "A colorful and nutritious bowl packed with wholesome ingredients and fresh microgreens.",
    ingredients: [
      "1 cup cooked quinoa",
      "50g mixed microgreens",
      "1/2 avocado, sliced",
      "1/2 cup chickpeas",
      "1/4 cup shredded carrots",
      "1/4 cup sliced cucumber",
      "2 tbsp tahini dressing"
    ],
    instructions: [
      "Arrange quinoa at the bottom of a bowl.",
      "Add microgreens, avocado, chickpeas, carrots, and cucumber.",
      "Drizzle with tahini dressing.",
      "Toss gently before eating or enjoy as arranged."
    ],
    benefits: [
      "Complete plant-based meal",
      "High in fiber and protein",
      "Packed with vitamins and antioxidants",
      "Supports gut health"
    ]
  },
  "Radish Microgreen Salad": {
    image: "images/radish-salad.jpg",
    description: "A refreshing and spicy salad with radish microgreens as the star ingredient.",
    ingredients: [
      "50g radish microgreens",
      "1 cup mixed salad greens",
      "1/2 cup cherry tomatoes, halved",
      "1/4 cup sliced radishes",
      "2 tbsp olive oil",
      "1 tbsp lemon juice",
      "Salt and pepper to taste"
    ],
    instructions: [
      "Combine radish microgreens, salad greens, tomatoes, and radishes in a bowl.",
      "Whisk together olive oil, lemon juice, salt, and pepper.",
      "Drizzle dressing over salad and toss gently.",
      "Serve immediately for maximum freshness."
    ],
    benefits: [
      "High in vitamin C",
      "Supports digestion",
      "Low calorie but nutrient-dense",
      "Antioxidant-rich"
    ]
  }
};

// Google Apps Script endpoint
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyqXsGVNYqX3UQoZLVIYcW9i4zI2No0OCV3JmYc0yEhlN0lhoj8w4bdaX_-Y3ZiRu9N6Q/exec";

// Cart functionality
let cart = [];
let currentCheckoutStep = 1;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM fully loaded - initializing application');
  
  // Initialize cart from localStorage or empty array
  const storedCart = localStorage.getItem('microgreensCart');
  cart = storedCart ? JSON.parse(storedCart) : [];
  console.log('Cart initialized with:', cart);
  
  initializeModal();
  initializeCart();
  setupProductQuantity();
  setupCheckout();
  
  // Dynamic logo loading
  loadLogo();
});

function loadLogo() {
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
}

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
        
        // Show quantity selector and add to cart button for products
        document.querySelector('#product-modal .quantity-selector').style.display = 'flex';
        document.getElementById('add-to-cart-modal').style.display = 'block';
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
      }
    });
  });
  
  // Add click event to all recipe cards
  document.querySelectorAll('.recipe-art').forEach(recipeCard => {
    recipeCard.addEventListener('click', function() {
      const recipeName = this.querySelector('.gallery-title').textContent;
      const recipe = recipeData[recipeName];
      
      if (recipe) {
        document.getElementById('modal-image').src = recipe.image;
        document.getElementById('modal-image').alt = recipeName;
        document.getElementById('modal-title').textContent = recipeName;
        document.getElementById('modal-price').textContent = '';
        document.getElementById('modal-description').textContent = recipe.description;
        
        const benefitsList = document.getElementById('modal-benefits');
        benefitsList.innerHTML = '';
        recipe.benefits.forEach(benefit => {
          const li = document.createElement('li');
          li.textContent = benefit;
          benefitsList.appendChild(li);
        });
        
        const usageList = document.getElementById('modal-usage');
        usageList.innerHTML = '<h3>Ingredients</h3>';
        const ingredientsList = document.createElement('ul');
        recipe.ingredients.forEach(ingredient => {
          const li = document.createElement('li');
          li.textContent = ingredient;
          ingredientsList.appendChild(li);
        });
        usageList.appendChild(ingredientsList);
        
        usageList.innerHTML += '<h3>Instructions</h3>';
        const instructionsList = document.createElement('ol');
        recipe.instructions.forEach(instruction => {
          const li = document.createElement('li');
          li.textContent = instruction;
          instructionsList.appendChild(li);
        });
        usageList.appendChild(instructionsList);
        
        // Hide quantity selector and add to cart button for recipes
        document.querySelector('#product-modal .quantity-selector').style.display = 'none';
        document.getElementById('add-to-cart-modal').style.display = 'none';
        
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
    const cartDropdown = document.getElementById('cart-dropdown');
    if (!cartContainer.contains(event.target)) {
      cartDropdown.classList.remove('show');
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
  console.log('Setting up product quantity controls');
  
  // Remove any existing listeners first
  document.querySelectorAll('.quantity-btn, .add-to-cart').forEach(el => {
    el.replaceWith(el.cloneNode(true));
  });

  // Quantity adjustment buttons
  document.querySelectorAll('.quantity-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const input = this.parentElement.querySelector('.quantity-input');
      let value = parseInt(input.value);
      const step = parseInt(input.step);
      const min = parseInt(input.min) || 50;
      
      value = this.classList.contains('minus') 
        ? Math.max(min, value - step) 
        : value + step;
      
      input.value = value;
    });
  });
  
  // Add to cart with event delegation
  document.body.addEventListener('click', function(e) {
    if (e.target.classList.contains('add-to-cart')) {
      const btn = e.target;
      const product = btn.getAttribute('data-product');
      const price = parseFloat(btn.getAttribute('data-price'));
      const quantity = parseInt(btn.parentElement.querySelector('.quantity-input').value);
      
      addToCart(product, quantity, price);
    }
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
      if (currentStep > 1) {
        showCheckoutStep(currentStep - 1);
      } else {
        document.getElementById('checkout-modal').style.display = 'none';
      }
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

  // UPI Pay button
  document.getElementById('upi-pay-button').addEventListener('click', function() {
    const total = calculateOrderTotal();
    const upiLink = `upi://pay?pa=shashi.shashi7271@ybl&pn=Aishaura%20Microgreens&am=${total}&cu=INR&tn=Microgreens%20Order`;
    window.open(upiLink, '_blank');
  });

  // Place Order button
  document.getElementById('btn-place-order').addEventListener('click', function() {
    submitOrder();
  });

  // Close checkout modal
  document.querySelector('#checkout-modal .close-modal').addEventListener('click', function() {
    document.getElementById('checkout-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
  });
}

function addToCart(product, quantity, price) {
  console.log('Adding to cart:', {product, quantity, price});
  
  // Validate inputs
  if (!product || !productData[product]) {
    console.error('Invalid product:', product);
    return;
  }
  
  quantity = Math.max(50, parseInt(quantity) || 50);
  price = parseFloat(price) || productData[product].price;

  // Update or add item
  const existingIndex = cart.findIndex(item => item.product === product);
  if (existingIndex >= 0) {
    cart[existingIndex].quantity = quantity;
  } else {
    cart.push({ product, quantity, price });
  }
  
  // Persist and update UI
  localStorage.setItem('microgreensCart', JSON.stringify(cart));
  updateCartDisplay();
  showCartNotification(`${quantity}g of ${product} added to cart`);
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
  
  // Update cart count to show total number of items (not grams)
  cartCount.textContent = cart.length;
  
  cartItems.innerHTML = '';
  
  if (cart.length === 0) {
    cartItems.innerHTML = '<p style="text-align:center; color:#666;">Your cart is empty</p>';
    cartSubtotal.textContent = '₹0';
    cartDelivery.textContent = 'FREE';
    cartTotal.textContent = 'Total: ₹0';
    return;
  }
  
  let subtotal = 0;
  
  cart.forEach((item, index) => {
    const itemElement = document.createElement('div');
    itemElement.className = 'cart-item';
    
    // Calculate price based on exact quantity
    const itemPrice = (item.quantity / 50) * item.price;
    subtotal += itemPrice;
    
    itemElement.innerHTML = `
      <div class="cart-item-info">
        <h4>${item.product}</h4>
        <div>${item.quantity}g @ ₹${item.price}/50g</div>
        <div class="item-total">₹${itemPrice.toFixed(2)}</div>
      </div>
      <button class="remove-item" data-index="${index}">×</button>
    `;
    
    cartItems.appendChild(itemElement);
  });
  
  const total = subtotal;
  
  cartSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
  cartDelivery.textContent = 'FREE';
  cartTotal.innerHTML = `<span>Total:</span> <span>₹${total.toFixed(2)}</span>`;
  
  // Add event listeners to remove buttons
  document.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      removeFromCart(index);
    });
  });
}

function calculateDeliveryFee() {
  return 0; // Free delivery for all orders
}

function calculateOrderTotal() {
  console.log('Calculating order total from cart:', cart);
  const subtotal = cart.reduce((total, item) => {
    const itemTotal = (item.quantity / 50) * item.price;
    console.log(`Calculating: ${item.product} - ${item.quantity}g @ ₹${item.price} = ₹${itemTotal}`);
    return total + itemTotal;
  }, 0);
  console.log('Final subtotal:', subtotal);
  return subtotal;
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
  document.body.style.overflow = 'hidden';
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
  
  // Generate QR code for payment step
  if (step === 3) {
    const total = calculateOrderTotal();
    const qrData = `upi://pay?pa=aishaura.greens@upi&pn=Aishaura%20Microgreens&am=${total}&cu=INR&tn=Microgreens%20Order`;
    
    // Clear previous QR code
    const qrContainer = document.getElementById('upi-qr-code');
    qrContainer.innerHTML = '';
    
    // Add a small delay to ensure element is visible and ready
    setTimeout(() => {
      try {
        // Verify the container exists and is visible
        if (qrContainer && qrContainer.offsetParent !== null) {
          new QRCode(qrContainer, {
            text: qrData,
            width: 150,
            height: 150,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
          });
        } else {
          console.error('QR code container not visible');
        }
      } catch (error) {
        console.error('QR code generation failed:', error);
        // Fallback - show UPI ID prominently
        qrContainer.innerHTML = `
          <div style="text-align:center; padding:20px;">
            <p>Please send payment to:</p>
            <p style="font-weight:bold; font-size:1.2rem;">aishaura.greens@upi</p>
            <p>Amount: ₹${total.toFixed(2)}</p>
          </div>
        `;
      }
    }, 100);
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
  
  const total = subtotal;
  
  document.getElementById('checkout-subtotal').textContent = `₹${subtotal.toFixed(2)}`;
  document.getElementById('checkout-delivery').textContent = 'FREE';
  document.getElementById('checkout-total').textContent = `₹${total.toFixed(2)}`;
}

function updatePaymentSummary() {
  const container = document.getElementById('payment-order-items');
  container.innerHTML = '';
  
  const total = cart.reduce((sum, item) => {
    const itemPrice = (item.quantity / 50) * item.price;
    container.innerHTML += `
      <div class="order-item">
        <div class="order-item-name">${item.product} (${item.quantity}g)</div>
        <div class="order-item-price">₹${itemPrice.toFixed(2)}</div>
      </div>
    `;
    return sum + itemPrice;
  }, 0);
  
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
  const total = calculateOrderTotal();
  
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
      message += `UPI ID: aishaura.greens@upi\n\n`;
      message += `We'll process your order once payment is confirmed.`;
    } else {
      message += `\nWe'll process your order shortly. Please keep cash ready for delivery.`;
    }
    
    message += `\n\nThank you for choosing Aishaura Microgreens!`;
    
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  }
}
