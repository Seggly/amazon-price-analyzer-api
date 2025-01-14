chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ANALYZE_PRICE') {
      analyzePrice(request.asin)
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
  
  async function analyzePrice(asin) {
    try {
      // First API call - Keepa Analysis
      const analysisResponse = await fetch('https://amazon-price-analyzer-api.vercel.app/api/test-keepa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asin })
      });
      
      if (!analysisResponse.ok) {
        throw new Error(`Keepa API error: ${analysisResponse.status}`);
      }
      
      const analysisData = await analysisResponse.json();
      if (!analysisData.success) {
        throw new Error(analysisData.error || 'Failed to analyze price');
      }
      
      // Second API call - Text Generation
      const textResponse = await fetch('https://amazon-price-analyzer-api.vercel.app/api/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis: analysisData.analysis })
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
        analysis: analysisData.analysis // Include this for potential future use
      };
    } catch (error) {
      console.error('Analysis failed:', error);
      throw error;
    }
  }