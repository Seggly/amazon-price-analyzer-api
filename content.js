// Store last analysis result
let lastAnalysisResult = null;

// Create and inject the UI container
function createUI() {
    const container = document.createElement('div');
    container.id = 'amazon-price-analyzer-container';
    
    // Create the FAB
    const fab = document.createElement('button');
    fab.id = 'price-analyzer-fab';
    fab.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="Price Analyzer" />`;
    
    // Create the popup
    const popup = document.createElement('div');
    popup.id = 'price-analyzer-popup';
    popup.style.display = 'none';
    popup.innerHTML = `
      <div class="popup-content">
        <button class="close-button">✕</button>
        
        <!-- Initial View -->
        <div class="initial-view">
          <div class="mascot">
            <img src="${chrome.runtime.getURL('icons/icon128.png')}" alt="Mascot" />
          </div>
          <h2>Don't Buy Until Our AI<br>Check The Price First!</h2>
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
            <h2 class="header-text"></h2>
            <div class="insight-section">
              <span class="emoji">💡</span>
              <h3>Price Insight:</h3>
              <p class="subject1-text"></p>
            </div>
            <div class="buy-section">
              <span class="emoji">🤔</span>
              <h3>Should You Buy Now?</h3>
              <p class="subject2-text"></p>
            </div>
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

    console.log('Current URL:', window.location.href);
    console.log('Current pathname:', window.location.pathname);
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

// Trigger confetti effect
function triggerConfetti() {
    const colors = ['#FF6100', '#FFE4D6', '#4CAF50', '#FFC107'];
    const confettiCount = 100;

    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.width = Math.random() * 10 + 5 + 'px';
        confetti.style.height = confetti.style.width;
        confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
        document.body.appendChild(confetti);

        setTimeout(() => confetti.remove(), 2000);
    }
}

// Set GIF based on conclusion
function setGifForConclusion(conclusionText) {
    const gifContainer = document.querySelector('.gif-container');
    let gifUrl = '';

    conclusionText = conclusionText.toLowerCase();
    if (conclusionText.includes('excellent') || conclusionText.includes('great deal')) {
        gifUrl = 'excellent-price.gif';
    } else if (conclusionText.includes('good')) {
        gifUrl = 'good-price.gif';
    } else if (conclusionText.includes('average')) {
        gifUrl = 'average-price.gif';
    } else if (conclusionText.includes('not so good')) {
        gifUrl = 'not-good-price.gif';
    } else {
        gifUrl = 'bad-price.gif';
    }

    gifContainer.innerHTML = `<img src="${chrome.runtime.getURL('gifs/' + gifUrl)}" alt="Price reaction">`;
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
    const trackButton = popup.querySelector('.track-button');

    // Handle FAB click
    fab.addEventListener('click', () => {
        popup.style.display = 'block';
        
        if (lastAnalysisResult) {
            initialView.style.display = 'none';
            analysisContent.style.display = 'block';
            loadingSpinner.style.display = 'none';
            results.style.display = 'block';
            
            const headerEl = results.querySelector('.header-text');
            const subject1El = results.querySelector('.subject1-text');
            const subject2El = results.querySelector('.subject2-text');
            
            headerEl.textContent = lastAnalysisResult.text.header;
            subject1El.textContent = lastAnalysisResult.text.subject1;
            subject2El.textContent = lastAnalysisResult.text.subject2;
            
            setGifForConclusion(lastAnalysisResult.text.header);
        } else {
            initialView.style.display = 'block';
            analysisContent.style.display = 'none';
        }
    });

    // Handle analyze button click
    analyzeButton.addEventListener('click', async () => {
        const asin = getAsin();
        if (!asin) {
            alert("Sorry, couldn't find the product ID. Please make sure you're on a product page.");
            return;
        }

        initialView.style.display = 'none';
        analysisContent.style.display = 'block';
        loadingSpinner.style.display = 'block';
        results.style.display = 'none';

        try {
            const response = await chrome.runtime.sendMessage({ type: 'ANALYZE_PRICE', asin });
            
            if (response.success) {
                lastAnalysisResult = response;
                loadingSpinner.style.display = 'none';
                results.style.display = 'block';

                const headerEl = results.querySelector('.header-text');
                const subject1El = results.querySelector('.subject1-text');
                const subject2El = results.querySelector('.subject2-text');

                await typeText(headerEl, response.text.header);
                await typeText(subject1El, response.text.subject1);
                await typeText(subject2El, response.text.subject2);

                setGifForConclusion(response.text.header);

                if (['excellent', 'good', 'average'].some(term => 
                    response.text.header.toLowerCase().includes(term))) {
                    triggerConfetti();
                }
            }
        } catch (error) {
            console.error('Error during price analysis:', error);
            loadingSpinner.style.display = 'none';
            results.style.display = 'block';
            results.querySelector('.header-text').textContent = 'Oops! Something went wrong. Please try again.';
        }
    });

    // Handle close button click
    closeButton.addEventListener('click', () => {
        popup.style.display = 'none';
    });

    // Close popup when clicking outside
    window.addEventListener('click', (event) => {
        if (!popup.contains(event.target) && event.target !== fab) {
            popup.style.display = 'none';
        }
    });

    // Handle track button click
    trackButton.addEventListener('click', () => {
        // Implement price tracking functionality
        console.log('Track price clicked');
    });
}

// Start the extension
init();