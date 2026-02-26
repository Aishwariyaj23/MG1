/******************************
 * MICROGREENS ORDER PROCESSOR - FRONTEND JS *
 ******************************/

// ========== QR Code library handling with robust loading ========== //
let qrCodeLoaded = typeof QRCode !== 'undefined';

// Load QRCode library dynamically if not present
if (!qrCodeLoaded) {
    console.log('QRCode library not loaded - loading dynamically');
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'; // ✅ correct library
    script.onload = () => {
        qrCodeLoaded = true;
        console.log('QRCode library successfully loaded');

        // If modal is open and step = 3, generate QR
        if (isCheckoutStepThree()) {
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

// Product and Reviews API Configuration
const GOOGLE_PRODUCTS_API_BASE_URL = "https://script.google.com/macros/s/AKfycbzwV0e_Ygbg25D1u9-3aDIOa_eKbGpDxKnIrKKRHs_kiyylp4FYDON_0eUofu0RtOha9w/exec";
const GOOGLE_PRODUCTS_API_URL = `${GOOGLE_PRODUCTS_API_BASE_URL}?action=products`;
const GOOGLE_REVIEWS_API_URL = "https://script.google.com/macros/s/AKfycbzAI6b3XPOlXSW46pJPD-VFsJS5GogesuOb6ftgAPYPHTpzG5X23GdrfmDR-OnDnzN1/exec";

// Global variable to hold product data (will be fetched from Google Sheets API)
let productData = {};

/**
 * Fetch product data from Google Sheets via Apps Script API
 * Called on page load to populate all products and reviews
 */
async function fetchProductDataFromSheets() {
  try {
    console.log('Fetching products and reviews from Google Sheets...');
    
    // Create abort controller with 15 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const requestOptions = {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal
      };

      const [productsResponse, reviewsResponse] = await Promise.all([
        fetch(GOOGLE_PRODUCTS_API_URL, requestOptions),
        fetch(GOOGLE_REVIEWS_API_URL, requestOptions)
      ]);

      clearTimeout(timeoutId);

      if (!productsResponse.ok) {
        throw new Error(`Products API HTTP error! status: ${productsResponse.status}`);
      }

      const productsResult = await productsResponse.json();
      let reviewsResult = null;

      if (reviewsResponse.ok) {
        reviewsResult = await reviewsResponse.json();
      } else {
        console.warn(`Reviews API HTTP error! status: ${reviewsResponse.status}`);
      }

      if (productsResult.success && productsResult.data && typeof productsResult.data === 'object') {
        productData = productsResult.data;

        // Ensure each product has review-safe defaults.
        Object.keys(productData).forEach((name) => {
          const p = productData[name];
          p.customerReviews = Array.isArray(p.customerReviews) ? p.customerReviews : [];
          p.reviews = Number.isFinite(Number(p.reviews)) ? Number(p.reviews) : p.customerReviews.length;
          p.rating = Number.isFinite(Number(p.rating)) ? Number(p.rating) : calculateAverageRatingFromList(p.customerReviews);
        });

        // Merge reviews from external reviews-only API.
        if (reviewsResult) {
          const reviewsByProduct = normalizeReviewsResponse(reviewsResult);
          const normalizedProductLookup = {};
          Object.keys(productData).forEach((name) => {
            normalizedProductLookup[normalizeProductKey(name)] = name;
          });

          Object.keys(reviewsByProduct).forEach((incomingName) => {
            const exactMatch = productData[incomingName] ? incomingName : null;
            const normalizedMatch = normalizedProductLookup[normalizeProductKey(incomingName)];
            const targetName = exactMatch || normalizedMatch;
            if (!targetName) return;

            const reviewList = reviewsByProduct[incomingName];
            productData[targetName].customerReviews = reviewList;
            productData[targetName].reviews = reviewList.length;
            productData[targetName].rating = calculateAverageRatingFromList(reviewList);
          });
        }

        console.log('✓ Product data loaded from Google Sheets:', Object.keys(productData).length, 'products');
        
        // DEBUG: Log prices for each product
        console.log('=== PRICES FROM GOOGLE SHEETS ===');
        Object.keys(productData).forEach(key => {
          const p = productData[key];
          console.log(`${p.name}: ₹${p.price}/50g (stored as "${p.price}")`);
        });
        console.log('=================================');
        
        return productData;
      } else {
        console.warn('Products API returned unexpected format:', productsResult);
        loadFallbackData();
        return productData;
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('Google Sheets API request timed out (15s)');
      } else {
        console.error('Fetch error:', fetchError.message);
      }
      loadFallbackData();
      return productData;
    }
  } catch (error) {
    console.error('Unexpected error in fetchProductDataFromSheets:', error);
    loadFallbackData();
    return productData;
  }
}

function normalizeProductKey(name) {
  return String(name || '').trim().toLowerCase();
}

function calculateAverageRatingFromList(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) return 0;
  const total = reviews.reduce((sum, review) => sum + (parseFloat(review.rating) || 0), 0);
  return Math.round((total / reviews.length) * 10) / 10;
}

function sanitizeReviewItem(item) {
  return {
    name: item && item.name ? String(item.name).trim() : 'Anonymous',
    rating: parseFloat(item && item.rating) || 0,
    text: item && (item.text || item.review || item.comment) ? String(item.text || item.review || item.comment).trim() : '',
    date: item && item.date ? String(item.date).trim() : 'Recently'
  };
}

function normalizeReviewsResponse(result) {
  const reviewsByProduct = {};

  const attachReview = (productName, rawReview) => {
    const key = String(productName || '').trim();
    if (!key) return;
    if (!reviewsByProduct[key]) reviewsByProduct[key] = [];
    reviewsByProduct[key].push(sanitizeReviewItem(rawReview));
  };

  const parseReviewArray = (arr) => {
    arr.forEach((item) => {
      const productName = item && (item.product || item.productName || item.product_name || item.name);
      if (productName) attachReview(productName, item);
    });
  };

  // Case 1: { success:true, data:{ "Product": { customerReviews:[...] } } }
  // Case 2: { success:true, data:{ "Product": [...] } }
  if (result && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    Object.keys(result.data).forEach((productName) => {
      const value = result.data[productName];
      if (Array.isArray(value)) {
        value.forEach((review) => attachReview(productName, review));
      } else if (value && Array.isArray(value.customerReviews)) {
        value.customerReviews.forEach((review) => attachReview(productName, review));
      } else if (value && Array.isArray(value.reviews)) {
        value.reviews.forEach((review) => attachReview(productName, review));
      }
    });
  }

  // Case 3: { success:true, data:[{ product, name, rating, text, date }, ...] }
  if (result && Array.isArray(result.data)) {
    if (result.product) {
      result.data.forEach((review) => attachReview(result.product, review));
    } else {
      parseReviewArray(result.data);
    }
  }

  // Case 4: { reviews:[...] } or raw array payload.
  if (result && Array.isArray(result.reviews)) {
    parseReviewArray(result.reviews);
  }
  if (Array.isArray(result)) {
    parseReviewArray(result);
  }

  return reviewsByProduct;
}

/**
 * Fallback: No hardcoded data - only fetch from Google Sheets
 * Products must be added to the Google Sheet to display on the website
 */
function loadFallbackData() {
  console.warn('⚠️ No hardcoded product data available. Ensure products are added to Google Sheets.');
  productData = {};
}

function formatCurrency(value, options = {}) {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const minimumFractionDigits = Number.isFinite(options.minimumFractionDigits)
    ? options.minimumFractionDigits
    : (Number.isInteger(safeAmount) ? 0 : 2);
  const maximumFractionDigits = Number.isFinite(options.maximumFractionDigits)
    ? options.maximumFractionDigits
    : 2;

  return `INR ${safeAmount.toLocaleString('en-IN', { minimumFractionDigits, maximumFractionDigits })}`;
}

function renderProductSkeletons(count = 6) {
  const gallery = document.getElementById('products-gallery');
  if (!gallery) return;

  gallery.innerHTML = Array.from({ length: count }).map(() => `
    <div class="card skeleton-card" aria-hidden="true">
      <div class="skeleton-image"></div>
      <div class="skeleton-line skeleton-line-sm"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-actions"></div>
    </div>
  `).join('');
}

function getProductTags(product, ratingValue, reviewCount, isOffer) {
  const tags = [];
  const harvestText = String(product?.harvestDate || '').toLowerCase();

  if (ratingValue >= 4.6 && reviewCount >= 2) {
    tags.push({ label: 'Top Rated', className: 'tag-top-rated' });
  }
  if (reviewCount >= 6) {
    tags.push({ label: 'Best Seller', className: 'tag-best-seller' });
  }
  if (harvestText.includes('today') || harvestText.includes('new')) {
    tags.push({ label: 'New Harvest', className: 'tag-new-harvest' });
  }
  if (isOffer) {
    tags.push({ label: 'Offer', className: 'tag-offer' });
  }

  return tags.slice(0, 2);
}

function setupProductFilters() {
  const toolbar = document.getElementById('products-toolbar');
  if (!toolbar || setupProductFilters.initialized) return;
  setupProductFilters.initialized = true;

  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.product-filter');
    if (!btn) return;

    toolbar.querySelectorAll('.product-filter').forEach((node) => node.classList.remove('active'));
    btn.classList.add('active');
    activeProductFilter = btn.getAttribute('data-filter') || 'all';
    applyProductFilter();
  });
}

function applyProductFilter() {
  const cards = document.querySelectorAll('#products-gallery .card');
  const gallery = document.getElementById('products-gallery');
  const existingEmpty = document.getElementById('products-filter-empty');
  if (!cards.length) {
    if (existingEmpty) existingEmpty.remove();
    return;
  }

  let visibleCount = 0;

  cards.forEach((card) => {
    const rating = parseFloat(card.getAttribute('data-rating') || '0');
    const hasOffer = card.getAttribute('data-offer') === 'true';
    let show = true;

    switch (activeProductFilter) {
      case 'top-rated':
        show = rating >= 4.5;
        break;
      case 'offers':
        show = hasOffer;
        break;
      default:
        show = true;
    }

    card.classList.toggle('is-hidden', !show);
    if (show) visibleCount += 1;
  });

  if (!gallery) return;
  if (visibleCount === 0 && activeProductFilter !== 'all') {
    if (!existingEmpty) {
      const empty = document.createElement('p');
      empty.id = 'products-filter-empty';
      empty.className = 'products-filter-empty';
      empty.textContent = 'No products match this filter right now.';
      gallery.insertAdjacentElement('afterend', empty);
    }
  } else if (existingEmpty) {
    existingEmpty.remove();
  }
}

/**
 * Render product cards dynamically from productData into the gallery
 */
function renderProductsToGallery() {
  const gallery = document.getElementById('products-gallery');
  
  if (!gallery) {
    console.error('Products gallery container not found');
    return;
  }

  // Clear existing products
  gallery.innerHTML = '';

  // Check if we have any products
  if (!productData || Object.keys(productData).length === 0) {
    gallery.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">No products available. Please add products to your Google Sheet.</p>';
    console.warn('No products available to display');
    return;
  }

  // Render each product as a card
  Object.keys(productData).forEach((productName) => {
    const product = productData[productName];
    
    console.log(`[RENDERING] ${productName} - Price in productData: ${formatCurrency(product.price)}`);
    
    // Calculate discount percentage (if original price is available)
    let discountHTML = '';
    let priceHTML = `<span class="discounted-price">${formatCurrency(product.price)}</span>`;
    
    if (product.originalPrice && product.originalPrice > product.price) {
      const discountPercent = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
      discountHTML = `<span class="savings-badge">${discountPercent}% OFF</span>`;
      priceHTML += `<span class="original-price">${formatCurrency(product.originalPrice)}</span>`;
    }

    // Build rating stars (simplified)
    const rating = Number(product.rating || 0);
    const displayRating = rating > 0 ? rating : 5;
    const ratingStars = '★'.repeat(Math.floor(displayRating)) + (displayRating % 1 > 0 ? '☆' : '');
    const reviewCount = Number(product.reviews || 0);
    const isOffer = Boolean(product.originalPrice && product.originalPrice > product.price);
    const productTags = getProductTags(product, rating, reviewCount, isOffer);
    const tagsHTML = productTags.length
      ? `<div class="product-tags">${productTags.map((tag) => `<span class="product-tag ${tag.className}">${tag.label}</span>`).join('')}</div>`
      : '';
    // Create product card HTML
    const cardHTML = `
      <div class="card" role="listitem" data-rating="${rating}" data-offer="${isOffer}">
        <img src="${product.image || 'images/default.jpg'}" alt="${productName}">
        <div class="card-rating">
          <span class="stars">${ratingStars}</span>
          <span class="rating-count">(${reviewCount})</span>
        </div>
        <div class="gallery-title">${productName}</div>
        ${tagsHTML}
        <div class="product-price">
          ${priceHTML}
          ${discountHTML}
        </div>
        <div class="quantity-selector">
          <button class="quantity-btn minus">-</button>
          <input type="number" value="50" min="50" step="50" class="quantity-input">
          <span class="quantity-unit">gm</span>
          <button class="quantity-btn plus">+</button>
        </div>
        <button class="add-to-cart" data-product="${productName}" data-price="${product.price}">+ Add to Cart</button>
      </div>
    `;

    gallery.innerHTML += cardHTML;
  });

  console.log(`✓ Rendered ${Object.keys(productData).length} products from Google Sheets`);
  
  // Re-initialize cart handlers for new product cards
  setupProductQuantity();
  applyProductFilter();
}

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
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzdTBvtcJ7wJJa86a7v-R27jnwsFY1UeUg1bWCzOhOo0oSfD5P8E9yvBWs-kjHVizFL/exec";
// Auth Apps Script endpoint (DEPLOY google_auth_email_otp.gs and paste URL here)
const AUTH_API_URL = "https://script.google.com/macros/s/AKfycbxJeFJtk-9Jiex-tTQf6aP7ZDevWiEPi2sm87_eHruhad4JSpvZaLq1mHuydpZ0qQZf/exec";
const AUTH_STORAGE_KEY = "microgreensAuthSession";
const AUTH_RESEND_COOLDOWN_SECONDS = 60;
const REFERRAL_PRICING = {
    enabled: true,
    minOrderAmount: 199,
    discountType: 'percent', // 'percent' or 'flat'
    discountPercent: 10,
    discountCap: 80,
    flatDiscount: 60
};

// Cart functionality
let cart = [];
let currentCheckoutStep = 1; // Tracks current step in checkout modal
let activeModalProduct = null; // For live quantity -> price helper in product modal
let activeProductFilter = 'all';
let authState = {
    sessionToken: '',
    user: null,
    expiresAt: ''
};
let authOtpStepEnabled = false;
let authResendUntilMs = 0;
let authResendTimerId = null;
let authNavBusy = false;
let authMode = 'signin';
let prefilledReferralCode = '';
let authVerifyInProgress = false;
let authUserMenuOpen = false;

// ========== INITIALIZATION ========== //
document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('DOM fully loaded - initializing application');

        // Initialize cart from localStorage or empty array
        cart = storedCart ? JSON.parse(storedCart) : [];
        console.log('Cart initialized with:', cart);

        // CRITICAL: Fetch product data from Google Sheets BEFORE initializing UI
        // This ensures all product info and reviews are available when needed
        renderProductSkeletons();
        try {
            await fetchProductDataFromSheets();
        } catch (apiError) {
            console.warn('Error during data fetch:', apiError);
            loadFallbackData();
        }

        // Render products from Google Sheets to gallery
        renderProductsToGallery();
        setupProductFilters();

        initializeModal();
        initializeCart();
        initializeMiniCart();
        setupProductQuantity(); // Setup quantity controls for all product cards
        setupCheckout(); // Setup checkout button listeners
        await initAuth(); // Optional login flow, isolated from order flow
        updateCartDisplay(); // Initial display of cart items

        loadLogo();
                initFloatingWhatsApp();
                initContactModal();
                initContactSectionEnhancements();
                initWhatsAppBadge();
                initWhatsAppVisibilityOnInput();
                initWhatsAppDismiss();
                initReviewsModal();
                initSectionReveal();
    } catch (initError) {
        console.error('Error during application initialization:', initError);
        // Attempt fallback to ensure basic functionality
        loadFallbackData();
        renderProductsToGallery();
        setupProductFilters();
        console.log('Application loaded with fallback data');
    }
});

// ========== AUTH (EMAIL OTP, OPTIONAL) ========== //
function isAuthConfigured() {
    const url = String(AUTH_API_URL || '').trim();
    return url && !url.includes('PASTE_AUTH_WEBAPP_URL_HERE');
}

function getAuthUI() {
    return {
        navAction: document.getElementById('nav-auth-action'),
        modal: document.getElementById('auth-modal'),
        feedback: document.getElementById('auth-feedback'),
        emailInput: document.getElementById('auth-email'),
        otpInput: document.getElementById('auth-otp'),
        otpHint: document.getElementById('auth-otp-hint'),
        nameInput: document.getElementById('auth-name'),
        phoneInput: document.getElementById('auth-phone'),
        referralInput: document.getElementById('auth-referral'),
        otpGroup: document.getElementById('auth-otp-group'),
        nameGroup: document.getElementById('auth-name-group'),
        phoneGroup: document.getElementById('auth-phone-group'),
        referralGroup: document.getElementById('auth-referral-group'),
        stepEmail: document.getElementById('auth-step-email'),
        stepOtp: document.getElementById('auth-step-otp'),
        sendOtpBtn: document.getElementById('auth-send-otp'),
        verifyOtpBtn: document.getElementById('auth-verify-otp'),
        modeSignInBtn: document.getElementById('auth-mode-signin'),
        modeSignUpBtn: document.getElementById('auth-mode-signup'),
        closeBtn: document.querySelector('#auth-modal .close-modal'),
        userMenu: document.getElementById('nav-user-menu'),
        userMenuReferBtn: document.getElementById('nav-user-refer'),
        userMenuLogoutBtn: document.getElementById('nav-user-logout')
    };
}

function getAuthDisplayName(user) {
    if (!user) return 'User';
    const shorten = (value) => {
        const text = String(value || '').trim();
        if (!text) return '';
        return text.length > 14 ? `${text.slice(0, 14)}...` : text;
    };
    if (user.name && String(user.name).trim()) {
        return shorten(String(user.name).trim().split(' ')[0]);
    }
    if (user.email && String(user.email).includes('@')) {
        return shorten(String(user.email).split('@')[0]);
    }
    return 'User';
}

function closeAuthUserMenu() {
    const ui = getAuthUI();
    if (!ui.userMenu) return;
    ui.userMenu.hidden = true;
    authUserMenuOpen = false;
    if (ui.navAction) ui.navAction.setAttribute('aria-expanded', 'false');
}

function openAuthUserMenu() {
    const ui = getAuthUI();
    if (!ui.userMenu || !isAuthLoggedIn()) return;
    ui.userMenu.hidden = false;
    authUserMenuOpen = true;
    if (ui.navAction) ui.navAction.setAttribute('aria-expanded', 'true');
}

function toggleAuthUserMenu() {
    if (authUserMenuOpen) {
        closeAuthUserMenu();
        return;
    }
    openAuthUserMenu();
}

function getCurrentReferralCode() {
    return normalizeReferralCodeInput(authState?.user?.referral_code || '');
}

function buildReferralInviteLink(referralCode) {
    const code = normalizeReferralCodeInput(referralCode);
    if (!code) return '';
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    return `${baseUrl}?ref=${encodeURIComponent(code)}`;
}

function buildReferralWhatsAppLink(referralCode) {
    const code = normalizeReferralCodeInput(referralCode);
    if (!code) return '';
    const inviteLink = buildReferralInviteLink(code);
    const message = `Try Aishaura Microgreens. Use my referral code ${code} while signing up: ${inviteLink}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

async function copyTextToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        const temp = document.createElement('textarea');
        temp.value = String(text || '');
        temp.setAttribute('readonly', '');
        temp.style.position = 'absolute';
        temp.style.left = '-9999px';
        document.body.appendChild(temp);
        temp.select();
        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (copyErr) {
            copied = false;
        }
        document.body.removeChild(temp);
        return copied;
    }
}

function renderReferralCards() {
    const referralCode = getCurrentReferralCode();
    const cards = [
        document.getElementById('cart-referral-card'),
        document.getElementById('checkout-referral-card'),
        document.getElementById('confirmation-referral-card')
    ];

    cards.forEach((card) => {
        if (!card) return;
        if (!isAuthLoggedIn() || !referralCode) {
            card.style.display = 'none';
            card.removeAttribute('data-referral-code');
            const codeNodes = card.querySelectorAll('.referral-code-value');
            codeNodes.forEach((node) => { node.textContent = '-'; });
            return;
        }
        card.style.display = 'block';
        card.setAttribute('data-referral-code', referralCode);
        const codeNodes = card.querySelectorAll('.referral-code-value');
        codeNodes.forEach((node) => { node.textContent = referralCode; });
    });
}

function getReferralPricingForSubtotal(subtotal) {
    const safeSubtotal = Math.max(0, Number(subtotal) || 0);
    const hasAppliedReferral = !!normalizeReferralCodeInput(authState?.user?.referred_by_code || '');
    if (!REFERRAL_PRICING.enabled || !isAuthLoggedIn() || !hasAppliedReferral) {
        return { eligible: false, discount: 0, reason: 'not-linked' };
    }
    if (safeSubtotal < Number(REFERRAL_PRICING.minOrderAmount || 0)) {
        return { eligible: false, discount: 0, reason: 'below-min-order' };
    }

    let discount = 0;
    if (REFERRAL_PRICING.discountType === 'flat') {
        discount = Number(REFERRAL_PRICING.flatDiscount || 0);
    } else {
        const percent = Math.max(0, Number(REFERRAL_PRICING.discountPercent || 0));
        const cap = Math.max(0, Number(REFERRAL_PRICING.discountCap || 0));
        discount = (safeSubtotal * percent) / 100;
        if (cap > 0) {
            discount = Math.min(discount, cap);
        }
    }

    discount = Math.max(0, Math.min(safeSubtotal, Math.round(discount * 100) / 100));
    return {
        eligible: discount > 0,
        discount: discount,
        reason: discount > 0 ? 'applied' : 'zero'
    };
}

function getPricingSummary() {
    const subtotal = cart.reduce((total, item) => {
        const itemTotal = (Number(item.quantity || 0) / 50) * Number(item.price || 0);
        return total + itemTotal;
    }, 0);
    const referral = getReferralPricingForSubtotal(subtotal);
    const total = Math.max(0, subtotal - referral.discount);
    return {
        subtotal: Math.round(subtotal * 100) / 100,
        referralDiscount: referral.discount,
        total: Math.round(total * 100) / 100,
        referralEligible: referral.eligible,
        referralReason: referral.reason
    };
}

function openReferralFromMenu() {
    if (!isAuthLoggedIn()) {
        openAuthModal();
        return;
    }
    closeAuthUserMenu();
    showCheckoutModal();
    showCheckoutStep(1);
    renderReferralCards();
}

function initReferralUiActions() {
    if (initReferralUiActions.initialized) return;
    initReferralUiActions.initialized = true;

    document.addEventListener('click', async function (event) {
        const copyButton = event.target.closest('[data-referral-copy]');
        if (copyButton) {
            const card = copyButton.closest('.referral-card');
            const code = normalizeReferralCodeInput(card?.getAttribute('data-referral-code') || getCurrentReferralCode());
            if (!code) {
                showErrorNotification('Referral code is not available yet. Please login first.', 'Referral unavailable');
                return;
            }
            const copied = await copyTextToClipboard(code);
            if (!copied) {
                showErrorNotification('Could not copy code automatically.', 'Copy failed');
                return;
            }
            showCartNotification({
                kind: 'success',
                title: 'Referral copied',
                message: `Code ${code} copied to clipboard.`,
                iconClass: 'fa-regular fa-copy',
                duration: 1700
            });
            return;
        }

        const waButton = event.target.closest('[data-referral-whatsapp]');
        if (waButton) {
            const card = waButton.closest('.referral-card');
            const code = normalizeReferralCodeInput(card?.getAttribute('data-referral-code') || getCurrentReferralCode());
            if (!code) {
                showErrorNotification('Referral code is not available yet. Please login first.', 'Referral unavailable');
                return;
            }
            const shareLink = buildReferralWhatsAppLink(code);
            if (!shareLink) return;
            window.open(shareLink, '_blank');
        }
    });
}

function isAnyModalOpen() {
    return Array.from(document.querySelectorAll('.modal')).some((modal) => modal && modal.style.display === 'block');
}

function syncBodyScrollLock() {
    document.body.style.overflow = isAnyModalOpen() ? 'hidden' : 'auto';
}

function clearAuthCookies() {
    const cookieNames = ['microgreensAuthSession', 'auth_session', 'session_token', 'mg_auth'];
    const domains = [window.location.hostname, `.${window.location.hostname}`];
    const paths = ['/', window.location.pathname || '/'];

    cookieNames.forEach((name) => {
        paths.forEach((path) => {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; SameSite=Lax`;
            domains.forEach((domain) => {
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; domain=${domain}; SameSite=Lax`;
            });
        });
    });
}

function clearClientAuthArtifacts() {
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (error) {
        console.warn('Failed to clear auth localStorage key:', error);
    }

    try {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (error) {
        console.warn('Failed to clear auth sessionStorage key:', error);
    }

    try {
        clearAuthCookies();
    } catch (error) {
        console.warn('Failed to clear auth cookies:', error);
    }
}

function readAuthStateFromStorage() {
    try {
        // Security hardening: keep auth state only for current tab session.
        let raw = "";
        try {
            raw = sessionStorage.getItem(AUTH_STORAGE_KEY) || "";
        } catch (storageErr) {
            console.warn('Session storage unavailable for auth restore:', storageErr);
        }

        // Remove any legacy persistent token from localStorage.
        try {
            if (localStorage.getItem(AUTH_STORAGE_KEY)) {
                localStorage.removeItem(AUTH_STORAGE_KEY);
            }
        } catch (legacyErr) {
            console.warn('Failed to clear legacy auth localStorage key:', legacyErr);
        }

        if (!raw) return { sessionToken: '', user: null, expiresAt: '' };
        const parsed = JSON.parse(raw);
        return {
            sessionToken: String(parsed.sessionToken || ''),
            user: parsed.user || null,
            expiresAt: String(parsed.expiresAt || '')
        };
    } catch (error) {
        console.warn('Failed to read auth session from storage:', error);
        return { sessionToken: '', user: null, expiresAt: '' };
    }
}

function persistAuthState() {
    try {
        if (!authState.sessionToken) {
            clearClientAuthArtifacts();
            return;
        }
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
        // Ensure token is never persisted beyond this tab session.
        try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
        } catch (legacyErr) {
            console.warn('Failed to remove legacy auth localStorage key:', legacyErr);
        }
    } catch (error) {
        console.warn('Failed to persist auth session:', error);
    }
}

function clearAuthState() {
    authState = {
        sessionToken: '',
        user: null,
        expiresAt: ''
    };
    closeAuthUserMenu();
    clearClientAuthArtifacts();
    renderReferralCards();
}

function isAuthLoggedIn() {
    return !!(authState && authState.sessionToken && authState.user);
}

function setAuthFeedback(message, isError) {
    const ui = getAuthUI();
    if (!ui.feedback) return;
    ui.feedback.textContent = message || '';
    ui.feedback.classList.toggle('show', !!message);
    ui.feedback.classList.toggle('error', !!isError);
}

function sanitizeAuthName(name) {
    return String(name || '')
        .replace(/\s+/g, ' ')
        .replace(/[^a-zA-Z.\s'-]/g, '')
        .trim();
}

function normalizeReferralCodeInput(value) {
    return String(value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 16)
        .trim();
}

function readReferralCodeFromUrl() {
    try {
        const refValue = new URLSearchParams(window.location.search).get('ref') || '';
        return normalizeReferralCodeInput(refValue);
    } catch (error) {
        return '';
    }
}

function isValidAuthName(name) {
    return sanitizeAuthName(name).length >= 2;
}

function getAuthSendButtonLabel(isResend, secondsRemaining) {
    if (secondsRemaining > 0) {
        return `Resend OTP (${secondsRemaining}s)`;
    }
    if (isResend) {
        return authMode === 'signup' ? 'Resend Sign Up OTP' : 'Resend OTP';
    }
    return authMode === 'signup' ? 'Send Sign Up OTP' : 'Send OTP';
}

function getAuthVerifyButtonLabel(isReady) {
    if (!isReady) {
        return 'Enter 6-digit OTP';
    }
    return authMode === 'signup' ? 'Verify & Create Account' : 'Verify & Login';
}

function updateAuthVerifyButtonState() {
    const ui = getAuthUI();
    if (!ui.verifyOtpBtn || !ui.otpInput || ui.verifyOtpBtn.classList.contains('auth-btn-busy')) {
        return;
    }

    const cleanOtp = String(ui.otpInput.value || '').replace(/\D/g, '').slice(0, 6);
    if (cleanOtp !== ui.otpInput.value) {
        ui.otpInput.value = cleanOtp;
    }

    const isReady = cleanOtp.length === 6;
    ui.verifyOtpBtn.disabled = !isReady;
    ui.verifyOtpBtn.classList.toggle('otp-ready', isReady);
    ui.verifyOtpBtn.textContent = getAuthVerifyButtonLabel(isReady);
}

function updateAuthModeUI() {
    const ui = getAuthUI();
    if (!ui.modeSignInBtn || !ui.modeSignUpBtn) return;

    const isSignUp = authMode === 'signup';
    ui.modeSignInBtn.classList.toggle('active', !isSignUp);
    ui.modeSignUpBtn.classList.toggle('active', isSignUp);
    ui.modeSignInBtn.setAttribute('aria-selected', String(!isSignUp));
    ui.modeSignUpBtn.setAttribute('aria-selected', String(isSignUp));

    if (ui.nameGroup) ui.nameGroup.style.display = isSignUp ? 'block' : 'none';
    if (ui.phoneGroup) ui.phoneGroup.style.display = isSignUp ? 'block' : 'none';
    if (ui.referralGroup) ui.referralGroup.style.display = isSignUp ? 'block' : 'none';
    if (ui.nameInput) {
        ui.nameInput.required = isSignUp;
        ui.nameInput.setAttribute('aria-required', isSignUp ? 'true' : 'false');
    }
    if (ui.phoneInput) {
        ui.phoneInput.required = isSignUp;
        ui.phoneInput.setAttribute('aria-required', isSignUp ? 'true' : 'false');
    }
    if (ui.referralInput) {
        ui.referralInput.required = false;
        if (!isSignUp) {
            ui.referralInput.setCustomValidity('');
        }
    }
    refreshAuthResendButton();
    updateAuthVerifyButtonState();
}

function setAuthMode(mode, resetStep) {
    const normalized = mode === 'signup' ? 'signup' : 'signin';
    authMode = normalized;
    if (resetStep) {
        setOtpMode(false);
        setAuthFeedback('', false);
    }
    updateAuthModeUI();
}

function setAuthButtonBusy(buttonEl, isBusy, busyText, fallbackText) {
    if (!buttonEl) return;

    if (isBusy) {
        const restoreText = fallbackText || buttonEl.textContent.trim() || 'Please wait...';
        buttonEl.dataset.restoreText = restoreText;
        buttonEl.disabled = true;
        buttonEl.classList.add('auth-btn-busy');
        buttonEl.innerHTML = `<span class="auth-mini-spinner" aria-hidden="true"></span><span>${busyText || 'Please wait...'}</span>`;
        return;
    }

    const restore = buttonEl.dataset.restoreText || fallbackText || buttonEl.textContent.trim() || '';
    buttonEl.classList.remove('auth-btn-busy');
    buttonEl.disabled = false;
    buttonEl.textContent = restore;
    delete buttonEl.dataset.restoreText;
}

function clearAuthResendCountdown() {
    if (authResendTimerId) {
        clearInterval(authResendTimerId);
        authResendTimerId = null;
    }
}

function refreshAuthResendButton() {
    const ui = getAuthUI();
    if (!ui.sendOtpBtn) return;

    if (authVerifyInProgress) {
        ui.sendOtpBtn.disabled = true;
        ui.sendOtpBtn.textContent = 'Verifying...';
        ui.sendOtpBtn.classList.add('auth-cooldown');
        return;
    }

    const remaining = Math.max(0, Math.ceil((authResendUntilMs - Date.now()) / 1000));
    if (remaining > 0 && authOtpStepEnabled) {
        ui.sendOtpBtn.disabled = true;
        ui.sendOtpBtn.textContent = getAuthSendButtonLabel(true, remaining);
        ui.sendOtpBtn.classList.add('auth-cooldown');
        return;
    }

    ui.sendOtpBtn.disabled = false;
    ui.sendOtpBtn.textContent = getAuthSendButtonLabel(authOtpStepEnabled, 0);
    ui.sendOtpBtn.classList.remove('auth-cooldown');
}

function startAuthResendCountdown(seconds) {
    const cooldown = Math.max(0, Number(seconds) || 0);
    authResendUntilMs = Date.now() + cooldown * 1000;
    clearAuthResendCountdown();
    refreshAuthResendButton();

    if (cooldown <= 0) return;

    authResendTimerId = setInterval(() => {
        refreshAuthResendButton();
        if (Date.now() >= authResendUntilMs) {
            clearAuthResendCountdown();
            refreshAuthResendButton();
        }
    }, 500);
}

function setOtpMode(enabled) {
    const ui = getAuthUI();
    authOtpStepEnabled = !!enabled;
    const displayValue = enabled ? 'block' : 'none';
    if (ui.otpGroup) ui.otpGroup.style.display = displayValue;
    if (ui.verifyOtpBtn) ui.verifyOtpBtn.style.display = enabled ? 'inline-flex' : 'none';
    if (ui.otpHint) ui.otpHint.style.display = enabled ? 'block' : 'none';
    if (ui.stepEmail) {
        ui.stepEmail.classList.toggle('is-complete', enabled);
        ui.stepEmail.classList.toggle('is-active', !enabled);
    }
    if (ui.stepOtp) {
        ui.stepOtp.classList.toggle('is-active', enabled);
    }

    if (!enabled) {
        if (ui.otpInput) ui.otpInput.value = '';
        authResendUntilMs = 0;
        clearAuthResendCountdown();
    }

    refreshAuthResendButton();
    updateAuthModeUI();
    updateAuthVerifyButtonState();
}

function openAuthModal() {
    const ui = getAuthUI();
    if (!ui.modal) return;

    if (prefilledReferralCode && ui.referralInput && authMode === 'signup' && !ui.referralInput.value.trim()) {
        ui.referralInput.value = prefilledReferralCode;
    }

    setAuthFeedback('', false);
    if (prefilledReferralCode && authMode === 'signup') {
        setAuthFeedback(`Referral code ${prefilledReferralCode} detected. Complete Sign Up to apply it.`, false);
    }
    setOtpMode(authOtpStepEnabled || authResendUntilMs > Date.now());
    updateAuthModeUI();

    const checkoutEmail = document.getElementById('customer-email')?.value?.trim() || '';
    if (ui.emailInput && checkoutEmail && !ui.emailInput.value.trim()) {
        ui.emailInput.value = checkoutEmail;
    }

    ui.modal.style.display = 'block';
    syncBodyScrollLock();
    updateAuthVerifyButtonState();
    if (authOtpStepEnabled && ui.otpInput) {
        ui.otpInput.focus();
    } else if (ui.emailInput) {
        ui.emailInput.focus();
    }
}

function closeAuthModal() {
    const ui = getAuthUI();
    if (!ui.modal) return;
    ui.modal.style.display = 'none';
    syncBodyScrollLock();
}

function updateAuthNavAction() {
    const ui = getAuthUI();
    if (!ui.navAction) return;
    const navLabel = document.getElementById('nav-auth-label');
    const navIcon = ui.navAction.querySelector('i');

    if (authNavBusy) return;

    if (isAuthLoggedIn()) {
        const displayName = getAuthDisplayName(authState.user);
        if (navLabel) {
            navLabel.textContent = `Hi, ${displayName}`;
        } else {
            ui.navAction.textContent = `Hi, ${displayName}`;
        }
        ui.navAction.classList.add('auth-logged-in');
        ui.navAction.classList.add('auth-has-session');
        if (navIcon) navIcon.className = 'fa-solid fa-user-check';
        ui.navAction.setAttribute('title', `Signed in as ${displayName}. Open user menu.`);
        ui.navAction.setAttribute('aria-label', `Signed in as ${displayName}. Open user menu.`);
        ui.navAction.setAttribute('aria-haspopup', 'menu');
        ui.navAction.setAttribute('aria-expanded', authUserMenuOpen ? 'true' : 'false');
        if (ui.userMenuReferBtn) {
            ui.userMenuReferBtn.disabled = !getCurrentReferralCode();
        }
    } else {
        if (navLabel) {
            navLabel.textContent = 'Login';
        } else {
            ui.navAction.textContent = 'Login';
        }
        ui.navAction.classList.remove('auth-logged-in');
        ui.navAction.classList.remove('auth-has-session');
        if (navIcon) navIcon.className = 'fa-regular fa-user';
        ui.navAction.setAttribute('title', 'Login');
        ui.navAction.setAttribute('aria-label', 'Login');
        ui.navAction.removeAttribute('aria-haspopup');
        ui.navAction.removeAttribute('aria-expanded');
        closeAuthUserMenu();
    }

    renderReferralCards();
}

function setAuthNavBusy(enabled, labelText) {
    const ui = getAuthUI();
    if (!ui.navAction) return;

    authNavBusy = !!enabled;
    const navLabel = document.getElementById('nav-auth-label');
    const navIcon = ui.navAction.querySelector('i');
    if (enabled) {
        closeAuthUserMenu();
        ui.navAction.classList.add('auth-busy');
        ui.navAction.setAttribute('aria-busy', 'true');
        ui.navAction.setAttribute('aria-label', labelText || 'Processing');
        if (navLabel) {
            navLabel.textContent = labelText || 'Processing...';
        } else {
            ui.navAction.textContent = labelText || 'Processing...';
        }
        if (navIcon) navIcon.className = 'fa-solid fa-spinner fa-spin';
        return;
    }

    ui.navAction.classList.remove('auth-busy');
    ui.navAction.removeAttribute('aria-busy');
    updateAuthNavAction();
}

function flashAuthNavSuccess() {
    const ui = getAuthUI();
    if (!ui.navAction) return;
    ui.navAction.classList.remove('auth-just-verified');
    void ui.navAction.offsetWidth;
    ui.navAction.classList.add('auth-just-verified');
    setTimeout(() => ui.navAction.classList.remove('auth-just-verified'), 1300);
}

function hydrateCheckoutFromAuth() {
    if (!isAuthLoggedIn()) return;

    const user = authState.user || {};
    const checkoutName = document.getElementById('customer-name');
    const checkoutEmail = document.getElementById('customer-email');
    const checkoutPhone = document.getElementById('customer-phone');
    const authEmail = document.getElementById('auth-email');
    const authName = document.getElementById('auth-name');
    const authPhone = document.getElementById('auth-phone');

    if (checkoutName && !checkoutName.value.trim() && user.name) {
        checkoutName.value = String(user.name).trim();
    }
    if (checkoutEmail && !checkoutEmail.value.trim() && user.email) {
        checkoutEmail.value = String(user.email).trim();
    }
    if (checkoutPhone && !checkoutPhone.value.trim() && user.phone) {
        checkoutPhone.value = String(user.phone).trim();
    }

    if (authEmail && user.email) authEmail.value = String(user.email).trim();
    if (authName && user.name) authName.value = String(user.name).trim();
    if (authPhone && user.phone) authPhone.value = String(user.phone).trim();
}

async function callAuthApi(payload) {
    if (!isAuthConfigured()) {
        throw new Error('Auth API URL is not configured in app.js');
    }

    const response = await fetch(AUTH_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(payload)
    });

    if (!response.ok) {
        throw new Error(`Auth server returned ${response.status}`);
    }

    const result = await response.json();
    if (!result || result.status !== 'success') {
        const authError = new Error(result?.message || 'Auth request failed');
        authError.details = result || {};
        throw authError;
    }
    return result;
}

async function requestOtpFromAuth() {
    const ui = getAuthUI();
    if (!ui.emailInput || !ui.sendOtpBtn) return;
    if (authVerifyInProgress) return;

    const email = ui.emailInput.value.trim().toLowerCase();
    const nameFromModal = sanitizeAuthName(ui.nameInput ? ui.nameInput.value : '');
    const nameFromCheckout = document.getElementById('customer-name')?.value?.trim() || '';
    const name = nameFromModal || sanitizeAuthName(nameFromCheckout) || '';
    const phone = ui.phoneInput ? ui.phoneInput.value.trim() : '';
    const referralCode = normalizeReferralCodeInput(ui.referralInput ? ui.referralInput.value : '');

    if (ui.referralInput && ui.referralInput.value !== referralCode) {
        ui.referralInput.value = referralCode;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setAuthFeedback('Enter a valid email address before requesting OTP.', true);
        return;
    }

    if (!isAuthConfigured()) {
        setAuthFeedback('Auth API URL is not set yet. Update AUTH_API_URL in app.js first.', true);
        return;
    }

    if (authMode === 'signup') {
        if (!isValidAuthName(name)) {
            setAuthFeedback('Please enter your full name for sign up.', true);
            if (ui.nameInput) ui.nameInput.focus();
            return;
        }
        const cleanedPhone = phone.replace(/\D/g, '');
        if (cleanedPhone.length < 10) {
            setAuthFeedback('Valid phone is required for sign up.', true);
            if (ui.phoneInput) ui.phoneInput.focus();
            return;
        }
    }

    const originalText = ui.sendOtpBtn.textContent;
    setOtpMode(true); // Show OTP transition immediately so UI doesn't appear laggy.
    setAuthFeedback('Checking account details...', false);
    setAuthButtonBusy(ui.sendOtpBtn, true, 'Checking...', originalText);

    try {
        const shouldValidateReferral = authMode === 'signup' && !!referralCode;
        const [lookupResult, referralResult] = await Promise.allSettled([
            callAuthApi({
                action: 'check_user',
                email: email
            }),
            shouldValidateReferral
                ? callAuthApi({
                    action: 'validate_referral',
                    referral_code: referralCode,
                    email: email
                })
                : Promise.resolve(null)
        ]);

        if (lookupResult.status === 'rejected') {
            setOtpMode(false);
            setAuthFeedback(lookupResult.reason?.message || 'Could not validate account status.', true);
            return;
        }

        const lookup = lookupResult.value;
        if (authMode === 'signup' && lookup.exists) {
            setOtpMode(false);
            setAuthFeedback('Account already exists. Please switch to Sign In.', true);
            return;
        }
        if (authMode === 'signin' && !lookup.exists) {
            setOtpMode(false);
            setAuthFeedback('No account found. Switch to Sign Up first.', true);
            return;
        }

        if (shouldValidateReferral && referralResult.status === 'rejected') {
            setOtpMode(false);
            setAuthFeedback(referralResult.reason?.message || 'Referral code is invalid.', true);
            if (ui.referralInput) ui.referralInput.focus();
            return;
        }

        setAuthFeedback('Sending OTP. Please wait...', false);
        setAuthButtonBusy(ui.sendOtpBtn, true, 'Sending OTP...', originalText);

        const result = await callAuthApi({
            action: 'request_otp',
            email: email,
            name: name,
            referral_code: referralCode,
            auth_mode: authMode
        });

        setOtpMode(true);
        startAuthResendCountdown(AUTH_RESEND_COOLDOWN_SECONDS);
        setAuthFeedback(result.message || 'OTP sent to your email.', false);
        if (ui.otpInput) {
            ui.otpInput.value = '';
            ui.otpInput.focus();
        }
    } catch (error) {
        const retryAfter = Number(error?.details?.retry_after_seconds || 0);
        const isCooldownError = retryAfter > 0 || /wait before requesting another otp/i.test(String(error?.message || ''));
        if (isCooldownError) {
            setOtpMode(true);
            startAuthResendCountdown(retryAfter > 0 ? retryAfter : AUTH_RESEND_COOLDOWN_SECONDS);
        } else {
            setOtpMode(false);
        }
        setAuthFeedback(error.message || 'Unable to send OTP right now.', true);
    } finally {
        setAuthButtonBusy(ui.sendOtpBtn, false, '', originalText);
        refreshAuthResendButton();
        updateAuthVerifyButtonState();
    }
}

async function verifyOtpFromAuth() {
    const ui = getAuthUI();
    if (!ui.emailInput || !ui.otpInput || !ui.verifyOtpBtn) return;
    if (authVerifyInProgress) return;

    const email = ui.emailInput.value.trim().toLowerCase();
    const otp = ui.otpInput.value.trim();
    const name = sanitizeAuthName(ui.nameInput ? ui.nameInput.value : '');
    const phone = ui.phoneInput ? ui.phoneInput.value.trim() : '';
    const referralCode = normalizeReferralCodeInput(ui.referralInput ? ui.referralInput.value : '');

    if (ui.referralInput && ui.referralInput.value !== referralCode) {
        ui.referralInput.value = referralCode;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setAuthFeedback('Enter a valid email address.', true);
        return;
    }
    if (!otp) {
        setOtpMode(true);
        setAuthFeedback('OTP is empty. Enter the 6-digit code or click Resend OTP.', true);
        if (ui.otpInput) ui.otpInput.focus();
        return;
    }
    if (!/^\d{6}$/.test(otp)) {
        setOtpMode(true);
        setAuthFeedback('OTP must be exactly 6 digits. If needed, click Resend OTP.', true);
        if (ui.otpInput) ui.otpInput.focus();
        return;
    }

    if (authMode === 'signup') {
        if (!isValidAuthName(name)) {
            setAuthFeedback('Please enter your full name for sign up.', true);
            if (ui.nameInput) ui.nameInput.focus();
            return;
        }
        const cleanedPhone = phone.replace(/\D/g, '');
        if (cleanedPhone.length < 10) {
            setAuthFeedback('Valid phone is required for sign up.', true);
            if (ui.phoneInput) ui.phoneInput.focus();
            return;
        }
    }

    const originalText = ui.verifyOtpBtn.textContent;
    authVerifyInProgress = true;
    refreshAuthResendButton();
    setAuthFeedback('Verifying OTP. Please wait...', false);
    setAuthButtonBusy(ui.verifyOtpBtn, true, 'Verifying...', originalText);

    try {
        const result = await callAuthApi({
            action: 'verify_otp',
            email: email,
            otp: otp,
            name: name,
            phone: phone,
            referral_code: referralCode,
            auth_mode: authMode
        });

        authState = {
            sessionToken: String(result.session_token || ''),
            user: result.user || null,
            expiresAt: String(result.session_expires_at || '')
        };
        persistAuthState();
        updateAuthNavAction();
        hydrateCheckoutFromAuth();
        setOtpMode(false);
        closeAuthModal();
        flashAuthNavSuccess();

        const checkoutModal = document.getElementById('checkout-modal');
        if (checkoutModal && checkoutModal.style.display === 'block' && currentCheckoutStep === 1 && cart.length > 0) {
            showCheckoutStep(2);
        }

        showCartNotification({
            kind: 'success',
            title: result.is_new_user ? 'Welcome' : 'Welcome back',
            message: result.is_new_user
              ? `Hi ${getAuthDisplayName(authState.user)}. Your account is ready.`
              : `Hi ${getAuthDisplayName(authState.user)}. You are signed in.`
        });
        if (authState?.user?.referred_by_code && result.is_new_user) {
            showCartNotification({
                kind: 'success',
                title: 'Referral Applied',
                message: `Thanks. Referral ${authState.user.referred_by_code} has been linked to your account.`
            });
        }
        if (authState?.user?.referral_code) {
            showCartNotification({
                kind: 'info',
                title: 'Your Referral Code',
                message: `Share ${authState.user.referral_code} with friends.`
            });
        }
    } catch (error) {
        setOtpMode(true);
        setAuthFeedback(error.message || 'Unable to verify OTP.', true);
    } finally {
        authVerifyInProgress = false;
        setAuthButtonBusy(ui.verifyOtpBtn, false, '', originalText);
        refreshAuthResendButton();
        updateAuthVerifyButtonState();
    }
}

async function refreshAuthSession(silentMode) {
    if (!authState.sessionToken) return false;
    if (!isAuthConfigured()) return false;

    try {
        const result = await callAuthApi({
            action: 'me',
            session_token: authState.sessionToken
        });
        authState.user = result.user || authState.user;
        if (result.session_expires_at) {
            authState.expiresAt = String(result.session_expires_at);
        }
        persistAuthState();
        return true;
    } catch (error) {
        clearAuthState();
        if (!silentMode) {
            showErrorNotification('Your login session expired. Please login again.', 'Session expired');
        }
        return false;
    }
}

async function logoutFromAuth() {
    const token = authState.sessionToken;
    let logoutSynced = true;

    if (token && isAuthConfigured()) {
        try {
            await callAuthApi({
                action: 'logout',
                session_token: token
            });
        } catch (error) {
            logoutSynced = false;
            console.warn('Logout API failed, clearing local session anyway:', error);
        }
    }

    clearAuthState();
    updateAuthNavAction();
    showCartNotification({
        kind: 'info',
        title: 'Logged out',
        message: logoutSynced ? 'You are now signed out. Refreshing...' : 'Signed out locally. Refreshing...'
    });

    setTimeout(() => {
        window.location.reload();
    }, 650);
}

async function initAuth() {
    if (initAuth.initialized) return;
    initAuth.initialized = true;

    authState = readAuthStateFromStorage();
    prefilledReferralCode = readReferralCodeFromUrl();
    const ui = getAuthUI();
    if (!ui.navAction || !ui.modal) return;

    if (prefilledReferralCode && !isAuthLoggedIn()) {
        authMode = 'signup';
        if (ui.referralInput) {
            ui.referralInput.value = prefilledReferralCode;
        }
    }

    ui.navAction.addEventListener('click', async function (event) {
        event.preventDefault();
        if (authNavBusy) return;
        if (isAuthLoggedIn()) {
            toggleAuthUserMenu();
            return;
        }
        closeAuthUserMenu();
        openAuthModal();
    });

    if (ui.closeBtn) {
        ui.closeBtn.addEventListener('click', function () {
            closeAuthModal();
        });
    }

    window.addEventListener('click', function (event) {
        if (event.target === ui.modal) {
            closeAuthModal();
        }
        const clickedMenu = !!(ui.userMenu && ui.userMenu.contains(event.target));
        const clickedAuthTrigger = !!(ui.navAction && ui.navAction.contains(event.target));
        if (authUserMenuOpen && !clickedMenu && !clickedAuthTrigger) {
            closeAuthUserMenu();
        }
    });

    window.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && authUserMenuOpen) {
            closeAuthUserMenu();
        }
    });

    if (ui.userMenuReferBtn) {
        ui.userMenuReferBtn.addEventListener('click', function () {
            openReferralFromMenu();
        });
    }

    if (ui.userMenuLogoutBtn) {
        ui.userMenuLogoutBtn.addEventListener('click', async function () {
            if (authNavBusy) return;
            setAuthNavBusy(true, 'Logging out...');
            try {
                await logoutFromAuth();
            } finally {
                setAuthNavBusy(false);
            }
        });
    }

    if (ui.sendOtpBtn) {
        ui.sendOtpBtn.addEventListener('click', requestOtpFromAuth);
    }

    if (ui.verifyOtpBtn) {
        ui.verifyOtpBtn.addEventListener('click', verifyOtpFromAuth);
    }

    if (ui.emailInput) {
        ui.emailInput.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (authOtpStepEnabled) {
                if (ui.otpInput) ui.otpInput.focus();
            } else {
                requestOtpFromAuth();
            }
        });
    }

    if (ui.otpInput) {
        ui.otpInput.addEventListener('input', function () {
            updateAuthVerifyButtonState();
        });
        ui.otpInput.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            verifyOtpFromAuth();
        });
    }

    if (ui.nameInput) {
        ui.nameInput.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            requestOtpFromAuth();
        });
    }

    if (ui.phoneInput) {
        ui.phoneInput.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            requestOtpFromAuth();
        });
    }

    if (ui.referralInput) {
        ui.referralInput.addEventListener('input', function () {
            const clean = normalizeReferralCodeInput(ui.referralInput.value);
            if (ui.referralInput.value !== clean) {
                ui.referralInput.value = clean;
            }
        });
        ui.referralInput.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            requestOtpFromAuth();
        });
    }

    if (ui.modeSignInBtn) {
        ui.modeSignInBtn.addEventListener('click', function () {
            setAuthMode('signin', true);
        });
    }

    if (ui.modeSignUpBtn) {
        ui.modeSignUpBtn.addEventListener('click', function () {
            setAuthMode('signup', true);
        });
    }

    initReferralUiActions();

    updateAuthNavAction();
    updateAuthModeUI();
    updateAuthVerifyButtonState();

    if (authState.sessionToken && isAuthConfigured()) {
        await refreshAuthSession(true);
    } else if (authState.sessionToken && !isAuthConfigured()) {
        clearAuthState();
    }

    updateAuthNavAction();
    hydrateCheckoutFromAuth();
}

            // Dismiss behavior: allow users to hide the floating WA button and persist that choice
            function initWhatsAppDismiss() {
                const wa = document.getElementById('floating-whatsapp');
                const btn = document.getElementById('wa-dismiss');
                if (!wa || !btn) return;

                // Ensure button is visible initially
                wa.style.display = 'inline-flex';
                wa.style.opacity = '1';
                wa.style.visibility = 'visible';

                // Apply persisted state ONLY if explicitly dismissed
                try {
                    const dismissed = localStorage.getItem('waDismissed');
                    if (dismissed === '1') {
                        wa.style.display = 'none';
                        return;
                    }
                } catch (e) {
                    console.log('localStorage not available', e);
                }

                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    try { localStorage.setItem('waDismissed', '1'); } catch (er) {}
                    wa.style.transition = 'opacity 200ms ease, transform 200ms ease';
                    wa.style.opacity = '0';
                    wa.style.transform = 'scale(0.9) translateY(6px)';
                    setTimeout(() => { wa.style.display = 'none'; }, 220);
                });

                // Provide a simple way to revive the button: double-tap footer to show again (non-intrusive)
                const footer = document.querySelector('footer');
                if (footer) {
                    let lastTap = 0;
                    footer.addEventListener('click', function() {
                        const now = Date.now();
                        if (now - lastTap < 400) {
                            try { localStorage.removeItem('waDismissed'); } catch (e) {}
                            wa.style.display = 'inline-flex';
                            wa.style.opacity = '1';
                            wa.style.transform = '';
                        }
                        lastTap = now;
                    });
                }
            }

            // Hide floating WhatsApp when keyboard is open or inputs are focused (mobile)
            function initWhatsAppVisibilityOnInput() {
                const wa = document.getElementById('floating-whatsapp');
                if (!wa) return;

                const hide = () => {
                    wa.style.transition = 'opacity 160ms ease';
                    wa.style.opacity = '0';
                    wa.style.pointerEvents = 'none';
                };
                const show = () => {
                    wa.style.opacity = '';
                    wa.style.pointerEvents = '';
                };

                document.addEventListener('focusin', (e) => {
                    const t = e.target;
                    if (!t) return;
                    const tag = t.tagName;
                    if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) {
                        hide();
                    }
                });
                document.addEventListener('focusout', () => {
                    // small timeout to let keyboard dismiss
                    setTimeout(show, 120);
                });

                // visualViewport resize often indicates virtual keyboard open on mobile
                if (window.visualViewport) {
                    let prevHeight = window.visualViewport.height;
                    window.visualViewport.addEventListener('resize', () => {
                        const curr = window.visualViewport.height;
                        if (curr < prevHeight - 100) {
                            hide();
                        } else {
                            show();
                        }
                        prevHeight = curr;
                    });
                }
            }

// Contact modal initialization
function initContactModal() {
    const navContact = document.getElementById('nav-contact');
    const modal = document.getElementById('contact-modal');
    const closeBtn = modal ? modal.querySelector('.close-modal') : null;

    if (navContact && modal) {
        navContact.addEventListener('click', function(e) {
            e.preventDefault();
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        });
    }

    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });

    // Form behavior
    const form = document.getElementById('contact-form');
    const sendWa = document.getElementById('contact-send-whatsapp');
    if (sendWa) {
        sendWa.addEventListener('click', function() {
            const name = document.getElementById('contact-name').value.trim();
            const phone = document.getElementById('contact-phone').value.trim();
            const email = document.getElementById('contact-email').value.trim();
            const msg = document.getElementById('contact-message').value.trim();

            // Strict validation
            if (!name || !phone || !email || !msg) {
                showErrorNotification('Please fill Name, Phone, Email, and Message before continuing.');
                return;
            }

            const cleanedPhone = phone.replace(/\D/g, '');
            if (cleanedPhone.length < 10) {
                showErrorNotification('Please enter a valid 10-digit phone number.');
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showErrorNotification('Please enter a valid email address (example: name@email.com).');
                return;
            }

            const message = `Hello, my name is ${name}. ${msg} Phone: ${cleanedPhone} Email: ${email}`;
            const isMobile = /Mobi|Android/i.test(navigator.userAgent);
            const waMobile = `whatsapp://send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;
            const waWeb = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
            window.open(isMobile ? waMobile : waWeb, '_blank');

            // Clear unread badge after user initiates contact
            setWhatsAppBadge(0);
        });
    }

    if (form) {
        // Disable direct form POST for now - prefer WhatsApp contact
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            showErrorNotification('Please use "Send via WhatsApp" to contact us.');
        });
    }
}

function initContactSectionEnhancements() {
    const section = document.getElementById('contact');
    if (!section || initContactSectionEnhancements.initialized) return;
    initContactSectionEnhancements.initialized = true;

    const copyButtons = section.querySelectorAll('.contact-copy-btn');

    const copyText = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            const temp = document.createElement('textarea');
            temp.value = text;
            temp.setAttribute('readonly', '');
            temp.style.position = 'absolute';
            temp.style.left = '-9999px';
            document.body.appendChild(temp);
            temp.select();
            let copied = false;
            try {
                copied = document.execCommand('copy');
            } catch (e) {
                copied = false;
            }
            document.body.removeChild(temp);
            return copied;
        }
    };

    copyButtons.forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const value = btn.getAttribute('data-copy');
            if (!value) return;

            const didCopy = await copyText(value);
            if (!didCopy) {
                showErrorNotification('Could not copy automatically. Please copy it manually.', 'Copy failed');
                return;
            }

            const label = btn.getAttribute('data-copy-label') || 'Value';
            const labelEl = btn.querySelector('span');
            const originalText = labelEl ? labelEl.textContent : '';
            btn.classList.add('copied');
            if (labelEl) labelEl.textContent = 'Copied';

            showCartNotification({
                kind: 'info',
                title: 'Copied',
                message: `${label} copied to clipboard.`,
                iconClass: 'fa-regular fa-copy',
                duration: 1700
            });

            setTimeout(() => {
                btn.classList.remove('copied');
                if (labelEl) labelEl.textContent = originalText;
            }, 1200);
        });
    });

    const revealTargets = Array.from(section.querySelectorAll('.contact-action-btn, .contact-item, .contact-areas, .contact-map-card'));
    revealTargets.forEach((el, index) => {
        el.classList.add('contact-reveal');
        el.style.setProperty('--contact-reveal-delay', `${Math.min(index * 55, 330)}ms`);
    });

    if (!('IntersectionObserver' in window)) {
        revealTargets.forEach((el) => el.classList.add('is-visible'));
        return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
        });
    }, { threshold: 0.2 });

    revealTargets.forEach((el) => observer.observe(el));
}

function initSectionReveal() {
    if (initSectionReveal.initialized) return;
    initSectionReveal.initialized = true;

    const sections = Array.from(document.querySelectorAll('section'));
    if (!sections.length) return;

    sections.forEach((section, index) => {
        section.classList.add('section-reveal');
        section.style.setProperty('--reveal-delay', `${Math.min(index * 45, 260)}ms`);
    });

    if (!('IntersectionObserver' in window)) {
        sections.forEach((section) => section.classList.add('is-visible'));
        return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    sections.forEach((section) => observer.observe(section));
}

// WhatsApp badge helpers
function setWhatsAppBadge(count) {
    try {
        localStorage.setItem('waBadgeCount', String(count));
    } catch (e) {}
    const el = document.getElementById('wa-badge');
    if (!el) return;
    if (!count || Number(count) <= 0) {
        el.classList.add('hidden');
    } else {
        el.classList.remove('hidden');
        el.textContent = String(count);
    }
}

function initWhatsAppBadge() {
    let count = 0;
    try { count = Number(localStorage.getItem('waBadgeCount') || '0'); } catch (e) { count = 0; }
    setWhatsAppBadge(count);
}

// Floating WhatsApp handler
const WHATSAPP_NUMBER = '918073047946'; // Business number in international format without +
function initFloatingWhatsApp() {
    const el = document.getElementById('floating-whatsapp');
    if (!el) return;
    el.addEventListener('click', function(e) {
        e.preventDefault();
        const message = 'Hi Aishaura, I have a question about my order.';
        // Prefer whatsapp protocol on mobile, fallback to web link
        const isMobile = /Mobi|Android/i.test(navigator.userAgent);
        const mobileUrl = `whatsapp://send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;
        const webUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
        const url = isMobile ? mobileUrl : webUrl;
        // Clear badge when user initiates contact
        setWhatsAppBadge(0);
        window.open(url, '_blank');
    });
}

// ========== REVIEWS MODAL ========== //
function initReviewsModal() {
    const reviewsModal = document.getElementById('reviews-modal');
    if (!reviewsModal) return;
    const closeBtn = reviewsModal.querySelector('.close-modal');

    // Avoid duplicate listeners if this function is called more than once.
    if (initReviewsModal.initialized) return;
    initReviewsModal.initialized = true;

    // Close button functionality
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            reviewsModal.style.display = 'none';
        });
    }

    // Click outside modal to close
    window.addEventListener('click', function(e) {
        if (e.target === reviewsModal) {
            reviewsModal.style.display = 'none';
        }
    });

    // Delegate click handling so it also works after product gallery re-renders.
    document.addEventListener('click', function(e) {
            const ratingDiv = e.target.closest('.card-rating');
            if (!ratingDiv) return;

            // Prevent product card click handler from opening product modal.
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') {
                e.stopImmediatePropagation();
            }

            const productCard = ratingDiv.closest('.card');
            if (!productCard) return;

            const titleEl = productCard.querySelector('.gallery-title');
            if (!titleEl) return;

            const productName = titleEl.textContent;
            const product = productData[productName];

            if (!product) return;

            // Populate modal with product data
            document.getElementById('reviews-product-name').textContent = productName;
            document.getElementById('reviews-average-rating').textContent = '⭐ ' + product.rating + '/5';
            document.getElementById('reviews-count').textContent = product.reviews + ' reviews';

            const reviewsList = document.getElementById('reviews-list');
            reviewsList.innerHTML = '';

            if (product.customerReviews && product.customerReviews.length > 0) {
                product.customerReviews.forEach(review => {
                    const reviewDiv = document.createElement('div');
                    reviewDiv.className = 'review-item';
                    const stars = '⭐'.repeat(review.rating);
                    reviewDiv.innerHTML = `
                        <div class="review-meta">
                            <span class="review-name">${review.name}</span>
                            <span class="review-date">${review.date}</span>
                        </div>
                        <div class="review-stars">${stars}</div>
                        <div class="review-text">${review.text}</div>
                    `;
                    reviewsList.appendChild(reviewDiv);
                });
            } else {
                reviewsList.innerHTML = '<div class="no-reviews">No reviews yet. Be the first to review!</div>';
            }

            // Show modal
            reviewsModal.style.display = 'block';
    }, true);

    // Delegate hover style so newly rendered cards also get it.
    document.addEventListener('mouseover', function(e) {
        const ratingDiv = e.target.closest('.card-rating');
        if (ratingDiv) ratingDiv.style.opacity = '0.7';
    });
    document.addEventListener('mouseout', function(e) {
        const ratingDiv = e.target.closest('.card-rating');
        if (ratingDiv) ratingDiv.style.opacity = '1';
    });
}

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
function renderProductReviewsInModal(product) {
    const usageList = document.getElementById('modal-usage');
    if (!usageList || !product) return;

    const reviews = Array.isArray(product.customerReviews) ? product.customerReviews : [];
    const ratingValue = Number(product.rating || 0).toFixed(1);

    const reviewsSection = document.createElement('div');
    reviewsSection.className = 'product-reviews-inline';

    if (reviews.length === 0) {
        reviewsSection.innerHTML = `
            <h3>Customer Reviews</h3>
            <div class="no-reviews">No reviews yet.</div>
        `;
        usageList.appendChild(reviewsSection);
        return;
    }

    const latestReviews = reviews.slice(0, 3);
    reviewsSection.innerHTML = `<h3>Customer Reviews (${ratingValue}/5)</h3>`;
    latestReviews.forEach(review => {
        const item = document.createElement('div');
        item.className = 'review-item';
        const stars = '⭐'.repeat(Math.max(0, parseInt(review.rating, 10) || 0));
        item.innerHTML = `
            <div class="review-meta">
                <span class="review-name">${review.name || 'Anonymous'}</span>
                <span class="review-date">${review.date || 'Recently'}</span>
            </div>
            <div class="review-stars">${stars}</div>
            <div class="review-text">${review.text || ''}</div>
        `;
        reviewsSection.appendChild(item);
    });

    usageList.appendChild(reviewsSection);
}

function getProductNutrition(product) {
    const nutrition = product.nutritionInfo || product.nutrition || {};
    return {
        calories: nutrition.calories || product.calories || '22 kcal',
        protein: nutrition.protein || product.protein || '2.1 g',
        fiber: nutrition.fiber || product.fiber || '1.2 g',
        vitaminE: nutrition.vitaminE || product.vitaminE || '3.4 mg'
    };
}

function renderProductEnhancementsInModal(product) {
    const descriptionEl = document.getElementById('modal-description');
    if (!descriptionEl) return;

    const nutrition = getProductNutrition(product);
    const trustBadges = Array.isArray(product.trustBadges) && product.trustBadges.length > 0
        ? product.trustBadges
        : ['100% Chemical-Free', 'Harvested Fresh', 'Local Farm Delivery'];

    const freshness = product.harvestDate || 'Harvest on delivery day';
    const bestBefore = product.shelfLife || 'Best consumed within 7 days';
    const nextDelivery = product.nextDeliverySlot || 'Next delivery slot: Friday evening';
    const storage = product.storage || 'Refrigerate in an airtight box';

    let extras = document.getElementById('modal-product-extras');
    if (!extras) {
        extras = document.createElement('div');
        extras.id = 'modal-product-extras';
        extras.className = 'modal-product-extras';
        descriptionEl.insertAdjacentElement('afterend', extras);
    }

    extras.innerHTML = `
        <div class="product-meta-chips">
            ${trustBadges.map((badge) => `<span class="meta-chip">${badge}</span>`).join('')}
        </div>
        <div class="nutrition-snapshot">
            <h3>Nutrition Snapshot (per 50g)</h3>
            <div class="nutrition-grid">
                <div class="nutrition-item"><span>Calories</span><strong>${nutrition.calories}</strong></div>
                <div class="nutrition-item"><span>Protein</span><strong>${nutrition.protein}</strong></div>
                <div class="nutrition-item"><span>Fiber</span><strong>${nutrition.fiber}</strong></div>
                <div class="nutrition-item"><span>Vitamin E</span><strong>${nutrition.vitaminE}</strong></div>
            </div>
        </div>
        <div class="freshness-delivery-card">
            <h3>Freshness & Delivery</h3>
            <div class="fd-row"><span>Harvest:</span><strong>${freshness}</strong></div>
            <div class="fd-row"><span>Best Before:</span><strong>${bestBefore}</strong></div>
            <div class="fd-row"><span>Delivery:</span><strong>${nextDelivery}</strong></div>
        </div>
        <div class="storage-guidance-card">
            <h3>Storage Guidance</h3>
            <p>Keep refrigerated and dry. ${storage}. Consume within <strong>${bestBefore}</strong> for best taste.</p>
        </div>
    `;
}

function renderProductFaqInModal(product) {
    const usageList = document.getElementById('modal-usage');
    if (!usageList) return;

    const storage = product.storage || 'Store in refrigerator';
    const faq = document.createElement('div');
    faq.className = 'product-faq';
    faq.innerHTML = `
        <h3>Quick FAQ</h3>
        <details>
            <summary>Can I eat these raw?</summary>
            <p>Yes. Microgreens are best eaten raw in salads, sandwiches, bowls, and smoothies.</p>
        </details>
        <details>
            <summary>Should I wash before eating?</summary>
            <p>A light rinse before serving is recommended for best freshness.</p>
        </details>
        <details>
            <summary>How should I store after delivery?</summary>
            <p>${storage}. Keep away from moisture and close lid properly after use.</p>
        </details>
    `;
    usageList.appendChild(faq);
}

function updateModalQuantityHelper() {
    const helper = document.getElementById('modal-quantity-helper');
    const input = document.querySelector('#product-modal .quantity-input');
    if (!helper || !input || !activeModalProduct) return;

    const quantity = Math.max(50, parseInt(input.value, 10) || 50);
    const unitPrice = parseFloat(activeModalProduct.price) || 0;
    const total = ((quantity / 50) * unitPrice).toFixed(2);
    helper.textContent = `${quantity}g = ${formatCurrency(total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function setupModalQuantityHelper(product) {
    activeModalProduct = product;
    const modal = document.getElementById('product-modal');
    const quantitySelector = modal ? modal.querySelector('.quantity-selector') : null;
    if (!quantitySelector) return;

    let helper = document.getElementById('modal-quantity-helper');
    if (!helper) {
        helper = document.createElement('div');
        helper.id = 'modal-quantity-helper';
        helper.className = 'modal-quantity-helper';
        quantitySelector.insertAdjacentElement('beforebegin', helper);
    }

    if (!setupModalQuantityHelper.initialized) {
        setupModalQuantityHelper.initialized = true;
        document.addEventListener('click', function(e) {
            if (e.target.closest('#product-modal .quantity-btn')) {
                setTimeout(updateModalQuantityHelper, 0);
            }
        });
        document.addEventListener('input', function(e) {
            if (e.target.matches('#product-modal .quantity-input')) {
                updateModalQuantityHelper();
            }
        });
    }

    updateModalQuantityHelper();
}

function resetProductModalEnhancements() {
    const extras = document.getElementById('modal-product-extras');
    if (extras) extras.remove();
    const helper = document.getElementById('modal-quantity-helper');
    if (helper) helper.remove();
    activeModalProduct = null;
}

function initializeModal() {
    const modal = document.getElementById('product-modal');
    if (!modal) return;
    const closeBtn = modal.querySelector('.close-modal');

    // Add click event to all product cards
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', function(e) {
            // Prevent modal from opening if quantity buttons or add to cart button are clicked
            if (e.target.closest('.quantity-selector') || e.target.closest('.add-to-cart') || e.target.closest('.card-rating')) {
                return;
            }

            // Recipes use a different modal flow and should never show cart controls.
            if (this.classList.contains('recipe-art')) {
                return;
            }

            const productName = this.querySelector('.gallery-title').textContent;
            const product = productData[productName];

            if (product) {
                resetProductModalEnhancements();
                modal.classList.add('product-view');
                document.getElementById('modal-image').src = product.image;
                document.getElementById('modal-image').alt = productName;
                document.getElementById('modal-title').textContent = productName;
                document.getElementById('modal-price').textContent = `${formatCurrency(product.price)} per 50g`;
                document.getElementById('modal-description').textContent = product.description;

                // Add additional product information if available
                let additionalInfo = '';
                
                if (product.storage || product.shelfLife) {
                  additionalInfo = '<div class="product-info-box">';
                  if (product.storage) {
                    additionalInfo += `<div class="info-item"><strong>Storage:</strong> ${product.storage}</div>`;
                  }
                  if (product.shelfLife) {
                    additionalInfo += `<div class="info-item"><strong>Shelf Life:</strong> ${product.shelfLife}</div>`;
                  }
                  additionalInfo += '</div>';
                }
                
                const descriptionEl = document.getElementById('modal-description');
                descriptionEl.innerHTML = product.description + additionalInfo;
                renderProductEnhancementsInModal(product);

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
                renderProductReviewsInModal(product);
                renderProductFaqInModal(product);

                // Set initial quantity to 50g for modal add to cart
                document.querySelector('#product-modal .quantity-input').value = 50;
                setupModalQuantityHelper(product);
                
                // Ensure modal controls are always enabled
                const addToCartBtn = document.getElementById('add-to-cart-modal');
                const quantityInput = document.querySelector('#product-modal .quantity-input');
                const quantityBtns = document.querySelectorAll('#product-modal .quantity-btn');
                addToCartBtn.disabled = false;
                addToCartBtn.textContent = '+ Add to Cart';
                addToCartBtn.style.background = '';
                addToCartBtn.style.cursor = 'pointer';
                quantityInput.disabled = false;
                quantityBtns.forEach((btn) => { btn.disabled = false; });

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
                resetProductModalEnhancements();
                modal.classList.remove('product-view');
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

                const modalQty = document.querySelector('#product-modal .quantity-selector');
                const modalCartBtn = document.getElementById('add-to-cart-modal');
                if (modalQty) modalQty.style.setProperty('display', 'none', 'important');
                if (modalCartBtn) modalCartBtn.style.setProperty('display', 'none', 'important');

                modal.style.display = 'block';
                document.body.style.overflow = 'hidden';
            }
        });
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        });
    }

    // Close modal if clicking outside content
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });
}

// ========== CART FUNCTIONS ========== //
function initializeMiniCart() {
    if (initializeMiniCart.initialized) return;
    initializeMiniCart.initialized = true;

    const miniCartOpen = document.getElementById('mini-cart-open');
    if (miniCartOpen) {
        miniCartOpen.addEventListener('click', function() {
            if (cart.length === 0) {
                showCartNotification({
                    kind: 'info',
                    title: 'Your cart is empty',
                    message: 'Add any product to quickly access checkout.'
                });
                return;
            }
            showCheckoutModal();
        });
    }

    updateMiniCartBar();
}

function updateMiniCartBar() {
    const bar = document.getElementById('mobile-mini-cart');
    const countEl = document.getElementById('mini-cart-count');
    const totalEl = document.getElementById('mini-cart-total');
    if (!bar || !countEl || !totalEl) return;

    const total = getPricingSummary().total;
    countEl.textContent = String(cart.length);
    totalEl.textContent = `₹${total.toFixed(2)}`;
    bar.classList.toggle('show', cart.length > 0);
}

function initializeCart() {
    const cartIcon = document.getElementById('cart-icon');
    const cartDropdown = document.getElementById('cart-dropdown');
    const cartContainer = document.getElementById('cart-container');
    const cartClose = document.getElementById('cart-close');
    if (!cartIcon) return;
    cartIcon.setAttribute('aria-expanded', 'false');

    const openCartDrawer = () => {
        if (!cartDropdown) return;
        cartDropdown.classList.add('show');
        cartIcon.setAttribute('aria-expanded', 'true');
        document.body.classList.add('cart-open');
    };

    const closeCartDrawer = () => {
        if (!cartDropdown) return;
        cartDropdown.classList.remove('show');
        cartIcon.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('cart-open');
    };

    cartIcon.addEventListener('click', function(event) {
        event.stopPropagation(); // Prevent document click from closing it immediately
        if (cartDropdown.classList.contains('show')) {
            closeCartDrawer();
        } else {
            openCartDrawer();
        }
    });
    cartIcon.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            cartIcon.click();
        }
    });

    if (cartClose) {
        cartClose.addEventListener('click', function() {
            closeCartDrawer();
        });
    }

    // Close cart dropdown if clicking outside
    document.addEventListener('click', function(event) {
        if (cartDropdown.classList.contains('show') && !cartContainer.contains(event.target)) {
            closeCartDrawer();
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && cartDropdown.classList.contains('show')) {
            closeCartDrawer();
        }
    });

    document.getElementById('clear-cart').addEventListener('click', clearCart);

    document.getElementById('view-cart').addEventListener('click', function() {
        showCheckoutModal();
        closeCartDrawer();
    });

    document.getElementById('checkout-btn').addEventListener('click', function() {
        if (cart.length === 0) {
            alert('Your cart is empty!');
            return;
        }
        showCheckoutModal();
        closeCartDrawer();
    });
}

function setupProductQuantity() {
    if (setupProductQuantity.initialized) return;
    setupProductQuantity.initialized = true;
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
            
            // DEBUG: Log what's being passed
            console.log(`[BUTTON CLICK] Product: ${product}, Price from data-attr: ${price}, Quantity: ${quantity}`);

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
    
    // DEBUG: Verify price calculation
    const debugPrice = productData[product].price;
    console.log(`[PRICE DEBUG] Product: ${product}`);
    console.log(`[PRICE DEBUG] Price from data attr: ${parseFloat(price)} (type: ${typeof parseFloat(price)})`);
    console.log(`[PRICE DEBUG] Price from productData: ${debugPrice} (type: ${typeof debugPrice})`);
    console.log(`[PRICE DEBUG] Final price used: ${price}`);
    console.log(`[PRICE DEBUG] Calculation: (${quantity}g / 50) × ₹${price} = ₹${(quantity/50) * price}`);

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
    showCartNotification({
        kind: 'success',
        title: 'Fresh greens added',
        message: `${quantity}g of ${product} is now in your basket.`
    });
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
    document.body.classList.remove('cart-open');
    // Note: Modal will be closed when user clicks "Continue Shopping" button
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
        updateMiniCartBar();
        renderReferralCards();
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

    const pricing = getPricingSummary();
    const total = pricing.total;

    cartSubtotal.textContent = `₹${pricing.subtotal.toFixed(2)}`;
    cartDelivery.textContent = 'FREE'; // Hardcoded as free
    cartTotal.innerHTML = `<span>Total:</span> <span>₹${total.toFixed(2)}</span>`;
    updateMiniCartBar();

    // Re-attach event listeners for remove buttons
    document.querySelectorAll('.remove-item').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            removeFromCart(index);
        });
    });
    renderReferralCards();
}

function calculateOrderTotal() {
    console.log('Calculating order total from cart:', cart);
    const subtotal = cart.reduce((total, item) => {
        const itemTotal = (item.quantity / 50) * item.price;
        console.log(`Calculating: ${item.product} - ${item.quantity}g @ ₹${item.price}/50g = ₹${itemTotal.toFixed(2)}`);
        return total + itemTotal;
    }, 0);
    console.log('Final subtotal:', subtotal);
    const pricing = getPricingSummary();
    console.log('Pricing summary:', pricing);
    return pricing.total;
}

function showCartNotification(messageOrOptions) {
    const opts = typeof messageOrOptions === 'string' ? { message: messageOrOptions } : (messageOrOptions || {});
    const kind = opts.kind || 'success';
    const title = opts.title || (kind === 'info' ? 'Update in progress' : 'Done');
    const message = opts.message || '';
    const iconClass = opts.iconClass || (kind === 'info' ? 'fa-solid fa-arrows-rotate' : 'fa-solid fa-leaf');
    const duration = Number.isFinite(opts.duration) ? opts.duration : 3000;

    const notification = document.createElement('div');
    notification.className = `cart-notification ${kind}`;
    notification.innerHTML = `
        <span class="toast-icon" aria-hidden="true"><i class="${iconClass}"></i></span>
        <span class="toast-content">
            <span class="toast-title">${title}</span>
            <span class="toast-message">${message}</span>
        </span>
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10); // Small delay to trigger CSS transition

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300); // Wait for transition to finish before removing
    }, duration); // Display duration
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
        updateCheckoutItemsWithReferral(); // Update cart summary in step 1
    } else if (step === 3) {
        updatePaymentSummaryWithReferral(); // Update order summary in payment step
        generatePaymentQRCode(); // Generate QR code for payment
    }

    renderReferralCards();
}

function setupCheckout() {
    document.getElementById('btn-continue').addEventListener('click', function() {
        if (cart.length === 0) {
            alert('Your cart is empty. Please add items before placing an order.');
            return;
        }
        if (!isAuthLoggedIn()) {
            showErrorNotification('Please sign in or sign up before checkout.', 'Login required');
            openAuthModal();
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
  const res = validateCustomerInfo();
  if (!res.valid) {
    alert(res.message);
    return;
  }
  showCheckoutStep(3);
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
    // document.getElementById('upi-pay-button').addEventListener('click', function() {
    //     const total = calculateOrderTotal();
    //     const upiLink = `upi://pay?pa=shashi.shashi7271@ybl&pn=Aishaura%20Microgreens&am=${total.toFixed(2)}&cu=INR&tn=Microgreens%20Order`;
    //     //window.open(upiLink, '_blank');
    // });

    document.getElementById('btn-place-order').addEventListener('click', submitOrder);

    // Close checkout modal
    document.querySelector('#checkout-modal .close-modal').addEventListener('click', function() {
        document.getElementById('checkout-modal').style.display = 'none';
        document.body.style.overflow = 'auto';
    });
}
function isCheckoutStepThree() {
  const modal = document.getElementById('checkout-modal');
  return modal && modal.style.display === 'block' && currentCheckoutStep === 3;
}


const UPI_ID = '9738560719-0@airtel';
const PAYEE_NAME = 'Aishaura Microgreens';
const UPI_NOTE = 'Microgreens Order';

function generatePaymentQRCode() {
  // ✅ correct container (matches your HTML)
  const qrContainer = document.querySelector('#step-3 #upi-qr-code');

  if (!qrContainer) {
    console.warn('QR container not found in step 3 (#upi-qr-code)');
    return;
  }

  qrContainer.innerHTML = '';

  const total = calculateOrderTotal();
  const upiLink =
    `upi://pay?pa=${encodeURIComponent(UPI_ID)}` +
    `&pn=${encodeURIComponent(PAYEE_NAME)}` +
    `&am=${total.toFixed(2)}` +
    `&cu=INR&tn=${encodeURIComponent(UPI_NOTE)}`;

  if (typeof QRCode === 'undefined') {
    showQRCodeFallback(qrContainer, total);
    return;
  }

  new QRCode(qrContainer, {
    text: upiLink,
    width: 180,
    height: 180,
    correctLevel: QRCode.CorrectLevel.H
  });

  const payBtn = document.getElementById('upi-pay-button');
  if (payBtn) payBtn.onclick = () => window.location.href = upiLink;
}

function showQRCodeFallback(qrContainer, total) {
    // This will be displayed if QR code library isn't loaded or fails.
    qrContainer.innerHTML = `
        <div class="upi-fallback">
            <p>Please send payment to:</p>
            <p class="upi-id">${UPI_ID}</p>
      <p>Amount: ₹${total.toFixed(2)}</p>
      <button id="manual-upi-pay" class="upi-pay-button">Pay with UPI App</button>
    </div>
        </div>
    `;

    document.getElementById('manual-upi-pay').addEventListener('click', function() {
        const upiLink = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(PAYEE_NAME)}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(UPI_NOTE)}`;
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

function updateCheckoutItemsWithReferral() {
    const itemsContainer = document.getElementById('checkout-items');
    const referralRow = document.getElementById('checkout-referral-row');
    const referralValue = document.getElementById('checkout-referral-discount');
    if (!itemsContainer) return;

    itemsContainer.innerHTML = '';

    cart.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'order-item';

        const itemPrice = (item.quantity / 50) * item.price;
        itemElement.innerHTML = `
            <div class="order-item-name">${item.product} (${item.quantity}g)</div>
            <div class="order-item-price">₹${itemPrice.toFixed(2)}</div>
        `;
        itemsContainer.appendChild(itemElement);
    });

    const pricing = getPricingSummary();
    document.getElementById('checkout-subtotal').textContent = `₹${pricing.subtotal.toFixed(2)}`;
    document.getElementById('checkout-delivery').textContent = 'FREE';
    document.getElementById('checkout-total').textContent = `₹${pricing.total.toFixed(2)}`;

    if (referralRow && referralValue) {
        if (pricing.referralDiscount > 0) {
            referralRow.style.display = 'flex';
            referralValue.textContent = `-₹${pricing.referralDiscount.toFixed(2)}`;
        } else {
            referralRow.style.display = 'none';
            referralValue.textContent = '-₹0.00';
        }
    }
}

function updatePaymentSummaryWithReferral() {
    const container = document.getElementById('payment-order-items');
    const referralRow = document.getElementById('payment-referral-row');
    const referralValue = document.getElementById('payment-referral-discount');
    if (!container) return;

    container.innerHTML = '';
    cart.forEach(item => {
        const itemPrice = (item.quantity / 50) * item.price;
        container.innerHTML += `
            <div class="order-item">
                <div class="order-item-name">${item.product} (${item.quantity}g)</div>
                <div class="order-item-price">₹${itemPrice.toFixed(2)}</div>
            </div>
        `;
    });

    const pricing = getPricingSummary();
    document.getElementById('payment-total').textContent = `₹${pricing.total.toFixed(2)}`;

    if (referralRow && referralValue) {
        if (pricing.referralDiscount > 0) {
            referralRow.style.display = 'flex';
            referralValue.textContent = `-₹${pricing.referralDiscount.toFixed(2)}`;
        } else {
            referralRow.style.display = 'none';
            referralValue.textContent = '-₹0.00';
        }
    }
}

// ========== ORDER SUBMISSION FUNCTIONS ========== //
async function submitOrder() {
  const submitBtn = document.getElementById('btn-place-order');
  const loader = document.getElementById('fullpage-loader');

  if (!isAuthLoggedIn()) {
    showErrorNotification('Please sign in or sign up before placing an order.', 'Login required');
    openAuthModal();
    return;
  }
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Processing...';
  
  // Show full-page loading overlay
  loader.style.display = 'flex';

  try {
    const pricing = getPricingSummary();

    // Prepare order data
    const orderData = {
      name: document.getElementById('customer-name').value.trim(),
      phone: document.getElementById('customer-phone').value.trim(),
      email: document.getElementById('customer-email').value.trim(),
      address: document.getElementById('customer-address').value.trim(),
      notes: document.getElementById('customer-notes').value.trim(),
      payment_method: document.querySelector('.payment-option.active')?.getAttribute('data-method') || 'upi',
      amount: pricing.total.toFixed(2),
      subtotal_amount: pricing.subtotal.toFixed(2),
      referral_discount: pricing.referralDiscount.toFixed(2),
      product: cart.map(item => `${item.product} (${item.quantity}g)`).join(', '),
      quantity: cart.reduce((acc, item) => acc + item.quantity, 0) + 'g',
      // send referral code from the input (or URL ref param) so server can re-verify
      referral_code: normalizeReferralCodeInput(
        document.getElementById('auth-referral')?.value || ''
      ),
      auth_user_id: authState?.user?.user_id || '',
      auth_email: authState?.user?.email || '',
      auth_referral_code: authState?.user?.referral_code || '',
      auth_referred_by_code: authState?.user?.referred_by_code || ''
    };

    // Submit to server
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(orderData)
    });
    

    // Check for empty response
    if (!response.ok) {
      throw new Error(`Server returned ${response.status} status`);
    }

    // Parse JSON response
  const result = await response.json();

        // Verify the ID format
            if (!result.orderId.includes('AM-')) {
            console.error('Invalid order ID format:', result.orderId);
            throw new Error('Received invalid order ID from server');
            }

    // Validate response structure
    if (!result || !result.orderId) {
      throw new Error("Missing order ID in response");
    }
console.log("Server response:", result); // Add this before showing alert

    const appliedReferralDiscount = Number(result?.referral_discount || 0);
    if (appliedReferralDiscount > 0) {
      showCartNotification({
        kind: 'success',
        title: 'Referral Discount Applied',
        message: `You saved INR ${appliedReferralDiscount.toFixed(2)} on this order.`
      });
    }

    // Show order confirmation page (Step 4) instead of alert
    const totalAmount = parseFloat(result.amount || orderData.amount);
    showOrderConfirmation(result.orderId, totalAmount, orderData.phone);

    // Clear cart after brief delay
    setTimeout(() => {
      clearCart();
      updateCartDisplay();
    }, 1000);

  } catch (error) {
    console.error('Submission error:', error);
    alert(`Order failed: ${error.message}`);
  } finally {
    // Hide loading overlay
    loader.style.display = 'none';
    
    submitBtn.disabled = false;
    submitBtn.textContent = 'Place Order';
  }
}

// ========== VALIDATION FUNCTION ========== //
function validateCustomerInfo() {
    const name = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    const email = document.getElementById('customer-email').value.trim();
    const address = document.getElementById('customer-address').value.trim();

    if (!name || !phone || !email || !address) {
        return { valid: false, message: "Please fill all required fields." };
    }

    if (phone.length < 10 || !/^\d+$/.test(phone)) {
        return { valid: false, message: "Please enter a valid 10-digit phone number." };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { valid: false, message: "Please enter a valid email address." };
    }

    return { valid: true };
}

// ========== NOTIFICATION FUNCTIONS ========== //
function showErrorNotification(message, title = 'Please check the form') {
    const notification = document.createElement('div');
    notification.className = 'error-notification';
    notification.innerHTML = `
        <span class="icon" aria-hidden="true"><i class="fa-solid fa-circle-exclamation"></i></span>
        <span class="error-content">
            <span class="error-title">${title}</span>
            <span class="message">${message}</span>
        </span>
    `;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => document.body.removeChild(notification), 500);
    }, 3000);
}

// ========== ORDER CONFIRMATION ========== //
function showOrderConfirmation(orderId, total, phone) {
    document.getElementById('confirmation-id').textContent = `#${orderId}`;
    const numericTotal = typeof total === 'string' ? parseFloat(total) : total;
    document.getElementById('confirmation-total').textContent = `₹${numericTotal.toFixed(2)}`;
    
    // Set up WhatsApp share button
    const whatsappBtn = document.getElementById('share-receipt-whatsapp');
    if (whatsappBtn) {
        whatsappBtn.onclick = () => shareReceiptOnWhatsApp(orderId, numericTotal, phone);
    }
    
    showCheckoutStep(4);
}

/**
 * Refresh product data from Google Sheets and re-render the gallery
 * Called when user clicks "Continue Shopping" after order confirmation
 */
async function continueShoppingAfterOrder() {
  try {
    console.log('🔄 Refreshing product data after order...');
    
    // Close checkout modal
    document.getElementById('checkout-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
    
    // Show loading notification
    showCartNotification({
      kind: 'info',
      title: 'Refreshing products',
      message: 'Fetching the latest product data from farm sheets...'
    });
    renderProductSkeletons(4);
    
    // Fetch fresh product data
    await fetchProductDataFromSheets();
    
    // Re-render products with latest data
    renderProductsToGallery();
    
    console.log('✓ Product list refreshed successfully');
    showCartNotification({
      kind: 'success',
      title: 'Products updated',
      message: 'Latest product details are now live on your list.'
    });
    
    // Scroll to products section
    const productsSection = document.querySelector('section:has(#products-gallery)');
    if (productsSection) {
      setTimeout(() => {
        productsSection.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
    
  } catch (err) {
    console.error('Error refreshing products:', err);
    // Still close modal even if refresh fails
    document.getElementById('checkout-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
    showErrorNotification('Could not refresh products, but order placed successfully');
  }
}

// Share receipt on WhatsApp
function shareReceiptOnWhatsApp(orderId, total, phone) {
    const businessPhone = '918073047946'; // Your WhatsApp number
    const message = `Hi! I've placed an order and would like to share the receipt.\n\nOrder ID: #${orderId}\nAmount: ₹${total.toFixed(2)}\n\nPlease confirm receipt of my payment.`;
    
    const whatsappUrl = `https://wa.me/${businessPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
}
// ========== WHATSAPP CONFIRMATION ========== //
// function sendWhatsAppConfirmation(name, phone, orderId, total, paymentMethod, address, notes) {
//     const cleanedPhone = phone.replace(/\D/g, '');
//     // Ensure the number starts with 91 for India, or add it if missing
//     const whatsappNumber = cleanedPhone.startsWith('91') ? cleanedPhone : `91${cleanedPhone}`;

//     if (whatsappNumber.length >= 10) { // Should be at least 10 digits after cleaning, 12 with 91
//         let message = `Namaskara ${name}! Thank you for your order with Aishaura Microgreens.\n\n`;
//         message += `📦 *Order Confirmation:*\n`;
//         message += `🆔 Order ID: #${orderId}\n`;

//         cart.forEach(item => {
//             message += `🌱 ${item.product}: ${item.quantity}g (₹${item.price}/50g)\n`;
//         });

//         message += `\n💰 *Order Total:* ₹${total.toFixed(2)}\n`;
//         message += `💳 *Payment Method:* ${paymentMethod === 'upi' ? 'UPI' : 'Cash on Delivery'}\n`;
//         message += `🏠 *Delivery Address:* ${address}\n`;

//         if (notes) {
//             message += `📝 *Special Instructions:* ${notes}\n`;
//         }

//         if (paymentMethod === 'upi') {
//             message += `\n*Please complete your UPI payment to:*\n`;
//             message += `UPI ID: shashi.shashi7271@ybl\n`;
//             message += `Amount: ₹${total.toFixed(2)}\n\n`;
//             message += `We'll process your order once payment is confirmed.`;
//         } else {
//             message += `\nWe'll process your order shortly. Please keep cash ready for delivery.`;
//         }

//         message += `\n\nThank you for choosing Aishaura Microgreens!`;

//         const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
//         window.open(whatsappUrl, '_blank');
//     } else {
//         console.warn('Invalid phone number for WhatsApp:', phone);
//     }
// }
