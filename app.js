/******************************
 * MICROGREENS ORDER PROCESSOR - FRONTEND JS *
 ******************************/

// ========== QR Code library handling with robust loading ========== //
let qrCodeLoaded = typeof QRCode !== 'undefined';

if (!qrCodeLoaded) {
    console.log('QRCode library not loaded - loading dynamically');
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js';
    script.onload = () => {
        qrCodeLoaded = true;
        console.log('QRCode library successfully loaded');
        // If a checkout modal is open and on step 3, re-generate QR code
        if (document.getElementById('checkout-modal').style.display === 'block' && currentCheckoutStep === 3) {
            generatePaymentQRCode();
        }
    };
    script.onerror = () => {
        console.error('Failed to load QRCode library');
    };
    document.head.appendChild(script);
}

// ========== CONFIGURATION & DATA ========== //
console.log('Initializing microgreens application');
const storedCart = localStorage.getItem('microgreensCart');
console.log('Initial cart from localStorage:', storedCart ? JSON.parse(storedCart) : []);

// Product data with 15% increased prices (from your original code)
const productData = {
    "Sunflower Microgreens": {
        image: "images/sunflower.jpg",
        price: 100,
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
        price: 100,
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
        price: 90,
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
        price: 120,
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
        price: 120,
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

// Google Apps Script endpoint (REPLACE WITH YOUR DEPLOYED WEB APP URL)
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzdXFuRzjfHSSz5H-wBS0aU3d21o90OAzMgj9RUo4bHHEDG455iXEeN-yPvdLFogWL-/exec";

// Cart functionality
let cart = [];
let currentCheckoutStep = 1; // Tracks current step in checkout modal

// ========== INITIALIZATION ========== //
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded - initializing application');

    // Initialize cart from localStorage or empty array
    cart = storedCart ? JSON.parse(storedCart) : [];
    console.log('Cart initialized with:', cart);

    initializeModal();
    initializeCart();
    setupProductQuantity(); // Setup quantity controls for all product cards
    setupCheckout(); // Setup checkout button listeners
    updateCartDisplay(); // Initial display of cart items

    loadLogo();
});

// ========== LOGO LOADING ========== //
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

// ========== MODAL FUNCTIONS (Product & Recipe Details) ========== //
function initializeModal() {
    const modal = document.getElementById('product-modal');
    const closeBtn = document.querySelector('.close-modal');

    // Add click event to all product cards
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', function(e) {
            // Prevent modal from opening if quantity buttons or add to cart button are clicked
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
                usageList.innerHTML = '<h3>Usage Tips</h3>'; // Clear previous content and add heading
                const productUsageList = document.createElement('ul');
                product.usage.forEach(use => {
                    const li = document.createElement('li');
                    li.textContent = use;
                    productUsageList.appendChild(li);
                });
                usageList.appendChild(productUsageList);

                // Set initial quantity to 50g for modal add to cart
                document.querySelector('#product-modal .quantity-input').value = 50;

                document.getElementById('add-to-cart-modal').onclick = function() {
                    const quantity = parseInt(document.querySelector('#product-modal .quantity-input').value);
                    addToCart(productName, quantity, product.price);
                    modal.style.display = 'none';
                    document.body.style.overflow = 'auto'; // Re-enable scrolling
                };

                document.querySelector('#product-modal .quantity-selector').style.display = 'flex';
                document.getElementById('add-to-cart-modal').style.display = 'block';

                modal.style.display = 'block';
                document.body.style.overflow = 'hidden'; // Disable background scrolling
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
                document.getElementById('modal-price').textContent = ''; // Recipes don't have a price
                document.getElementById('modal-description').textContent = recipe.description;

                const benefitsList = document.getElementById('modal-benefits');
                benefitsList.innerHTML = '<h3>Benefits</h3>'; // Clear previous content and add heading
                const recipeBenefitsList = document.createElement('ul');
                recipe.benefits.forEach(benefit => {
                    const li = document.createElement('li');
                    li.textContent = benefit;
                    recipeBenefitsList.appendChild(li);
                });
                benefitsList.appendChild(recipeBenefitsList);

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

                document.querySelector('#product-modal .quantity-selector').style.display = 'none';
                document.getElementById('add-to-cart-modal').style.display = 'none';

                modal.style.display = 'block';
                document.body.style.overflow = 'hidden';
            }
        });
    });

    closeBtn.addEventListener('click', function() {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    });

    // Close modal if clicking outside content
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });
}

// ========== CART FUNCTIONS ========== //
function initializeCart() {
  // Improved cart toggle with scroll handling
let lastScrollPosition = 0;

document.getElementById('cart-icon').addEventListener('click', function(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('cart-dropdown');
  dropdown.classList.toggle('show');
  
  // Lock body scroll when cart is open
  if (dropdown.classList.contains('show')) {
    lastScrollPosition = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${lastScrollPosition}px`;
    document.body.style.width = '100%';
  } else {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    window.scrollTo(0, lastScrollPosition);
  }
});

// Close cart when clicking outside
document.addEventListener('click', function(e) {
  const cartContainer = document.getElementById('cart-container');
  if (!cartContainer.contains(e.target)) {
    document.getElementById('cart-dropdown').classList.remove('show');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    if (lastScrollPosition > 0) {
      window.scrollTo(0, lastScrollPosition);
    }
  }
});

    // Close cart dropdown if clicking outside
    document.addEventListener('click', function(event) {
        const cartContainer = document.getElementById('cart-container');
        const cartDropdown = document.getElementById('cart-dropdown');
        if (cartDropdown.classList.contains('show') && !cartContainer.contains(event.target)) {
            cartDropdown.classList.remove('show');
        }
    });

    document.getElementById('clear-cart').addEventListener('click', clearCart);

    document.getElementById('view-cart').addEventListener('click', function() {
        showCheckoutModal();
        document.getElementById('cart-dropdown').classList.remove('show');
    });

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

    // Re-attach event listeners by cloning and replacing, or use event delegation
    // Using event delegation for efficiency and robustness
    document.body.addEventListener('click', function(e) {
        if (e.target.classList.contains('quantity-btn')) {
            const btn = e.target;
            const input = btn.parentElement.querySelector('.quantity-input');
            let value = parseInt(input.value);
            const step = parseInt(input.step) || 50; // Default step to 50 if not set
            const min = parseInt(input.min) || 50;   // Default min to 50 if not set

            value = btn.classList.contains('minus')
                ? Math.max(min, value - step)
                : value + step;

            input.value = value;
        } else if (e.target.classList.contains('add-to-cart')) {
            const btn = e.target;
            const product = btn.getAttribute('data-product');
            const price = parseFloat(btn.getAttribute('data-price'));
            const quantity = parseInt(btn.parentElement.querySelector('.quantity-input').value);

            addToCart(product, quantity, price);
        }
    });
}

function addToCart(product, quantity, price) {
    console.log('Adding to cart:', { product, quantity, price });

    if (!product || !productData[product]) {
        console.error('Invalid product:', product);
        return;
    }

    quantity = Math.max(50, parseInt(quantity) || 50); // Ensure minimum quantity of 50g
    price = parseFloat(price) || productData[product].price;

    const existingIndex = cart.findIndex(item => item.product === product);
    if (existingIndex >= 0) {
        // If product exists, update quantity
        cart[existingIndex].quantity = quantity;
    } else {
        // Otherwise, add new item
        cart.push({ product, quantity, price });
    }

    localStorage.setItem('microgreensCart', JSON.stringify(cart));
    updateCartDisplay();
    showCartNotification(`${quantity}g of ${product} added to cart`);
}

function removeFromCart(index) {
    cart.splice(index, 1);
    localStorage.setItem('microgreensCart', JSON.stringify(cart));
    updateCartDisplay();
    if (cart.length === 0) {
        document.getElementById('checkout-modal').style.display = 'none'; // Close checkout if cart empty
        document.body.style.overflow = 'auto';
    }
}

// updateItemQuantity function (not used in current UI but kept for completeness if needed)
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
    document.getElementById('cart-dropdown').classList.remove('show');
    // Ensure checkout modal is also closed if open
    document.getElementById('checkout-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function updateCartDisplay() {
    const cartCount = document.getElementById('cart-count');
    const cartItems = document.getElementById('cart-items');
    const cartSubtotal = document.getElementById('cart-subtotal');
    const cartDelivery = document.getElementById('cart-delivery');
    const cartTotal = document.getElementById('cart-total');

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
        const itemPrice = (item.quantity / 50) * item.price; // Price per 50g
        subtotal += itemPrice;

        const itemElement = document.createElement('div');
        itemElement.className = 'cart-item';

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

    const total = subtotal; // Assuming delivery is always free

    cartSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
    cartDelivery.textContent = 'FREE'; // Hardcoded as free
    cartTotal.innerHTML = `<span>Total:</span> <span>₹${total.toFixed(2)}</span>`;

    // Re-attach event listeners for remove buttons
    document.querySelectorAll('.remove-item').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            removeFromCart(index);
        });
    });
}

function calculateOrderTotal() {
    console.log('Calculating order total from cart:', cart);
    const subtotal = cart.reduce((total, item) => {
        const itemTotal = (item.quantity / 50) * item.price;
        console.log(`Calculating: ${item.product} - ${item.quantity}g @ ₹${item.price}/50g = ₹${itemTotal.toFixed(2)}`);
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
    }, 10); // Small delay to trigger CSS transition

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300); // Wait for transition to finish before removing
    }, 3000);
}

// ========== CHECKOUT FUNCTIONS ========== //
function showCheckoutModal() {
    document.getElementById('checkout-modal').style.display = 'block';
    document.body.style.overflow = 'hidden'; // Disable background scrolling
    showCheckoutStep(1); // Always start from step 1
}

function showCheckoutStep(step) {
    currentCheckoutStep = step;

    // Update step indicators (progress dots)
    document.querySelectorAll('.step').forEach(stepEl => {
        stepEl.classList.remove('active');
        if (parseInt(stepEl.getAttribute('data-step')) <= step) {
            stepEl.classList.add('active');
        }
    });

    // Show/hide step content
    document.querySelectorAll('.checkout-step').forEach(stepEl => {
        stepEl.style.display = 'none';
    });
    document.getElementById(`step-${step}`).style.display = 'block';

    if (step === 1) {
        updateCheckoutItems(); // Update cart summary in step 1
    } else if (step === 3) {
        updatePaymentSummary(); // Update order summary in payment step
        generatePaymentQRCode(); // Generate QR code for payment
    }
}

function setupCheckout() {
    document.getElementById('btn-continue').addEventListener('click', function() {
        if (cart.length === 0) {
            alert('Your cart is empty. Please add items before placing an order.');
            return;
        }
        showCheckoutStep(2); // Go to Customer Info step
    });

    // Back buttons for checkout steps
    document.querySelectorAll('.btn-back').forEach(btn => {
        btn.addEventListener('click', function() {
            const currentStepEl = document.querySelector('.checkout-step[style="display: block;"]');
            const currentStep = parseInt(currentStepEl.id.replace('step-', ''));

            if (currentStep > 1) {
                showCheckoutStep(currentStep - 1);
            } else {
                // If on step 1, close the modal
                document.getElementById('checkout-modal').style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });
    });

    document.getElementById('btn-to-payment').addEventListener('click', function() {
        if (validateCustomerInfo()) {
            showCheckoutStep(3); // Go to Payment step
        }
    });

    // Payment option selection
    document.querySelectorAll('.payment-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.payment-option').forEach(opt => {
                opt.classList.remove('active');
            });
            this.classList.add('active');
        });
    });

    // Direct UPI pay button (from current modal, for quick access)
    document.getElementById('upi-pay-button').addEventListener('click', function() {
        const total = calculateOrderTotal();
        const upiLink = `upi://pay?pa=shashi.shashi7271@ybl&pn=Aishaura%20Microgreens&am=${total.toFixed(2)}&cu=INR&tn=Microgreens%20Order`;
        window.open(upiLink, '_blank');
    });

    document.getElementById('btn-place-order').addEventListener('click', submitOrder);

    // Close checkout modal
    document.querySelector('#checkout-modal .close-modal').addEventListener('click', function() {
        document.getElementById('checkout-modal').style.display = 'none';
        document.body.style.overflow = 'auto';
    });
}


function generatePaymentQRCode() {
    const total = calculateOrderTotal();
    const qrContainer = document.getElementById('upi-qr-code');
    qrContainer.innerHTML = ''; // Clear previous QR code or fallback

    // Always show the fallback first or as main content until QR is generated
    showQRCodeFallback(qrContainer, total);

    // Then try to generate QR code if library is available
    if (qrCodeLoaded && typeof QRCode !== 'undefined') {
        try {
            const qrData = `upi://pay?pa=shashi.shashi7271@ybl&pn=Aishaura%20Microgreens&am=${total.toFixed(2)}&cu=INR&tn=Microgreens%20Order`;
            new QRCode(qrContainer, { // This will replace the fallback content
                text: qrData,
                width: 150,
                height: 150,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        } catch (error) {
            console.error('QR code generation failed:', error);
            // If QR generation fails, ensure fallback is still visible
            showQRCodeFallback(qrContainer, total);
        }
    }
}

function showQRCodeFallback(qrContainer, total) {
    // This will be displayed if QR code library isn't loaded or fails.
    qrContainer.innerHTML = `
        <div class="upi-fallback">
            <p>Please send payment to:</p>
            <p class="upi-id">shashi.shashi7271@ybl</p>
            <p>Amount: ₹${total.toFixed(2)}</p>
            <button id="manual-upi-pay" class="upi-pay-button">Pay with UPI App</button>
        </div>
    `;

    document.getElementById('manual-upi-pay').addEventListener('click', function() {
        const upiLink = `upi://pay?pa=shashi.shashi7271@ybl&pn=Aishaura%20Microgreens&am=${total.toFixed(2)}&cu=INR&tn=Microgreens%20Order`;
        window.open(upiLink, '_blank');
    });
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
    document.getElementById('checkout-delivery').textContent = 'FREE'; // Hardcoded as free
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
        alert('Please fill all required fields: Name, Phone, Email, and Delivery Address.');
        return false;
    }

    if (phone.length < 10 || !/^\d+$/.test(phone)) { // Basic digit-only check
        alert('Please enter a valid 10-digit phone number.');
        return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { // More robust email regex
        alert('Please enter a valid email address.');
        return false;
    }

    return true;
}

// ========== ORDER SUBMISSION FUNCTIONS ========== //

async function submitOrder() {
    // Collect all required data
    const name = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    const email = document.getElementById('customer-email').value.trim();
    const address = document.getElementById('customer-address').value.trim();
    const notes = document.getElementById('customer-notes').value.trim();
    const paymentMethod = document.querySelector('.payment-option.active')?.getAttribute('data-method') || '';
    const total = calculateOrderTotal();
    const submitBtn = document.getElementById('btn-place-order');
    
    // Validate inputs
    if (!validateCustomerInfo()) return;

    // Prepare order data
    const orderData = {
        name: name,
        contact: phone,
        email: email,
        product: cart.map(item => `${item.product} (${item.quantity}g)`).join(', '),
        quantity: cart.reduce((acc, item) => acc + item.quantity, 0) + 'g',
        address: address,
        notes: notes,
        payment_method: paymentMethod,
        status: paymentMethod === 'upi' ? 'Pending UPI Payment' : 'Pending COD',
        sendEmail: 'yes',
        total_price: total.toFixed(2),
        total_amount: `₹${total.toFixed(2)}`, // Adding formatted total amount
        items: cart.map(item => ({
            name: item.product,
            quantity: `${item.quantity}g`,
            price: `₹${item.price}/50g`,
            item_total: `₹${((item.quantity / 50) * item.price).toFixed(2)}`
        }))
    };

    console.log('Submitting order:', orderData);

    // Set loading state
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="loader"></span>Processing your fresh greens...`;
    
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(orderData)
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const result = await response.json();
        
        if (result.status !== 'success') {
            throw new Error(result.message || 'Order submission failed');
        }

        // Success handling
        showOrderConfirmation(result.orderId, total);
        clearCart();

    } catch (error) {
        console.error('Submission error:', error);
        alert('🌱 Oops! Something sprouted wrong. Please try again.');
    } finally {
        // Reset button (with smooth transition)
        setTimeout(() => {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Order Placed! ✓';
            
            // Revert after 2 seconds
            setTimeout(() => {
                submitBtn.innerHTML = 'Place New Order';
            }, 2000);
        }, 500);
    }
}

// Helper function for showing confirmation
function showOrderConfirmation(orderId, total) {
    document.getElementById('confirmation-id').textContent = `#${orderId}`;
    document.getElementById('confirmation-total').textContent = `₹${total.toFixed(2)}`;
    showCheckoutStep(4);
}