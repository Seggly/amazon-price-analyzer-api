// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ANALYZE_PRICE') {
    analyzePrice(request.asin, request.domain)
      .then(sendResponse)
      .catch(error => {
        console.error('Analysis error:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'An error occurred during analysis',
          details: error.toString()
        });
      });
    return true; // Keep message channel open for async response
  }
});

async function analyzePrice(asin, domain) {
  try {
    // First API call - Keepa Analysis
    const analysisResponse = await fetch('https://amazon-price-analyzer-api.vercel.app/api/test-keepa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        asin,
        domain 
      })
    });
    
    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      throw new Error(`Keepa API error: ${analysisResponse.status} - ${errorText}`);
    }
    
    const analysisData = await analysisResponse.json();
    if (!analysisData.success) {
      throw new Error(analysisData.error || 'Failed to analyze price');
    }
    
    // Second API call - Text Generation
    const textResponse = await fetch('https://amazon-price-analyzer-api.vercel.app/api/generate-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        analysis: analysisData.analysis,
        marketplace: {
          domain: domain
        }
      })
    });
    
    if (!textResponse.ok) {
      throw new Error(`Text generation API error: ${textResponse.status}`);
    }
    
    const textData = await textResponse.json();
    if (!textData.success) {
      throw new Error(textData.error || 'Failed to generate text');
    }
    
    return {
      success: true,
      text: textData.text,
      analysis: analysisData.analysis
    };
  } catch (error) {
    console.error('Analysis failed:', error);
    throw error;
  }
}

// Add this helper function
function convertToKeepaDomain(domain) {
  const domainMap = {
    'amazon.com': 1,
    'amazon.co.uk': 2,
    'amazon.de': 3,
    'amazon.fr': 4,
    'amazon.co.jp': 5,
    'amazon.ca': 6,
    'amazon.it': 8,
    'amazon.es': 9,
    'amazon.in': 10,
    'amazon.com.br': 11,
    'amazon.com.mx': 12,
    'amazon.com.au': 13,
    'amazon.nl': 14,
    'amazon.tr': 15,
    'amazon.ae': 16,
    'amazon.pl': 17,
    'amazon.se': 18,
    'amazon.sg': 19,
    'amazon.sa': 20,
    'amazon.be': 21
  };
  return domainMap[domain] || 1; // Default to US (1) if domain not found
}