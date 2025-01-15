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

<!-- Analysis View -->
<div class="analysis-content" style="display: none;">
        <div class="loading-spinner" style="display: none;">
          <div class="spinner"></div>
          <p>Analyzing price history...</p>
        </div>
        <div class="results" style="display: none;">
          <div class="results-top">
            <div class="tiny-mascot">
              <img src="${chrome.runtime.getURL('icons/icon128.png')}" alt="Mascot" />
            </div>
            <h2 class="header-text"></h2>
          </div>
          
          <div class="results-content">
            <div class="price-insight">
              <p class="subject1-text"></p>
            </div>

            <div class="buy-advice">
              <p class="subject2-text"></p>
            </div>
          </div>

          <div class="results-bottom">
            <div class="gif-container"></div>
            <button class="track-button">Track Price</button>
            <p class="disclaimer">*The price analysis is based on publicly available data. If you make a purchase through this page, we may earn a commission at no extra cost to you.</p>
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
async function typeText(element, text, speed = 30) {
  element.textContent = '';
  for (let i = 0; i < text.length; i++) {
    element.textContent += text[i];
    await new Promise(resolve => setTimeout(resolve, speed));
  }
}

// Initialize the extension
function init() {
  const { fab, popup } = createUI();
  const closeButton = popup.querySelector('.close-button');
  const analyzeButton = popup.querySelector('.analyze-button');
  const initialView = popup.querySelector('.initial-view');
  const analysisContent = popup.querySelector('.analysis-content');
  const loadingSpinner = popup.querySelector('.loading-spinner');
  const results = popup.querySelector('.results');

  // Handle FAB click
  fab.addEventListener('click', () => {
    popup.style.display = 'block';
    initialView.style.display = 'block';
    analysisContent.style.display = 'none';
  });

  // Handle analyze button click
  analyzeButton.addEventListener('click', async () => {
    const asin = getAsin();
    if (!asin) {
        alert("Sorry, couldn't find the product ID. Please make sure you're on a product page.");
        return;
    }

    try {
        // Show loading state
        popup.classList.add('showing-results');
        initialView.style.display = 'none';
        analysisContent.style.display = 'block';
        loadingSpinner.style.display = 'flex';  // Changed to flex
        results.style.display = 'none';

        const response = await chrome.runtime.sendMessage({ type: 'ANALYZE_PRICE', asin });
        
        if (response && response.success && response.text) {
            // Hide loading, show results
            loadingSpinner.style.display = 'none';
            results.style.display = 'block';

            const headerEl = results.querySelector('.header-text');
            const subject1El = results.querySelector('.subject1-text');
            const subject2El = results.querySelector('.subject2-text');
            
            // Clean the text responses
            const subject1Text = response.text.subject1.replace('💡 Price Insight:', '').trim();
            const subject2Text = response.text.subject2.replace('🤔 Should You Buy Now?', '').trim();

            // Type the text
            await typeText(headerEl, response.text.header);
            await typeText(subject1El, subject1Text);
            await typeText(subject2El, subject2Text);

            // Handle GIF
            if (response.text.priceGrade) {
                const gifCategory = determineGifCategory(response.text.priceGrade);
                const gifUrl = getRandomGif(gifCategory);
                const gifContainer = results.querySelector('.gif-container');
                if (gifContainer) {
                    gifContainer.innerHTML = `<img src="${gifUrl}" alt="Price reaction" />`;
                }
            }
        } else {
            throw new Error('Invalid response format');
        }
    } catch (error) {
        console.error('Error during price analysis:', error);
        
        // Hide loading, show error state
        loadingSpinner.style.display = 'none';
        results.style.display = 'block';
        
        const headerEl = results.querySelector('.header-text');
        if (headerEl) {
            headerEl.textContent = 'Oops! Something went wrong. Please try again.';
        }

        // Clear other elements
        const subject1El = results.querySelector('.subject1-text');
        const subject2El = results.querySelector('.subject2-text');
        const gifContainer = results.querySelector('.gif-container');
        
        if (subject1El) subject1El.textContent = '';
        if (subject2El) subject2El.textContent = '';
        if (gifContainer) gifContainer.innerHTML = '';
    }
});

// In your close button handler, remove the class
closeButton.addEventListener('click', () => {
  popup.classList.remove('showing-results');
  popup.style.display = 'none';
});

  // Close popup when clicking outside
  window.addEventListener('click', (event) => {
    if (!popup.contains(event.target) && event.target !== fab) {
      popup.style.display = 'none';
    }
  });
}

// Start the extension
init();