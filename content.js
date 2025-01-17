// Global variables
let currentAnalysis = null;
let currentAsin = null;
let elements = null;
let analysisCache = new Map();

// Basic Utility Functions
function clearAnalysis() {
    currentAnalysis = null;
    if (elements) {
        elements.initialView.style.display = 'block';
        elements.analysisContent.style.display = 'none';
        elements.results.style.display = 'none';
        elements.popup.classList.remove('showing-results');
    }
}

// ASIN Extraction
function getAsin() {
    const patterns = [
        /\/dp\/([A-Z0-9]{10})/,
        /\/product\/([A-Z0-9]{10})/,
        /\/gp\/product\/([A-Z0-9]{10})/,
        /\/?([A-Z0-9]{10})(\/|\?|$)/
    ];

    for (const pattern of patterns) {
        const match = window.location.pathname.match(pattern);
        if (match && match[1]) return match[1];
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

// Variation Changes Watcher
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

    document.addEventListener('click', (event) => {
        const variationElement = event.target.closest('[data-defaultasin], [data-dp-url], .swatchSelect');
        if (variationElement) {
            setTimeout(() => {
                const newAsin = getAsin();
                if (newAsin !== currentAsin) {
                    currentAsin = newAsin;
                    currentAnalysis = null;
                    clearAnalysis();
                }
            }, 100);
        }
    });

    urlObserver.observe(document, { subtree: true, childList: true });
}

// Cache Management Functions
async function initializeCache() {
    try {
        const data = await chrome.storage.local.get(null);
        const now = Date.now();
        
        for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('price_analysis_')) {
                const timeDiff = now - value.timestamp;
                if (timeDiff <= 20 * 60 * 1000) {
                    // Still valid, add to memory cache
                    const asin = key.replace('price_analysis_', '');
                    analysisCache.set(asin, value);
                } else {
                    // Expired, remove it
                    await chrome.storage.local.remove(key);
                }
            }
        }
    } catch (error) {
        console.error('Error initializing cache:', error);
    }
}

async function cacheAnalysis(asin, analysis) {
    try {
        const timestamp = Date.now();
        const cacheData = {
            analysis,
            timestamp
        };
        
        // Save to both storage and memory
        await chrome.storage.local.set({
            [`price_analysis_${asin}`]: cacheData
        });
        analysisCache.set(asin, cacheData);
    } catch (error) {
        console.error('Error caching analysis:', error);
    }
}

async function getAnalysisFromCache(asin) {
    try {
        // Try memory cache first
        const memoryCache = analysisCache.get(asin);
        if (memoryCache) {
            const timeDiff = Date.now() - memoryCache.timestamp;
            if (timeDiff <= 20 * 60 * 1000) {
                return memoryCache.analysis;
            }
            // Expired, clean up
            analysisCache.delete(asin);
            await chrome.storage.local.remove(`price_analysis_${asin}`);
            return null;
        }

        // Try storage cache if not in memory
        const result = await chrome.storage.local.get(`price_analysis_${asin}`);
        const storedCache = result[`price_analysis_${asin}`];
        
        if (storedCache) {
            const timeDiff = Date.now() - storedCache.timestamp;
            if (timeDiff <= 20 * 60 * 1000) {
                // Still valid, add to memory cache
                analysisCache.set(asin, storedCache);
                return storedCache.analysis;
            }
            // Expired, clean up
            await chrome.storage.local.remove(`price_analysis_${asin}`);
        }
        
        return null;
    } catch (error) {
        console.error('Error getting cached analysis:', error);
        return null;
    }
}

// UI Creation and Text Handling
function createUI() {
    const container = document.createElement('div');
    container.id = 'amazon-price-analyzer-container';
    
    const fab = document.createElement('button');
    fab.id = 'price-analyzer-fab';
    fab.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="Price Analyzer" />`;
    fab.style.zIndex = '999999';  

    const fabImg = fab.querySelector('img');
    if (fabImg) {
        fabImg.style.pointerEvents = 'none';
    }

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
                        <button class="track-button">Price Tracking Coming Soon</button>
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

function fitTextToContainer(subject1El, subject1Container, subject2El, subject2Container) {
    if (!subject1El || !subject1Container || !subject2El || !subject2Container) return;

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
        return fontSize - 1;
    };

    const size1 = findMaxFontSize(subject1El, subject1Container);
    const size2 = findMaxFontSize(subject2El, subject2Container);
    const finalSize = Math.min(size1, size2);

    subject1El.style.fontSize = `${finalSize}px`;
    subject2El.style.fontSize = `${finalSize}px`;
    subject1El.style.lineHeight = '1.3';
    subject2El.style.lineHeight = '1.3';
}

function showLoadingState() {
    elements.popup.classList.add('showing-results');
    elements.initialView.style.display = 'none';
    elements.analysisContent.style.display = 'block';
    elements.loadingSpinner.style.display = 'flex';
    elements.results.style.display = 'none';
}

function showInitialState() {
    elements.popup.classList.remove('showing-results');
    elements.initialView.style.display = 'block';
    elements.analysisContent.style.display = 'none';
    elements.results.style.display = 'none';
}

// Results Display Functions
function showResults(analysisData) {
    const headerEl = elements.results.querySelector('.header-text');
    const subject1El = elements.results.querySelector('.subject1-text');
    const subject2El = elements.results.querySelector('.subject2-text');
    
    // Display text content
    headerEl.textContent = analysisData.text.header;
    subject1El.textContent = analysisData.text.subject1.replace(/💡\s*Price Insight:\s*/g, '').trim();
    subject2El.textContent = analysisData.text.subject2.replace(/🤔\s*Should You Buy Now\?\s*/g, '').trim();
    
    // Handle text fitting
    const subject1Container = subject1El.closest('.text-fit-container');
    const subject2Container = subject2El.closest('.text-fit-container');
    requestAnimationFrame(() => {
        fitTextToContainer(subject1El, subject1Container, subject2El, subject2Container);
    });

    // Handle animations and GIF
    const priceGrade = analysisData.text.priceGrade || 'average';
    if (['excellent', 'good', 'average'].includes(priceGrade.toLowerCase())) {
        createConfettiAnimation(priceGrade);
    }
    
    showReactionGif(priceGrade);
}

// Animation & GIF Functions
function getConfettiColors(priceGrade) {
    const colorMap = {
        excellent: [[255, 215, 0], [144, 238, 144], [152, 251, 152]], // Gold and greens
        good: [[135, 206, 235], [144, 238, 144], [255, 255, 255]], // Blue and light green
        average: [[255, 182, 193], [135, 206, 235], [255, 255, 255]] // Light colors
    };
    return colorMap[priceGrade.toLowerCase()] || null;
}

function createConfettiAnimation(priceGrade) {
    const colors = getConfettiColors(priceGrade);
    if (!colors) return;

    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '1000'
    });

    const popup = document.querySelector('#price-analyzer-popup');
    if (!popup) return;
    
    popup.appendChild(canvas);
    canvas.width = popup.clientWidth;
    canvas.height = popup.clientHeight;
    
    const ctx = canvas.getContext('2d');
    const particles = createParticles(canvas.width, canvas.height, colors);
    animateParticles(ctx, canvas, particles);
}

function createParticles(width, height, colors) {
    return Array.from({ length: 150 }, () => ({
        x: width * 0.5,
        y: height * 0.3,
        radius: Math.random() * 3 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        velocity: 8 + Math.random() * 6,
        angle: Math.random() * Math.PI * 2,
        gravity: 0.2,
        drag: 0.96,
        opacity: 1
    }));
}

function animateParticles(ctx, canvas, particles) {
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (const p of particles) {
            p.x += Math.cos(p.angle) * p.velocity;
            p.y += Math.sin(p.angle) * p.velocity + p.gravity;
            p.velocity *= p.drag;
            p.opacity -= 0.02;

            if (p.opacity > 0) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2, false);
                ctx.fillStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${p.opacity})`;
                ctx.fill();
            }
        }

        particles = particles.filter(p => p.opacity > 0);

        if (particles.length > 0) {
            requestAnimationFrame(animate);
        } else {
            canvas.remove();
        }
    }

    animate();
}

function showReactionGif(priceGrade) {
    const category = determineGifCategory(priceGrade);
    const gifUrl = getRandomGif(category);
    const gifContainer = elements.results.querySelector('.gif-container');
    
    if (!gifContainer) return;

    const img = new Image();
    Object.assign(img, {
        src: gifUrl,
        alt: "Price reaction",
        style: {
            maxHeight: "140px",
            width: "auto",
            borderRadius: "8px",
            objectFit: "contain"
        }
    });
    
    gifContainer.innerHTML = '';
    gifContainer.appendChild(img);
}

function determineGifCategory(priceGrade) {
    const categories = {
        excellent: 'excellent-price',
        good: 'good-price',
        average: 'average-price',
        'not-good': 'not-good-price',
        'bad-price': 'bad-price'
    };
    return categories[priceGrade.toLowerCase()] || 'average-price';
}

function getRandomGif(category) {
    try {
        const maxGifs = 10;
        const randomNumber = Math.floor(Math.random() * maxGifs) + 1;
        return chrome.runtime.getURL(`gifs/${category}/${randomNumber}.gif`);
    } catch (error) {
        console.error('Error generating GIF URL:', error);
        return chrome.runtime.getURL('gifs/default.gif');
    }
}
// Event Handler Functions
async function handleAnalyzeButtonClick() {
    const asin = getAsin();
    currentAsin = asin;
    const domain = window.MarketplaceUtils.getCurrentDomain();

    if (!asin) {
        alert("Sorry, couldn't find the product ID. Please make sure you're on a product page.");
        return;
    }

    try {
        showLoadingState();
        const response = await chrome.runtime.sendMessage({ 
            type: 'ANALYZE_PRICE', 
            asin,
            domain
        });
        
        if (response && response.success && response.text) {
            currentAnalysis = response;
            await cacheAnalysis(asin, response);

            elements.loadingSpinner.style.display = 'none';
            elements.results.style.display = 'block';
            showResults(response);
        }
    } catch (error) {
        console.error('Error during price analysis:', error);
        currentAnalysis = null;
        elements.loadingSpinner.style.display = 'none';
        elements.results.style.display = 'block';
        showError();
    }
}

async function handleFabClick() {
    if (elements.popup.style.display === 'block') {
        elements.popup.style.display = 'none';
        return;
    }

    const currentAsin = getAsin();    
    elements.popup.style.display = 'block';
    
    try {
        const cachedAnalysis = await getAnalysisFromCache(currentAsin);
        if (cachedAnalysis && cachedAnalysis.text) {
            elements.popup.classList.add('showing-results');
            elements.initialView.style.display = 'none';
            elements.analysisContent.style.display = 'block';
            elements.results.style.display = 'block';
            elements.loadingSpinner.style.display = 'none';
            showResults(cachedAnalysis);
        } else {
            showInitialState();
        }
    } catch (error) {
        console.error('Error retrieving cache:', error);
        showInitialState();
    }
}

function showError() {
    const headerEl = elements.results.querySelector('.header-text');
    const subject1El = elements.results.querySelector('.subject1-text');
    const subject2El = elements.results.querySelector('.subject2-text');
    const gifContainer = elements.results.querySelector('.gif-container');
    
    if (headerEl) headerEl.textContent = 'Oops! Something went wrong. Please try again.';
    if (subject1El) subject1El.textContent = '';
    if (subject2El) subject2El.textContent = '';
    if (gifContainer) gifContainer.innerHTML = '';
}

// Main Initialization
async function init() {
    try {
        await initializeCache();
        const { fab, popup } = createUI();

        // Initialize elements
        elements = {
            fab,
            popup,
            closeButton: popup.querySelector('.close-button'),
            analyzeButton: popup.querySelector('.analyze-button'),
            initialView: popup.querySelector('.initial-view'),
            analysisContent: popup.querySelector('.analysis-content'),
            loadingSpinner: popup.querySelector('.loading-spinner'),
            results: popup.querySelector('.results')
        };

        // Add event listeners
        elements.fab.addEventListener('click', handleFabClick);
        elements.analyzeButton.addEventListener('click', handleAnalyzeButtonClick);
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
    } catch (error) {
        console.error('Error initializing extension:', error);
    }
}

// Start the extension based on marketplace support
const currentDomain = window.MarketplaceUtils.getCurrentDomain();
if (!currentDomain) {
    console.error('Unsupported Amazon marketplace');
} else {
    init();
}