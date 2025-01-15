let currentAnalysis = null;
let currentAsin = null;
let elements = null; // Add this global variable

function clearAnalysis() {
    currentAnalysis = null;
    if (elements) {
        elements.initialView.style.display = 'block';
        elements.analysisContent.style.display = 'none';
        elements.results.style.display = 'none';
        elements.popup.classList.remove('showing-results');
    }
}

// Create and inject the UI container
function createUI() {
  const container = document.createElement('div');
  container.id = 'amazon-price-analyzer-container';
  
 // In createUI function, modify fab creation
const fab = document.createElement('button');
fab.id = 'price-analyzer-fab';
fab.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="Price Analyzer" />`;
fab.style.zIndex = '999999';  // Make sure button is clickable

// Add these styles to the image directly to ensure it doesn't interfere with clicks
const fabImg = fab.querySelector('img');
if (fabImg) {
    fabImg.style.pointerEvents = 'none';  // This prevents the image from capturing clicks
}
  // Create the popup
  const popup = document.createElement('div');
  popup.id = 'price-analyzer-popup';
  popup.style.display = 'none';
  popup.innerHTML = `
    <div class="popup-content">
      <button class="close-button">×</button>
      
      <div class="initial-view">
        <div class="mascot">
          <img src="${chrome.runtime.getURL('icons/icon128.png')}" alt="Mascot" />
        </div>
        <h2>Don't Buy Until Our AI Check The Price First!</h2>
        <button class="analyze-button">Analyze The Price</button>
        <p class="disclaimer">*Clicking "Analyze The Price" will redirect you via our affiliate link. We may earn a commission at no cost to you.</p>
      </div>

      <div class="analysis-content" style="display: none;">
        <div class="loading-spinner" style="display: none;">
          <div class="spinner"></div>
          <p>Analyzing price history...</p>
        </div>
        
        <div class="results" style="display: none;">
          <div class="results-header">
            <div class="tiny-mascot">
              <img src="${chrome.runtime.getURL('icons/icon128.png')}" alt="Mascot" />
            </div>
            <h2 class="header-text"></h2>
          </div>

  <div class="fixed-content-box">
    <div class="insight-section">
      <div class="title">💡 Price Insight:</div>
      <div class="text-fit-container">
        <p class="subject1-text"></p>
      </div>
    </div>

    <div class="buy-section">
      <div class="title">🤔 Should You Buy Now?</div>
      <div class="text-fit-container">
        <p class="subject2-text"></p>
      </div>
    </div>
  </div>

          <div class="results-footer">
            <div class="gif-container"></div>
            <button class="track-button">Track Price</button>
            <p class="disclaimer">*The price analysis is based on publicly available data. If you make a purchase through this page, we may earn a commission at no extra cost to you.</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  container.appendChild(fab);
  container.appendChild(popup);
  document.body.appendChild(container);
  
  return { fab, popup };
}

// Extract ASIN from Amazon URL
function getAsin() {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/,
    /\/product\/([A-Z0-9]{10})/,
    /\/gp\/product\/([A-Z0-9]{10})/,
    /\/?([A-Z0-9]{10})(\/|\?|$)/
  ];

  for (const pattern of patterns) {
    const match = window.location.pathname.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const asinParam = urlParams.get('asin');
  if (asinParam && asinParam.match(/^[A-Z0-9]{10}$/)) {
    return asinParam;
  }

  const asinElement = document.querySelector('[data-asin]');
  if (asinElement && asinElement.getAttribute('data-asin').match(/^[A-Z0-9]{10}$/)) {
    return asinElement.getAttribute('data-asin');
  }

  return null;
}

// Type text effect
async function typeText(element, text) {
  element.textContent = text;  // Show text immediately
}

function determineGifCategory(priceGrade) {
  if (!priceGrade) return 'average-price';
  
  switch(priceGrade.toLowerCase()) {
    case 'excellent':
      return 'excellent-price';
    case 'good':
      return 'good-price';
    case 'average':
      return 'average-price';
    case 'not-good':
      return 'not-good-price';
    case 'bad-price':
      return 'bad-price';
    default:
      return 'average-price';
  }
}

function getRandomGif(category) {
  try {
      // Reduce number of GIFs to what you actually have
      const maxGifs = 10; // Adjust this number based on how many GIFs you actually have
      const randomNumber = Math.floor(Math.random() * maxGifs) + 1;
      const gifUrl = chrome.runtime.getURL(`gifs/${category}/${randomNumber}.gif`);
      console.log('Attempting to load GIF:', gifUrl);
      return gifUrl;
  } catch (error) {
      console.error('Error generating GIF URL:', error);
      // Return a fallback GIF
      return chrome.runtime.getURL('gifs/default.gif');
  }
}

// Update watchForVariationChanges to pass the elements
function watchForVariationChanges(elements) {
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
          lastUrl = location.href;
          clearAnalysis(elements);
      }
  });

  // Observe URL changes
  urlObserver.observe(document.body, {
      childList: true,
      subtree: true
  });

  // Watch for variation selection changes
  const variationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
          // Check if this is a variation change
          if (mutation.target.matches('[data-defaultasin], [data-selected-asin]') ||
              mutation.target.closest('[data-defaultasin], [data-selected-asin]')) {
              clearAnalysis();
              break;
          }
      }
  });

  // Observe variation changes
  const variationElements = document.querySelectorAll('#variation_form, #twister');
  variationElements.forEach(element => {
      if (element) {
          variationObserver.observe(element, {
              attributes: true,
              childList: true,
              subtree: true
          });
      }
  });
}

// Initialize the extension
function init() {
  const { fab, popup } = createUI();
  
  // Store all elements in our global elements object
  elements = {
      popup: popup,
      closeButton: popup.querySelector('.close-button'),
      analyzeButton: popup.querySelector('.analyze-button'),
      initialView: popup.querySelector('.initial-view'),
      analysisContent: popup.querySelector('.analysis-content'),
      loadingSpinner: popup.querySelector('.loading-spinner'),
      results: popup.querySelector('.results')
  };

  watchForVariationChanges();

  // Handle FAB click
  fab.addEventListener('click', () => {
      elements.popup.style.display = 'block';
      
      if (currentAnalysis) {
          // Show previous analysis
          elements.popup.classList.add('showing-results');
          elements.initialView.style.display = 'none';
          elements.analysisContent.style.display = 'block';
          elements.results.style.display = 'block';
          elements.loadingSpinner.style.display = 'none';
      } else {
          // Show initial view
          elements.popup.classList.remove('showing-results');
          elements.initialView.style.display = 'block';
          elements.analysisContent.style.display = 'none';
          elements.results.style.display = 'none';
      }
  });

  // Handle analyze button click
  elements.analyzeButton.addEventListener('click', async () => {
      const asin = getAsin();
      currentAsin = asin;

      if (!asin) {
          alert("Sorry, couldn't find the product ID. Please make sure you're on a product page.");
          return;
      }

      try {
          elements.popup.classList.add('showing-results');
          elements.initialView.style.display = 'none';
          elements.analysisContent.style.display = 'block';
          elements.loadingSpinner.style.display = 'flex';
          elements.results.style.display = 'none';

          const response = await chrome.runtime.sendMessage({ type: 'ANALYZE_PRICE', asin });
          
          if (response && response.success && response.text) {
              currentAnalysis = response;
              elements.loadingSpinner.style.display = 'none';
              elements.results.style.display = 'block';

              const headerEl = elements.results.querySelector('.header-text');
              const subject1El = elements.results.querySelector('.subject1-text');
              const subject2El = elements.results.querySelector('.subject2-text');
              
              const subject1Text = response.text.subject1.replace(/💡\s*Price Insight:\s*/g, '').trim();
              const subject2Text = response.text.subject2.replace(/🤔\s*Should You Buy Now\?\s*/g, '').trim();

              headerEl.textContent = response.text.header;
              subject1El.textContent = subject1Text;
              subject2El.textContent = subject2Text;

              const subject1Container = subject1El.closest('.text-fit-container');
              const subject2Container = subject2El.closest('.text-fit-container');
              
              requestAnimationFrame(() => {
                  fitTextToContainer(subject1El, subject1Container);
                  fitTextToContainer(subject2El, subject2Container);
              });

              const priceGrade = response.text.priceGrade || 'average';
              const gifCategory = determineGifCategory(priceGrade);
              const gifUrl = getRandomGif(gifCategory);
              
              const gifContainer = elements.results.querySelector('.gif-container');
              if (gifContainer) {
                  gifContainer.innerHTML = `<img src="${gifUrl}" alt="Price reaction" />`;
              }
          }
      } catch (error) {
          console.error('Error during price analysis:', error);
          currentAnalysis = null;
          elements.loadingSpinner.style.display = 'none';
          elements.results.style.display = 'block';
          
          const headerEl = elements.results.querySelector('.header-text');
          if (headerEl) {
              headerEl.textContent = 'Oops! Something went wrong. Please try again.';
          }

          const subject1El = elements.results.querySelector('.subject1-text');
          const subject2El = elements.results.querySelector('.subject2-text');
          const gifContainer = elements.results.querySelector('.gif-container');
          
          if (subject1El) subject1El.textContent = '';
          if (subject2El) subject2El.textContent = '';
          if (gifContainer) gifContainer.innerHTML = '';
      }
  });

  // Handle close button click
  elements.closeButton.addEventListener('click', () => {
      elements.popup.style.display = 'none';
  });

  // Handle clicking outside
  window.addEventListener('click', (event) => {
      if (!elements.popup.contains(event.target) && event.target !== fab) {
          elements.popup.style.display = 'none';
      }
  });
}
// Add these storage functions
async function saveAnalysis(asin, analysis) {
  const timestamp = Date.now();
  const productFamily = await getProductFamily(asin);
  
  const storageData = {
      analysis,
      timestamp,
      productFamily,
      asin
  };

  chrome.storage.local.set({ [asin]: storageData });
}

async function getStoredAnalysis(asin) {
  const currentProductFamily = await getProductFamily(asin);
  
  return new Promise((resolve) => {
      chrome.storage.local.get(asin, (result) => {
          if (!result[asin]) {
              resolve(null);
              return;
          }

          const { analysis, timestamp, productFamily } = result[asin];
          const timeDiff = Date.now() - timestamp;
          
          // If same product, check 10-minute threshold
          if (asin === result[asin].asin) {
              if (timeDiff < 10 * 60 * 1000) { // 10 minutes
                  resolve(analysis);
                  return;
              }
          }
          // If same product family, check 24-hour threshold
          else if (productFamily === currentProductFamily) {
              if (timeDiff < 24 * 60 * 60 * 1000) { // 24 hours
                  resolve(analysis);
                  return;
              }
          }
          
          // Clear expired analysis
          chrome.storage.local.remove(asin);
          resolve(null);
      });
  });
}

// Function to get product family (based on parent ASIN or similar products)
async function getProductFamily(asin) {
  // Look for parent ASIN in the page
  const parentAsinElement = document.querySelector('[data-parent-asin]');
  if (parentAsinElement) {
      return parentAsinElement.getAttribute('data-parent-asin');
  }
  
  // If no parent ASIN, look for product group/family
  const productGroupElement = document.querySelector('[data-product-group]');
  if (productGroupElement) {
      return productGroupElement.getAttribute('data-product-group');
  }
  
  // If no product group, use first 6 characters of ASIN as family
  return asin.substring(0, 6);
}


// Start the extension
init();