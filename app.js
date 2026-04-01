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
const GOOGLE_PRODUCTS_API_BASE_URL = "https://script.google.com/macros/s/AKfycby0-rMjp4fh4_VEYfSUHEcSG-e3DE4IufkpY5WN1J4d1CmxldNzRQGYpfpUunEt2jEf/exec";
const GOOGLE_ALL_DATA_API_URL = `${GOOGLE_PRODUCTS_API_BASE_URL}?action=all`;
const GOOGLE_RECIPES_API_URL = `${GOOGLE_PRODUCTS_API_BASE_URL}?action=recipes`;

// Global variable to hold product data (will be fetched from Google Sheets API)
let productData = {};

/**
 * Fetch product data from Google Sheets via Apps Script API
 * Called on page load to populate products, reviews, and recipes
 */
async function fetchProductDataFromSheets() {
  try {
    console.log('Fetching products, reviews, and recipes from Google Sheets...');
    
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

      const [productsFetch, recipesFetch] = await Promise.allSettled([
        fetch(GOOGLE_ALL_DATA_API_URL, requestOptions),
        fetch(GOOGLE_RECIPES_API_URL, requestOptions)
      ]);

      clearTimeout(timeoutId);

      if (productsFetch.status !== 'fulfilled') {
        throw productsFetch.reason;
      }

      const productsResponse = productsFetch.value;
      const recipesResponse = recipesFetch.status === 'fulfilled' ? recipesFetch.value : null;

      if (!productsResponse.ok) {
        throw new Error(`Products API HTTP error! status: ${productsResponse.status}`);
      }

      const productsResult = await productsResponse.json();
      let recipesResult = null;

      if (recipesResponse && recipesResponse.ok) {
        recipesResult = await recipesResponse.json();
      } else if (recipesResponse) {
        console.warn(`Recipes API HTTP error! status: ${recipesResponse.status}`);
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

        // Merge review data from the unified all-data API response.
        if (productsResult.hasReviews) {
          const reviewsByProduct = normalizeReviewsResponse(productsResult);
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
        
        if (recipesResult) {
          const normalizedRecipes = normalizeRecipesResponse(recipesResult);
          if (Object.keys(normalizedRecipes.recipes).length > 0) {
            replaceRecipeData(normalizedRecipes.recipes);
            recipeOfTheWeekName = normalizedRecipes.featuredName || recipeOfTheWeekName;
            console.log('Recipe data loaded from Google Sheets:', Object.keys(recipeData).length, 'recipes');
          } else {
            console.log('Using local fallback recipe data. No sheet recipes were returned.');
          }
        } else {
          console.log('Using local fallback recipe data. Recipes sheet endpoint unavailable or not yet deployed.');
        }

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

function parseDelimitedList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  const text = String(value || '').trim();
  if (!text) return [];

  return text
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSheetBoolean(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return ['true', 'yes', 'y', '1', 'featured'].includes(normalized);
}

function normalizeRecipeEntry(recipeName, item) {
  return {
    image: item && item.image ? String(item.image).trim() : '',
    badge: item && item.badge ? String(item.badge).trim() : 'Recipe Idea',
    summary: item && item.summary ? String(item.summary).trim() : String(item?.description || '').trim(),
    description: item && item.description ? String(item.description).trim() : '',
    prepTime: item && (item.prepTime || item.prep_time || item.prep) ? String(item.prepTime || item.prep_time || item.prep).trim() : '10 min',
    difficulty: item && item.difficulty ? String(item.difficulty).trim() : 'Easy',
    bestFor: item && (item.bestFor || item.best_for) ? String(item.bestFor || item.best_for).trim() : 'Anytime',
    categories: parseDelimitedList(item && (item.categories || item.category)),
    pairsWith: parseDelimitedList(item && (item.pairsWith || item.pairs_with || item.pairings)),
    shopProducts: parseDelimitedList(item && (item.shopProducts || item.shop_products || item.shopProduct)),
    whyItWorks: item && (item.whyItWorks || item.why_it_works) ? String(item.whyItWorks || item.why_it_works).trim() : '',
    swapIdea: item && (item.swapIdea || item.swap_idea) ? String(item.swapIdea || item.swap_idea).trim() : '',
    benefits: parseDelimitedList(item && item.benefits),
    ingredients: parseDelimitedList(item && item.ingredients),
    instructions: parseDelimitedList(item && (item.instructions || item.steps)),
    featured: parseSheetBoolean(item && (item.featured || item.isFeatured))
  };
}

function normalizeRecipesResponse(result) {
  const recipes = {};
  let featuredName = '';

  const attachRecipe = (incomingName, rawItem) => {
    const recipeName = String(incomingName || rawItem?.name || rawItem?.recipeName || rawItem?.recipe_name || '').trim();
    if (!recipeName) return;
    const normalized = normalizeRecipeEntry(recipeName, rawItem || {});
    recipes[recipeName] = normalized;
    if (normalized.featured) featuredName = recipeName;
  };

  if (result && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    Object.keys(result.data).forEach((recipeName) => {
      attachRecipe(recipeName, result.data[recipeName]);
    });
  }

  if (result && Array.isArray(result.data)) {
    result.data.forEach((item) => attachRecipe('', item));
  }

  if (Array.isArray(result)) {
    result.forEach((item) => attachRecipe('', item));
  }

  const explicitFeatured = String(result?.featuredRecipe || result?.featured_recipe || '').trim();
  if (explicitFeatured && recipes[explicitFeatured]) {
    featuredName = explicitFeatured;
  }

  return { recipes, featuredName };
}

function replaceRecipeData(nextRecipes) {
  Object.keys(recipeData).forEach((key) => {
    delete recipeData[key];
  });
  Object.assign(recipeData, nextRecipes);
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
        badge: "5-Min Breakfast",
        summary: "Creamy avocado, citrus, and fresh microgreen crunch for a cafe-style start in minutes.",
        description: "A cafe-style breakfast with creamy avocado, bright lemon, and a generous layer of crunchy sunflower microgreens.",
        prepTime: "7 min",
        difficulty: "Easy",
        bestFor: "Breakfast",
        categories: ["breakfast", "under-10-min"],
        pairsWith: ["Sunflower Microgreens", "Radish Microgreens"],
        shopProducts: ["Sunflower Microgreens", "Radish Microgreens"],
        whyItWorks: "Creamy avocado gives the greens something rich to sit against, so the crunch and freshness feel built into the toast instead of sprinkled on top as an afterthought.",
        swapIdea: "Use Radish Microgreens instead of Sunflower Microgreens for a sharper, peppery finish.",
        ingredients: [
            "2 slices whole grain bread",
            "1 ripe avocado",
            "50g sunflower microgreens",
            "1 tbsp lemon juice",
            "Salt and pepper to taste",
            "Chilli flakes or sesame seeds optional"
        ],
        instructions: [
            "Toast the bread until crisp and golden.",
            "Mash the avocado with lemon juice, salt, and pepper.",
            "Spread the avocado thickly over the toast.",
            "Top generously with sunflower microgreens.",
            "Finish with chilli flakes or sesame seeds and serve immediately."
        ],
        benefits: [
            "Rich in healthy fats, fiber, and fresh greens",
            "An easy weekday breakfast that still feels premium",
            "Adds texture without needing extra sauces or toppings",
            "Keeps breakfast light but satisfying"
        ]
    },
    "Sunflower Green Smoothie": {
        image: "images/sunflower-smoothie.jpg",
        badge: "Post-Workout Blend",
        summary: "Banana, almond butter, and sunflower greens blended into a creamy glass with real staying power.",
        description: "A creamy, protein-friendly smoothie that turns sunflower greens into an easy post-workout or on-the-go breakfast blend.",
        prepTime: "5 min",
        difficulty: "Easy",
        bestFor: "Recovery",
        categories: ["breakfast", "under-10-min", "high-protein"],
        pairsWith: ["Sunflower Microgreens", "Broccoli Microgreens"],
        shopProducts: ["Sunflower Microgreens", "Broccoli Microgreens"],
        whyItWorks: "Sunflower greens disappear easily into sweet, creamy ingredients, so the recipe feels approachable even for first-time microgreen buyers.",
        swapIdea: "Swap in Broccoli Microgreens for a fresher, milder green note.",
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
            "High in plant-forward protein and steady energy",
            "Great for busy mornings or post-workout recovery",
            "A simple way to use microgreens daily without cooking",
            "Naturally filling without feeling heavy"
        ]
    },
    "Microgreen Buddha Bowl": {
        image: "images/buddha-bowl.jpg",
        badge: "Power Lunch",
        summary: "A layered bowl of quinoa, chickpeas, and greens that feels hearty, bright, and meal-prep friendly.",
        description: "A vibrant bowl layered with quinoa, chickpeas, avocado, and microgreens for a satisfying lunch that still feels light.",
        prepTime: "15 min",
        difficulty: "Easy",
        bestFor: "Lunch",
        categories: ["high-protein"],
        pairsWith: ["Broccoli Microgreens", "Beetroot Microgreens", "Sunflower Microgreens"],
        shopProducts: ["Broccoli Microgreens", "Sunflower Microgreens", "Beetroot Microgreens"],
        whyItWorks: "The bowl already has creamy, crunchy, and hearty elements, so microgreens act like the fresh finish that lifts everything instead of making the dish feel heavier.",
        swapIdea: "Use Beetroot Microgreens instead of Broccoli Microgreens when you want a sweeter, more colorful bowl.",
        ingredients: [
            "1 cup cooked quinoa",
            "50g broccoli microgreens",
            "1/2 avocado, sliced",
            "1/2 cup chickpeas",
            "1/4 cup shredded carrots",
            "1/4 cup cucumber",
            "2 tbsp tahini or lemon dressing"
        ],
        instructions: [
            "Add quinoa to the base of a bowl.",
            "Arrange avocado, chickpeas, carrots, and cucumber on top.",
            "Pile broccoli microgreens in the center.",
            "Drizzle with dressing and toss lightly before eating."
        ],
        benefits: [
            "Balanced bowl with protein, fiber, and fresh crunch",
            "Easy to prep ahead for weekday lunches",
            "Works well warm or chilled",
            "A strong entry point for customers who want a full meal idea"
        ]
    },
    "Radish Microgreen Salad": {
        image: "images/radish-salad.jpg",
        badge: "Fresh and Peppery",
        summary: "Peppery radish greens, juicy tomatoes, and a bright lemon finish that wakes up any plate.",
        description: "A bright, peppery salad where radish microgreens bring the bite and the lemon dressing keeps everything lively.",
        prepTime: "8 min",
        difficulty: "Easy",
        bestFor: "Light Lunch",
        categories: ["under-10-min", "no-cook"],
        pairsWith: ["Radish Microgreens", "Beetroot Microgreens"],
        shopProducts: ["Radish Microgreens", "Beetroot Microgreens"],
        whyItWorks: "Radish microgreens bring enough flavor to make a simple salad feel intentional, especially when the dressing stays bright and minimal.",
        swapIdea: "Swap in Beetroot Microgreens if you want the salad to feel softer and slightly sweeter.",
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
            "Quick salad with strong flavor and very little prep",
            "Ideal when customers want a fast raw use-case",
            "Helps the peppery profile of radish greens shine",
            "Works as a side or a light standalone meal"
        ]
    },
    "Bangalore Microgreen Chaat": {
        image: "images/mixed.jpg",
        badge: "Street-Style Twist",
        summary: "Masala potato, chutneys, sev, and peppery microgreens for a familiar chaat with a fresher top note.",
        description: "A home-style chaat bowl that uses microgreens as a real flavor layer, not just garnish, with chutneys, potato, onion, and bright crunch in every spoonful.",
        prepTime: "10 min",
        difficulty: "Easy",
        bestFor: "Evening Snack",
        categories: ["under-10-min", "indian-style"],
        pairsWith: ["Radish Microgreens", "Mustard Microgreens"],
        shopProducts: ["Radish Microgreens", "Mustard Microgreens"],
        whyItWorks: "Chaat already thrives on contrast, so peppery microgreens fit naturally with potato, chutneys, and sev while making the bowl feel fresher and lighter.",
        swapIdea: "Use Mustard Microgreens instead of Radish Microgreens for an even sharper, wasabi-like hit.",
        ingredients: [
            "1 boiled potato diced",
            "1/4 cup chopped onion",
            "2 tbsp green chutney",
            "2 tbsp tamarind chutney",
            "A handful of sev",
            "50g radish microgreens",
            "Chaat masala and lemon to finish"
        ],
        instructions: [
            "Add potato and onion to a serving bowl.",
            "Spoon over both chutneys and toss lightly.",
            "Add radish microgreens generously on top.",
            "Finish with sev, chaat masala, and a squeeze of lemon.",
            "Serve immediately while the textures still contrast."
        ],
        benefits: [
            "Feels local and familiar instead of generic",
            "Turns a snack favorite into a fresher microgreen use-case",
            "Ideal for customers who want Indian flavor cues",
            "Easy to assemble with pantry staples and leftovers"
        ]
    },
    "Paneer Toast with Mustard Crunch": {
        image: "images/mustard.png",
        badge: "High-Protein Snack",
        summary: "Masala paneer on toast with mustard microgreens for a savory, cafe-meets-breakfast upgrade.",
        description: "A savory paneer toast that brings together warm spiced paneer and sharp mustard microgreens for a fast breakfast or filling snack.",
        prepTime: "10 min",
        difficulty: "Easy",
        bestFor: "Breakfast",
        categories: ["breakfast", "under-10-min", "high-protein", "indian-style"],
        pairsWith: ["Mustard Microgreens", "Sunflower Microgreens"],
        shopProducts: ["Mustard Microgreens", "Sunflower Microgreens"],
        whyItWorks: "Paneer brings richness and protein, while mustard greens cut through it with just enough heat to keep the toast from feeling one-note.",
        swapIdea: "Swap to Sunflower Microgreens for a milder, nuttier version that kids may prefer.",
        ingredients: [
            "2 slices multigrain bread",
            "1/2 cup crumbled paneer",
            "1 tsp butter or ghee",
            "Pinch of chilli flakes and cumin",
            "50g mustard microgreens",
            "Salt and pepper to taste"
        ],
        instructions: [
            "Toast the bread lightly.",
            "Warm paneer in a pan with butter, cumin, salt, and chilli flakes.",
            "Spread or pile the paneer over the toast.",
            "Top with mustard microgreens just before serving."
        ],
        benefits: [
            "Protein-forward and quick enough for weekdays",
            "Great gateway recipe for mustard microgreens",
            "Easy to scale from one slice to a full brunch plate",
            "Pairs well with chai or a light salad"
        ]
    },
    "Green Dosa Topping": {
        image: "images/broccoli-microgreens.jpg",
        badge: "Breakfast Upgrade",
        summary: "Crisp dosa, podi or chutney, and fresh greens layered on top right before serving.",
        description: "A quick way to make dosa feel fresher and more interesting by finishing it with microgreens, podi, and a spoon of chutney or curd.",
        prepTime: "6 min",
        difficulty: "Easy",
        bestFor: "Breakfast",
        categories: ["breakfast", "under-10-min", "indian-style"],
        pairsWith: ["Broccoli Microgreens", "Mustard Microgreens"],
        shopProducts: ["Broccoli Microgreens", "Mustard Microgreens"],
        whyItWorks: "Hot dosa gives the dish comfort, while the greens stay fresh and crisp because they go on at the end instead of cooking down.",
        swapIdea: "Use Mustard Microgreens instead of Broccoli Microgreens when you want a stronger spicy finish.",
        ingredients: [
            "2 ready dosas",
            "2 tsp gunpowder or podi",
            "2 tbsp coconut chutney or curd",
            "50g broccoli microgreens",
            "A little ghee optional"
        ],
        instructions: [
            "Cook or reheat the dosas until crisp.",
            "Spread chutney or curd over the surface.",
            "Sprinkle podi and add broccoli microgreens on top.",
            "Fold or serve open while the greens stay fresh."
        ],
        benefits: [
            "Adds freshness to a familiar breakfast",
            "Low-effort way to use microgreens with Indian staples",
            "Works with plain dosa, pesarattu, or uttapam",
            "Good option for repeat weekly use"
        ]
    },
    "Radish Raita Bowl": {
        image: "images/radish.jpg",
        badge: "Cooling Side",
        summary: "Curd, cumin, cucumber, and peppery radish greens make a side dish with more personality than plain raita.",
        description: "A cooling raita bowl that uses radish microgreens for bite and freshness, making it especially good next to pulao, paratha, or grilled food.",
        prepTime: "7 min",
        difficulty: "Easy",
        bestFor: "Side Dish",
        categories: ["under-10-min", "no-cook", "indian-style"],
        pairsWith: ["Radish Microgreens", "Beetroot Microgreens"],
        shopProducts: ["Radish Microgreens", "Beetroot Microgreens"],
        whyItWorks: "Curd softens the spicy edge of radish greens, so the flavor stays lively without overwhelming the rest of the meal.",
        swapIdea: "Use Beetroot Microgreens instead for a softer and slightly sweeter raita bowl.",
        ingredients: [
            "1 cup thick curd",
            "1/4 cup grated or diced cucumber",
            "50g radish microgreens",
            "Roasted cumin powder",
            "Salt to taste",
            "A few pomegranate seeds optional"
        ],
        instructions: [
            "Whisk the curd until smooth.",
            "Mix in cucumber, cumin, and salt.",
            "Fold in most of the radish microgreens.",
            "Top with the remaining greens and pomegranate before serving."
        ],
        benefits: [
            "Very approachable for customers who cook Indian meals often",
            "No-cook and genuinely fast to assemble",
            "Works as a side, dip, or lunch add-on",
            "Balances spicy mains with freshness"
        ]
    },
    "Sandwich Booster Mix": {
        image: "images/sunflower.jpg",
        badge: "Lunchbox Hero",
        summary: "A crunchy microgreen mix that instantly lifts grilled sandwiches, veggie toasties, and packed lunch layers.",
        description: "A simple sandwich booster that turns everyday bread-and-filling combos into something fresher and more textured with a handful of microgreens.",
        prepTime: "5 min",
        difficulty: "Easy",
        bestFor: "Lunchbox",
        categories: ["under-10-min"],
        pairsWith: ["Sunflower Microgreens", "Beetroot Microgreens"],
        shopProducts: ["Sunflower Microgreens", "Beetroot Microgreens"],
        whyItWorks: "Sandwiches usually need texture more than more sauce, and sunflower greens solve that instantly while keeping the filling from tasting flat.",
        swapIdea: "Use Beetroot Microgreens when you want more color and a softer bite in cold sandwiches.",
        ingredients: [
            "2 bread slices or sandwich buns",
            "Your favorite filling such as paneer, cheese, or hummus",
            "50g sunflower microgreens",
            "Tomato or cucumber slices optional",
            "Butter or chutney optional"
        ],
        instructions: [
            "Prepare the bread with your chosen spread.",
            "Add the filling and vegetables if using.",
            "Layer sunflower microgreens generously before closing.",
            "Serve fresh or pack for later."
        ],
        benefits: [
            "Easy to repeat through the week with different fillings",
            "Great for lunchboxes and after-school snacks",
            "Makes simple sandwiches feel more premium",
            "Requires no new cooking technique"
        ]
    },
    "Lunchbox Wrap": {
        image: "images/beetroot-microgreens.jpg",
        badge: "Pack and Go",
        summary: "Soft roti or wrap stuffed with hummus, paneer, or leftover sabzi and bright beetroot greens.",
        description: "A practical lunchbox wrap that uses microgreens to keep each bite fresh, even when the filling is simple or made from leftovers.",
        prepTime: "9 min",
        difficulty: "Easy",
        bestFor: "Lunchbox",
        categories: ["under-10-min"],
        pairsWith: ["Beetroot Microgreens", "Broccoli Microgreens"],
        shopProducts: ["Beetroot Microgreens", "Broccoli Microgreens"],
        whyItWorks: "Lunchbox food can turn dense quickly, and beetroot microgreens keep the wrap lighter and brighter without adding watery vegetables.",
        swapIdea: "Use Broccoli Microgreens when you want a cleaner, less earthy finish.",
        ingredients: [
            "1 soft roti or tortilla",
            "2 tbsp hummus or hung curd spread",
            "1/2 cup paneer bhurji or leftover dry sabzi",
            "50g beetroot microgreens",
            "A squeeze of lemon"
        ],
        instructions: [
            "Spread hummus or hung curd over the wrap.",
            "Add paneer bhurji or leftover sabzi in a line.",
            "Top with beetroot microgreens and lemon.",
            "Roll tightly and pack or serve immediately."
        ],
        benefits: [
            "Excellent use for leftover sabzi, paneer, or hummus",
            "Travel-friendly and easy to prep in the morning",
            "A strong everyday recipe for repeat orders",
            "Looks colorful without extra fuss"
        ]
    },
    "Beetroot Curd Rice Crunch": {
        image: "images/beetroot-microgreens.jpg",
        badge: "Comfort Food Lift",
        summary: "Cool curd rice topped with ruby-stem microgreens for color, freshness, and a little crunch.",
        description: "A comforting curd rice bowl finished with beetroot microgreens so the dish stays familiar but looks and tastes more alive.",
        prepTime: "8 min",
        difficulty: "Easy",
        bestFor: "Comfort Lunch",
        categories: ["under-10-min", "indian-style"],
        pairsWith: ["Beetroot Microgreens", "Radish Microgreens"],
        shopProducts: ["Beetroot Microgreens", "Radish Microgreens"],
        whyItWorks: "Curd rice is soft and soothing, which makes colorful beetroot greens especially noticeable in both texture and visual appeal.",
        swapIdea: "Swap in Radish Microgreens if you want the bowl to lean sharper and less sweet.",
        ingredients: [
            "1 cup cooked rice",
            "1/2 cup curd",
            "Salt to taste",
            "1 tsp tempering with mustard seeds and curry leaves optional",
            "50g beetroot microgreens",
            "Pomegranate or grated carrot optional"
        ],
        instructions: [
            "Mix rice, curd, and salt until creamy.",
            "Add tempering if using.",
            "Top with beetroot microgreens just before serving.",
            "Finish with pomegranate or grated carrot if desired."
        ],
        benefits: [
            "An easy local use-case for repeat customers",
            "Adds color to a pale comfort-food bowl",
            "Works with leftover rice and very little prep",
            "Helps microgreens feel relevant to home-style meals"
        ]
    },
    "Mustard Poha Finish": {
        image: "images/mustard.png",
        badge: "Spicy Morning Lift",
        summary: "Soft poha finished with mustard microgreens for a peppery bite that wakes the whole bowl up.",
        description: "A quick poha upgrade that keeps the base comforting but adds a bright peppery finish right at the end with mustard microgreens.",
        prepTime: "8 min",
        difficulty: "Easy",
        bestFor: "Breakfast",
        categories: ["breakfast", "under-10-min", "indian-style"],
        pairsWith: ["Mustard Microgreens", "Radish Microgreens"],
        shopProducts: ["Mustard Microgreens", "Radish Microgreens"],
        whyItWorks: "Poha is soft and mellow, so a handful of mustard greens creates contrast fast without needing extra masala or heavy toppings.",
        swapIdea: "Use Radish Microgreens for a similar lift with a slightly fresher, less sharp flavor.",
        ingredients: [
            "1 bowl cooked poha",
            "50g mustard microgreens",
            "A squeeze of lemon",
            "Roasted peanuts optional",
            "Fresh coriander optional"
        ],
        instructions: [
            "Prepare or reheat poha as usual.",
            "Move it to a serving bowl.",
            "Top with mustard microgreens, lemon, and peanuts.",
            "Serve immediately while the greens stay crisp."
        ],
        benefits: [
            "Fits naturally into Indian breakfast habits",
            "Takes almost no extra cooking time",
            "A good repeat-use recipe for weekly buyers",
            "Makes mild breakfasts feel brighter and fresher"
        ]
    }
};

const RECIPE_OF_THE_WEEK = "Bangalore Microgreen Chaat";
let recipeOfTheWeekName = RECIPE_OF_THE_WEEK;
const RECIPE_CATEGORY_LABELS = {
    all: "All",
    breakfast: "Breakfast",
    "under-10-min": "Under 10 Min",
    "high-protein": "High Protein",
    "no-cook": "No-Cook",
    "indian-style": "Indian Style"
};

function formatRecipeCategoryLabel(category) {
    return RECIPE_CATEGORY_LABELS[category] || String(category || "");
}

function getRecipePrimaryPairing(recipe) {
    return Array.isArray(recipe?.pairsWith) && recipe.pairsWith.length > 0
        ? recipe.pairsWith[0]
        : "Microgreens";
}

function findProductMatch(candidateNames = []) {
    if (!productData || typeof productData !== "object") return "";

    const normalizedLookup = {};
    Object.keys(productData).forEach((name) => {
        normalizedLookup[normalizeProductKey(name)] = name;
    });

    for (const candidate of candidateNames) {
        if (!candidate) continue;
        if (productData[candidate]) return candidate;
        const normalized = normalizeProductKey(candidate);
        if (normalizedLookup[normalized]) return normalizedLookup[normalized];
        const partialMatch = Object.keys(normalizedLookup).find((key) => key.includes(normalized) || normalized.includes(key));
        if (partialMatch) return normalizedLookup[partialMatch];
    }

    return "";
}

function getRecipeShopProduct(recipe) {
    if (!recipe) return null;
    const candidates = Array.isArray(recipe.shopProducts) && recipe.shopProducts.length > 0
        ? recipe.shopProducts
        : (Array.isArray(recipe.pairsWith) ? recipe.pairsWith : []);
    const productName = findProductMatch(candidates);
    if (!productName || !productData[productName]) return null;
    return {
        name: productName,
        product: productData[productName]
    };
}

function renderRecipesToGallery() {
    const gallery = document.getElementById("recipes-gallery");
    if (!gallery) return;

    const entries = Object.entries(recipeData);
    gallery.innerHTML = entries.map(([recipeName, recipe], index) => {
        const primaryPairing = getRecipePrimaryPairing(recipe);
        const shopMeta = getRecipeShopProduct(recipe);
        const pairPrice = shopMeta ? `${formatCurrency(shopMeta.product.price)} / 50g` : "Fresh weekly harvest";
        const metaItems = [
            `<span><i class="fa-regular fa-clock" aria-hidden="true"></i>${recipe.prepTime}</span>`,
            `<span><i class="fa-solid fa-signal" aria-hidden="true"></i>${recipe.difficulty}</span>`,
            `<span><i class="fa-solid fa-bullseye" aria-hidden="true"></i>${recipe.bestFor}</span>`
        ].join("");
        const chips = (recipe.categories || []).slice(0, 2).map((category) => (
            `<span>${formatRecipeCategoryLabel(category)}</span>`
        )).join("");

        return `
            <article class="card recipe-art" role="button" tabindex="0" data-recipe-name="${recipeName}" data-categories="${(recipe.categories || []).join("|")}" style="--recipe-delay:${index * 70}ms">
                <div class="recipe-card-media">
                    <img src="${recipe.image}" alt="${recipeName}">
                    <span class="recipe-badge">${recipe.badge}</span>
                </div>
                <div class="recipe-card-body">
                    <div class="gallery-title">${recipeName}</div>
                    <div class="recipe-meta-row">${metaItems}</div>
                    <p class="recipe-note">${recipe.summary}</p>
                    <p class="recipe-pairing">Pairs well with <strong>${primaryPairing}</strong><span>${pairPrice}</span></p>
                    <div class="recipe-tags" aria-hidden="true">${chips}</div>
                </div>
            </article>
        `;
    }).join("");

    applyRecipeFilter();
}

function setupRecipeFilters() {
    const toolbar = document.getElementById("recipe-toolbar");
    if (!toolbar || setupRecipeFilters.initialized) return;
    setupRecipeFilters.initialized = true;

    toolbar.addEventListener("click", (e) => {
        const btn = e.target.closest(".recipe-filter");
        if (!btn) return;

        toolbar.querySelectorAll(".recipe-filter").forEach((node) => node.classList.remove("active"));
        btn.classList.add("active");
        activeRecipeFilter = btn.getAttribute("data-filter") || "all";
        applyRecipeFilter();
    });
}

function applyRecipeFilter() {
    const cards = document.querySelectorAll("#recipes-gallery .recipe-art");
    const emptyState = document.getElementById("recipes-filter-empty");
    let visibleCount = 0;

    cards.forEach((card) => {
        const categories = String(card.getAttribute("data-categories") || "").split("|").filter(Boolean);
        const show = activeRecipeFilter === "all" || categories.includes(activeRecipeFilter);
        card.classList.toggle("is-hidden", !show);
        if (show) visibleCount += 1;
    });

    if (emptyState) {
        emptyState.hidden = visibleCount !== 0;
    }
}

function renderFeaturedRecipeOfWeek() {
    const container = document.getElementById("featured-recipe-week");
    const featuredName = recipeData[recipeOfTheWeekName]
        ? recipeOfTheWeekName
        : (Object.keys(recipeData)[0] || RECIPE_OF_THE_WEEK);
    const recipe = recipeData[featuredName];
    if (!container || !recipe) return;

    recipeOfTheWeekName = featuredName;

    const shopMeta = getRecipeShopProduct(recipe);
    const pairingName = shopMeta ? shopMeta.name : getRecipePrimaryPairing(recipe);
    const priceLine = shopMeta
        ? `${formatCurrency(shopMeta.product.price)} per 50g`
        : "Availability depends on weekly harvest";
    const shopButton = shopMeta
        ? `<button type="button" class="featured-recipe-btn featured-recipe-btn-primary" data-shop-product="${shopMeta.name}" data-shop-quantity="50">Shop this recipe</button>`
        : `<button type="button" class="featured-recipe-btn featured-recipe-btn-primary" disabled>Pairing unavailable</button>`;

    container.innerHTML = `
        <div class="featured-recipe-media">
            <img src="${recipe.image}" alt="${featuredName}">
        </div>
        <div class="featured-recipe-copy">
            <span class="featured-recipe-kicker">Recipe of the Week</span>
            <h3>${featuredName}</h3>
            <p>${recipe.summary}</p>
            <div class="featured-recipe-meta">
                <span><i class="fa-regular fa-clock" aria-hidden="true"></i>${recipe.prepTime}</span>
                <span><i class="fa-solid fa-signal" aria-hidden="true"></i>${recipe.difficulty}</span>
                <span><i class="fa-solid fa-bullseye" aria-hidden="true"></i>${recipe.bestFor}</span>
            </div>
            <div class="featured-recipe-pairing">
                <strong>Pairs well with ${pairingName}</strong>
                <span>${priceLine}</span>
            </div>
            <p class="featured-recipe-why">${recipe.whyItWorks}</p>
            <div class="featured-recipe-actions">
                <button type="button" class="featured-recipe-btn featured-recipe-btn-secondary" data-open-recipe="${featuredName}">View recipe</button>
                ${shopButton}
            </div>
        </div>
    `;
}

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
let activeRecipeFilter = 'all';
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
        renderRecipesToGallery();
        setupRecipeFilters();
        renderFeaturedRecipeOfWeek();

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
        renderRecipesToGallery();
        setupRecipeFilters();
        renderFeaturedRecipeOfWeek();
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
    const hasOpenModal = isAnyModalOpen();
    document.body.classList.toggle('has-open-modal', hasOpenModal);
    document.body.style.overflow = hasOpenModal ? 'hidden' : 'auto';
    if (typeof updateMiniCartBar === 'function') {
        updateMiniCartBar();
    }
}

function setModalVisibility(modal, isVisible, bodyClassName) {
    if (!modal) return;
    modal.style.display = isVisible ? 'block' : 'none';
    if (bodyClassName) {
        document.body.classList.toggle(bodyClassName, !!isVisible);
    }
    syncBodyScrollLock();
}

function closeCheckoutModal() {
    const checkoutModal = document.getElementById('checkout-modal');
    setModalVisibility(checkoutModal, false);
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

    setModalVisibility(ui.modal, true, 'auth-modal-open');
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
    setModalVisibility(ui.modal, false, 'auth-modal-open');
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

        // After successful auth, return to checkout if user has items in cart
        const checkoutModal = document.getElementById('checkout-modal');
        if (cart.length > 0) {
            // Reopen checkout modal that was closed for auth
            setTimeout(() => {
                setModalVisibility(checkoutModal, true);
                showCheckoutStep(2);
            }, 100);
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
            setModalVisibility(modal, true);
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            setModalVisibility(modal, false);
        });
    }

    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            setModalVisibility(modal, false);
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
            setModalVisibility(reviewsModal, false);
        });
    }

    // Click outside modal to close
    window.addEventListener('click', function(e) {
        if (e.target === reviewsModal) {
            setModalVisibility(reviewsModal, false);
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
            setModalVisibility(reviewsModal, true);
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

function setModalSectionHeadings(benefitsText = 'Health Benefits', usageText = 'How to Use') {
    const benefitsHeading = document.getElementById('modal-benefits-heading');
    const usageHeading = document.getElementById('modal-usage-heading');
    if (benefitsHeading) benefitsHeading.textContent = benefitsText;
    if (usageHeading) usageHeading.textContent = usageText;
}

function buildModalList(items, ordered = false, className = '') {
    const list = document.createElement(ordered ? 'ol' : 'ul');
    if (className) list.className = className;
    items.forEach((itemText) => {
        const item = document.createElement('li');
        item.textContent = itemText;
        list.appendChild(item);
    });
    return list;
}

function createRecipeUsageSection(title, listNode) {
    const section = document.createElement('div');
    section.className = 'recipe-modal-section';
    const heading = document.createElement('h4');
    heading.className = 'recipe-modal-section-title';
    heading.textContent = title;
    section.appendChild(heading);
    section.appendChild(listNode);
    return section;
}

function renderRecipeEnhancementsInModal(recipe) {
    const descriptionEl = document.getElementById('modal-description');
    if (!descriptionEl || !recipe) return null;

    const shopMeta = getRecipeShopProduct(recipe);
    const pairingNames = Array.isArray(recipe.pairsWith) ? recipe.pairsWith : [];

    let extras = document.getElementById('modal-recipe-extras');
    if (!extras) {
        extras = document.createElement('div');
        extras.id = 'modal-recipe-extras';
        extras.className = 'modal-recipe-extras';
        descriptionEl.insertAdjacentElement('afterend', extras);
    }

    extras.innerHTML = `
        <div class="recipe-stat-grid">
            <div class="recipe-stat-card"><span>Prep Time</span><strong>${recipe.prepTime}</strong></div>
            <div class="recipe-stat-card"><span>Difficulty</span><strong>${recipe.difficulty}</strong></div>
            <div class="recipe-stat-card"><span>Best For</span><strong>${recipe.bestFor}</strong></div>
        </div>
        <div class="recipe-pairing-card">
            <div>
                <span class="recipe-card-eyebrow">Pairs well with</span>
                <strong>${pairingNames.join(' / ')}</strong>
                <p>${shopMeta ? `${formatCurrency(shopMeta.product.price)} per 50g · Adds a ready-to-use pack to cart` : 'Weekly pairings update with product availability.'}</p>
            </div>
        </div>
        <div class="recipe-story-grid">
            <div class="recipe-story-card">
                <h4>Why this works</h4>
                <p>${recipe.whyItWorks}</p>
            </div>
            <div class="recipe-story-card">
                <h4>Swap idea</h4>
                <p>${recipe.swapIdea}</p>
            </div>
        </div>
    `;

    return shopMeta;
}

function openProductModal(productName) {
    const modal = document.getElementById('product-modal');
    const product = productData[productName];
    if (!modal || !product) return;

    resetProductModalEnhancements();
    modal.classList.add('product-view');
    modal.classList.remove('recipe-view');
    setModalSectionHeadings('Health Benefits', 'How to Use');

    const modalPrice = document.getElementById('modal-price');
    modalPrice.classList.remove('recipe-mode');
    modalPrice.style.display = '';
    modalPrice.textContent = `${formatCurrency(product.price)} per 50g`;

    document.getElementById('modal-image').src = product.image;
    document.getElementById('modal-image').alt = productName;
    document.getElementById('modal-title').textContent = productName;
    document.getElementById('modal-description').textContent = product.description;

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

    const benefitsContainer = document.getElementById('modal-benefits');
    benefitsContainer.innerHTML = '';
    benefitsContainer.appendChild(buildModalList(product.benefits || []));

    const usageContainer = document.getElementById('modal-usage');
    usageContainer.innerHTML = '';
    usageContainer.appendChild(buildModalList(product.usage || []));
    renderProductReviewsInModal(product);
    renderProductFaqInModal(product);

    document.querySelector('#product-modal .quantity-input').value = 50;
    setupModalQuantityHelper(product);

    const addToCartBtn = document.getElementById('add-to-cart-modal');
    const quantityInput = document.querySelector('#product-modal .quantity-input');
    const quantityBtns = document.querySelectorAll('#product-modal .quantity-btn');
    addToCartBtn.disabled = false;
    addToCartBtn.textContent = '+ Add to Cart';
    addToCartBtn.style.background = '';
    addToCartBtn.style.cursor = 'pointer';
    quantityInput.disabled = false;
    quantityBtns.forEach((btn) => { btn.disabled = false; });

    addToCartBtn.onclick = function() {
        const quantity = parseInt(document.querySelector('#product-modal .quantity-input').value, 10);
        addToCart(productName, quantity, product.price);
        setModalVisibility(modal, false);
    };

    document.querySelector('#product-modal .quantity-selector').style.display = 'flex';
    addToCartBtn.style.display = 'block';
    setModalVisibility(modal, true);
}

function openRecipeModal(recipeName) {
    const modal = document.getElementById('product-modal');
    const recipe = recipeData[recipeName];
    if (!modal || !recipe) return;

    resetProductModalEnhancements();
    modal.classList.remove('product-view');
    modal.classList.add('recipe-view');
    setModalSectionHeadings('Why You Will Love It', 'Ingredients and Steps');

    document.getElementById('modal-image').src = recipe.image;
    document.getElementById('modal-image').alt = recipeName;
    document.getElementById('modal-title').textContent = recipeName;

    const modalPrice = document.getElementById('modal-price');
    modalPrice.classList.add('recipe-mode');
    modalPrice.style.display = 'inline-flex';
    modalPrice.textContent = recipe.badge;

    document.getElementById('modal-description').textContent = recipe.description;
    const shopMeta = renderRecipeEnhancementsInModal(recipe);

    const benefitsContainer = document.getElementById('modal-benefits');
    benefitsContainer.innerHTML = '';
    benefitsContainer.appendChild(buildModalList(recipe.benefits || []));

    const usageContainer = document.getElementById('modal-usage');
    usageContainer.innerHTML = '';
    usageContainer.appendChild(createRecipeUsageSection('Ingredients', buildModalList(recipe.ingredients || [])));
    usageContainer.appendChild(createRecipeUsageSection('Steps', buildModalList(recipe.instructions || [], true, 'recipe-steps')));

    const modalQty = document.querySelector('#product-modal .quantity-selector');
    const modalCartBtn = document.getElementById('add-to-cart-modal');
    if (modalQty) modalQty.style.display = 'none';
    if (modalCartBtn) {
        modalCartBtn.style.display = 'block';
        if (shopMeta) {
            modalCartBtn.disabled = false;
            modalCartBtn.textContent = `Shop this recipe: ${shopMeta.name}`;
            modalCartBtn.onclick = function() {
                addToCart(shopMeta.name, 50, shopMeta.product.price);
                setModalVisibility(modal, false);
            };
        } else {
            modalCartBtn.disabled = true;
            modalCartBtn.textContent = 'Pairing unavailable right now';
            modalCartBtn.onclick = null;
        }
    }

    setModalVisibility(modal, true);
}

function resetProductModalEnhancements() {
    const productExtras = document.getElementById('modal-product-extras');
    if (productExtras) productExtras.remove();
    const recipeExtras = document.getElementById('modal-recipe-extras');
    if (recipeExtras) recipeExtras.remove();
    const helper = document.getElementById('modal-quantity-helper');
    if (helper) helper.remove();
    const modal = document.getElementById('product-modal');
    const modalPrice = document.getElementById('modal-price');
    if (modal) {
        modal.classList.remove('product-view', 'recipe-view');
    }
    if (modalPrice) {
        modalPrice.classList.remove('recipe-mode');
        modalPrice.style.display = '';
    }
    setModalSectionHeadings('Health Benefits', 'How to Use');
    activeModalProduct = null;
}

function initializeModal() {
    const modal = document.getElementById('product-modal');
    if (!modal || initializeModal.initialized) return;
    initializeModal.initialized = true;
    const closeBtn = modal.querySelector('.close-modal');

    document.addEventListener('click', function(e) {
        const shopBtn = e.target.closest('[data-shop-product]');
        if (shopBtn) {
            const productName = shopBtn.getAttribute('data-shop-product');
            const quantity = parseInt(shopBtn.getAttribute('data-shop-quantity') || '50', 10);
            const product = productData[productName];
            if (product) {
                addToCart(productName, quantity, product.price);
            }
            return;
        }

        const featuredRecipeBtn = e.target.closest('[data-open-recipe]');
        if (featuredRecipeBtn) {
            openRecipeModal(featuredRecipeBtn.getAttribute('data-open-recipe'));
            return;
        }

        const recipeCard = e.target.closest('#recipes-gallery .recipe-art');
        if (recipeCard) {
            openRecipeModal(recipeCard.getAttribute('data-recipe-name'));
            return;
        }

        const productCard = e.target.closest('#products-gallery .card');
        if (!productCard) return;
        if (e.target.closest('.quantity-selector') || e.target.closest('.add-to-cart') || e.target.closest('.card-rating')) {
            return;
        }

        const titleEl = productCard.querySelector('.gallery-title');
        if (!titleEl) return;
        openProductModal(titleEl.textContent.trim());
    });

    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const recipeCard = e.target.closest('#recipes-gallery .recipe-art');
        if (!recipeCard) return;
        e.preventDefault();
        openRecipeModal(recipeCard.getAttribute('data-recipe-name'));
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            setModalVisibility(modal, false);
        });
    }

    // Close modal if clicking outside content
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            setModalVisibility(modal, false);
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
    bar.classList.toggle('show', cart.length > 0 && !isAnyModalOpen());
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
        closeCheckoutModal(); // Close checkout if cart empty
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
    setModalVisibility(document.getElementById('checkout-modal'), true);
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
            // CRITICAL: Close checkout modal before opening auth modal to prevent overlap
            closeCheckoutModal();
            // Small delay to ensure checkout is fully closed before auth modal opens
            setTimeout(() => {
                openAuthModal();
            }, 50);
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
                closeCheckoutModal();
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
        closeCheckoutModal();
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
    closeCheckoutModal();
    
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
    renderRecipesToGallery();
    renderFeaturedRecipeOfWeek();
    
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
    closeCheckoutModal();
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
