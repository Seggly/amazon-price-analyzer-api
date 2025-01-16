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

let analysisCache = new Map();

// Add this function with your other utility functions
function cacheAnalysis(asin, analysis) {
    const timestamp = Date.now();
    analysisCache.set(asin, {
        analysis,
        timestamp
    });
}

function getAnalysisFromCache(asin) {
    const cached = analysisCache.get(asin);
    if (!cached) return null;

    const timeDiff = Date.now() - cached.timestamp;
    if (timeDiff > 20 * 60 * 1000) { // 20 minutes
        analysisCache.delete(asin);
        return null;
    }

    return cached.analysis;
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
    <div class="title"><strong>💡 Price Insight:</strong></div>
    <div class="text-fit-container">
      <p class="subject1-text"></p>
    </div>
  </div>

  <div class="buy-section">
    <div class="title"><strong>🤔 Should You Buy Now?</strong></div>
    <div class="text-fit-container">
      <p class="subject2-text"></p>
    </div>
  </div>
</div>

          <div class="results-footer">
            <div class="gif-container"></div>
            <button class="track-button">Price Tracking Comming Soon</button>
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

function watchForVariationChanges() {
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
      const newAsin = getAsin();
      if (location.href !== lastUrl && newAsin !== currentAsin) {
          lastUrl = location.href;
          currentAsin = newAsin;
          currentAnalysis = null;
          clearAnalysis();
      }
  });

  // Watch specifically for clicks on variation buttons, not hovers
  document.addEventListener('click', (event) => {
      // Check if clicked element is a variation button/swatch
      const variationElement = event.target.closest('[data-defaultasin], [data-dp-url], .swatchSelect');
      if (variationElement) {
          setTimeout(() => {  // Give Amazon time to update the ASIN
              const newAsin = getAsin();
              if (newAsin !== currentAsin) {
                  currentAsin = newAsin;
                  currentAnalysis = null;
                  clearAnalysis();
              }
          }, 100);
      }
  });

  // Set up observers
  urlObserver.observe(document, { subtree: true, childList: true });
}

function fitTextToContainer(subject1El, subject1Container, subject2El, subject2Container) {
  if (!subject1El || !subject1Container || !subject2El || !subject2Container) return;

  // Function to find max possible font size for one container
  const findMaxFontSize = (element, container) => {
      let fontSize = 10;
      element.style.fontSize = `${fontSize}px`;
      element.style.lineHeight = '1.3';

      while (fontSize < 100 &&
             element.scrollHeight <= container.clientHeight &&
             element.scrollWidth <= container.clientWidth) {
          fontSize++;
          element.style.fontSize = `${fontSize}px`;
      }
      return fontSize - 1; // Step back one size
  };

  // Find max font size for each container
  const size1 = findMaxFontSize(subject1El, subject1Container);
  const size2 = findMaxFontSize(subject2El, subject2Container);

  // Use the smaller of the two sizes
  const finalSize = Math.min(size1, size2);

  // Apply the same font size to both elements
  subject1El.style.fontSize = `${finalSize}px`;
  subject2El.style.fontSize = `${finalSize}px`;
  subject1El.style.lineHeight = '1.3';
  subject2El.style.lineHeight = '1.3';

  console.log('Final font size for both sections:', finalSize);
}

function init() {
  const { fab, popup } = createUI();
  
  // Load confetti script securely
  const confettiScript = document.createElement('script');
  confettiScript.src = chrome.runtime.getURL('lib/confetti.js');
  confettiScript.onload = () => {
    console.log('Confetti script loaded successfully');
  };
  document.head.appendChild(confettiScript);

  function getConfettiColors(priceGrade) {
    switch(priceGrade.toLowerCase()) {
      case 'excellent':
        return ['#FFD700', '#90EE90', '#98FB98'];
      case 'good':
        return ['#87CEEB', '#90EE90', '#FFFFFF'];
      case 'average':
        return ['#FFB6C1', '#87CEEB', '#FFFFFF'];
      default:
        return null;
    }
  }

  function createConfettiAnimation(priceGrade) {
    const colors = getConfettiColors(priceGrade);
    if (!colors || typeof confetti === 'undefined') return;

    // Create a canvas element for the confetti
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '1000';

    // Add canvas to the popup
    const popup = document.querySelector('#price-analyzer-popup');
    popup.appendChild(canvas);

    // Create a new confetti instance for this canvas
    const myConfetti = confetti.create(canvas, {
        resize: true,
        useWorker: true
    });

    // Initial burst
    myConfetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: colors,
        startVelocity: 30
    });

    // Follow-up bursts
    setTimeout(() => {
        myConfetti({
            particleCount: 50,
            spread: 45,
            origin: { y: 0.6 },
            colors: colors,
            startVelocity: 25
        });
    }, 250);

    setTimeout(() => {
        myConfetti({
            particleCount: 30,
            spread: 35,
            origin: { y: 0.6 },
            colors: colors,
            startVelocity: 20
        });
    }, 400);

    // Remove canvas after animation
    setTimeout(() => {
        canvas.remove();
    }, 2000);
  }

  // Store all elements in our global elements object
  elements = {
    fab: fab,
    popup: popup,
    closeButton: popup.querySelector('.close-button'),
    analyzeButton: popup.querySelector('.analyze-button'),
    initialView: popup.querySelector('.initial-view'),
    analysisContent: popup.querySelector('.analysis-content'),
    loadingSpinner: popup.querySelector('.loading-spinner'),
    results: popup.querySelector('.results')
  };

  // FAB click handler
  elements.fab.addEventListener('click', () => {
    const currentAsin = getAsin();
    elements.popup.style.display = 'block';
    
    const cachedAnalysis = getAnalysisFromCache(currentAsin);
    if (cachedAnalysis) {
        currentAnalysis = cachedAnalysis;
        elements.popup.classList.add('showing-results');
        elements.initialView.style.display = 'none';
        elements.analysisContent.style.display = 'block';
        elements.results.style.display = 'block';
        elements.loadingSpinner.style.display = 'none';
        
        const headerEl = elements.results.querySelector('.header-text');
        const subject1El = elements.results.querySelector('.subject1-text');
        const subject2El = elements.results.querySelector('.subject2-text');
        
        headerEl.textContent = cachedAnalysis.text.header;
        subject1El.textContent = cachedAnalysis.text.subject1.replace(/💡\s*Price Insight:\s*/g, '').trim();
        subject2El.textContent = cachedAnalysis.text.subject2.replace(/🤔\s*Should You Buy Now\?\s*/g, '').trim();
        
        const subject1Container = subject1El.closest('.text-fit-container');
        const subject2Container = subject2El.closest('.text-fit-container');
        
        requestAnimationFrame(() => {
            fitTextToContainer(subject1El, subject1Container, subject2El, subject2Container);
        });

        // Show confetti for cached results if appropriate
        const priceGrade = cachedAnalysis.text.priceGrade || 'average';
        if (['excellent', 'good', 'average'].includes(priceGrade.toLowerCase())) {
            createConfettiAnimation(priceGrade);
        }
        
        const gifCategory = determineGifCategory(priceGrade);
        const gifUrl = getRandomGif(gifCategory);
        const gifContainer = elements.results.querySelector('.gif-container');
        if (gifContainer) {
            const img = new Image();
            img.src = gifUrl;
            img.alt = "Price reaction";
            img.style.maxHeight = "140px";
            img.style.width = "auto";
            img.style.borderRadius = "8px";
            img.style.objectFit = "contain";
            
            setTimeout(() => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                const ratio = img.naturalWidth / img.naturalHeight;
                const targetHeight = 140;
                const targetWidth = targetHeight * ratio;
                
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                
                const staticImg = new Image();
                staticImg.src = canvas.toDataURL('image/png');
                staticImg.style.maxHeight = "140px";
                staticImg.style.width = "auto";
                staticImg.style.borderRadius = "8px";
                staticImg.style.objectFit = "contain";
                
                gifContainer.innerHTML = '';
                gifContainer.appendChild(staticImg);
            }, 4000);
            
            gifContainer.innerHTML = '';
            gifContainer.appendChild(img);
        }
    } else {
        elements.popup.classList.remove('showing-results');
        elements.initialView.style.display = 'block';
        elements.analysisContent.style.display = 'none';
        elements.results.style.display = 'none';
    }
  });

  // Analyze button click handler
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
        cacheAnalysis(asin, response);

        elements.loadingSpinner.style.display = 'none';
        elements.results.style.display = 'block';

        const headerEl = elements.results.querySelector('.header-text');
        const subject1El = elements.results.querySelector('.subject1-text');
        const subject2El = elements.results.querySelector('.subject2-text');
        
        headerEl.textContent = response.text.header;
        subject1El.textContent = response.text.subject1.replace(/💡\s*Price Insight:\s*/g, '').trim();
        subject2El.textContent = response.text.subject2.replace(/🤔\s*Should You Buy Now\?\s*/g, '').trim();

        const subject1Container = subject1El.closest('.text-fit-container');
        const subject2Container = subject2El.closest('.text-fit-container');

        requestAnimationFrame(() => {
          fitTextToContainer(subject1El, subject1Container, subject2El, subject2Container);
        });

        const priceGrade = response.text.priceGrade || 'average';
        
        // Trigger confetti for positive price grades
        if (['excellent', 'good', 'average'].includes(priceGrade.toLowerCase())) {
          createConfettiAnimation(priceGrade);
        }

        const gifCategory = determineGifCategory(priceGrade);
        const gifUrl = getRandomGif(gifCategory);
        const gifContainer = elements.results.querySelector('.gif-container');
        if (gifContainer) {
          const img = new Image();
          img.src = gifUrl;
          img.alt = "Price reaction";
          img.style.maxHeight = "140px";
          img.style.width = "auto";
          img.style.borderRadius = "8px";
          img.style.objectFit = "contain";
          
          setTimeout(() => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              const ratio = img.naturalWidth / img.naturalHeight;
              const targetHeight = 140;
              const targetWidth = targetHeight * ratio;
              
              canvas.width = targetWidth;
              canvas.height = targetHeight;
              
              ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
              
              const staticImg = new Image();
              staticImg.src = canvas.toDataURL('image/png');
              staticImg.style.maxHeight = "140px";
              staticImg.style.width = "auto";
              staticImg.style.borderRadius = "8px";
              staticImg.style.objectFit = "contain";
              
              gifContainer.innerHTML = '';
              gifContainer.appendChild(staticImg);
          }, 4000);
          
          gifContainer.innerHTML = '';
          gifContainer.appendChild(img);
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

  // Close button click handler
  elements.closeButton.addEventListener('click', () => {
    elements.popup.style.display = 'none';
  });

  // Outside click handler
  window.addEventListener('click', (event) => {
    if (!elements.popup.contains(event.target) && event.target !== elements.fab) {
      elements.popup.style.display = 'none';
    }
  });

  // Initialize variation change watcher
  watchForVariationChanges();
}

// Start the extension
init();