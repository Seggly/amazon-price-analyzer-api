// Create and inject the UI container
function createUI() {
    const container = document.createElement('div');
    container.id = 'amazon-price-analyzer-container';
    
    // Create the FAB
    const fab = document.createElement('button');
    fab.id = 'price-analyzer-fab';
    fab.innerHTML = `
      <span class="fab-icon">$</span>
    `;
    
    // Create the popup
    const popup = document.createElement('div');
    popup.id = 'price-analyzer-popup';
    popup.style.display = 'none';
    popup.innerHTML = `
      <div class="popup-content">
        <button class="close-button">×</button>
        <div class="analysis-content">
          <div class="loading-spinner" style="display: none;">
            <div class="spinner"></div>
            <p>Analyzing price history...</p>
          </div>
          <div class="results" style="display: none;">
            <h2 class="header-text"></h2>
            <p class="subject1-text"></p>
            <p class="subject2-text"></p>
            <div class="gif-container"></div>
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
    const match = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
    return match ? match[1] : null;
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
    const colors = ['#ff0000', '#00ff00', '#0000ff'];
    
    for (let i = 0; i < 100; i++) {
      const particle = document.createElement('div');
      particle.className = 'confetti';
      particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      particle.style.left = Math.random() * 100 + 'vw';
      document.body.appendChild(particle);
      
      setTimeout(() => particle.remove(), 2000);
    }
  }
  // Add this function after triggerConfetti() and before init()
function showError(message) {
    const results = document.querySelector('.results');
    const loadingSpinner = document.querySelector('.loading-spinner');
    const headerEl = results.querySelector('.header-text');
    
    loadingSpinner.style.display = 'none';
    results.style.display = 'block';
    
    headerEl.textContent = '❌ ' + message;
    headerEl.style.color = '#dc3545';
  }
  // Initialize the extension
  function init() {
    const { fab, popup } = createUI();
    const closeButton = popup.querySelector('.close-button');
    const loadingSpinner = popup.querySelector('.loading-spinner');
    const results = popup.querySelector('.results');
    
    // Handle FAB click
    fab.addEventListener('click', async () => {
      const asin = getAsin();
      if (!asin) {
        console.error('Could not find ASIN');
        return;
      }
      
      popup.style.display = 'block';
      loadingSpinner.style.display = 'block';
      results.style.display = 'none';
      
      try {
        // Send message to background script to start analysis
        chrome.runtime.sendMessage(
          { type: 'ANALYZE_PRICE', asin },
          async response => {
            if (response.success) {
              loadingSpinner.style.display = 'none';
              results.style.display = 'block';
              
              const headerEl = results.querySelector('.header-text');
              const subject1El = results.querySelector('.subject1-text');
              const subject2El = results.querySelector('.subject2-text');
              
              // Type out the text sequentially
              await typeText(headerEl, response.text.header);
              await typeText(subject1El, response.text.subject1);
              await typeText(subject2El, response.text.subject2);
              
              // Check if we should trigger confetti
              const goodPriceTerms = ['excellent', 'good', 'average'];
              if (goodPriceTerms.some(term => response.text.header.toLowerCase().includes(term))) {
                triggerConfetti();
              }
            } else {
              console.error('Analysis failed:', response.error);
            }
          }
        );
      } catch (error) {
        console.error('Error during price analysis:', error);
        showError('Sorry, something went wrong. Please try again.');
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
  }
  
  // Start the extension
  init();