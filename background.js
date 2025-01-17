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
    console.log('Processing request for:', { domain, asin });
    const keepaDomain = convertToKeepaDomain(domain);
    console.log('Converted domain:', { originalDomain: domain, keepaDomain });

    const keepaResponse = await fetch('https://amazon-price-analyzer-api.vercel.app/api/test-keepa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        asin,
        domain: keepaDomain
      })
    });
    
    console.log('Keepa API response status:', keepaResponse.status);
    
    if (!keepaResponse.ok) {
      const errorText = await keepaResponse.text();
      console.error('Keepa API error details:', {
        status: keepaResponse.status,
        statusText: keepaResponse.statusText,
        errorText
      });
      throw new Error(`Keepa API error: ${keepaResponse.status} - ${errorText}`);
    }
    
    const analysisData = await keepaResponse.json();
    console.log('Keepa analysis data:', analysisData); // Added this log

    if (!analysisData.success) {
      throw new Error(analysisData.error || 'Failed to analyze price');
    }
    
    // Log the data we're sending to text generation
    console.log('Sending to text generation:', { 
      analysis: analysisData.analysis,
      marketplace: { domain }
    });

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
      const errorText = await textResponse.text();
      console.error('Text generation error details:', {
        status: textResponse.status,
        errorText: await textResponse.text()
      });
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

function convertToKeepaDomain(domain) {
  console.log('Converting domain:', domain);
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
  const result = domainMap[domain] || 1;
  console.log(`Converted ${domain} to Keepa domain: ${result}`);
  return result;
}