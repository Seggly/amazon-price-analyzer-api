import cors from 'cors';

function initMiddleware(middleware) {
  return (req, res) =>
    new Promise((resolve, reject) => {
      middleware(req, res, (result) => {
        if (result instanceof Error) {
          return reject(result);
        }
        return resolve(result);
      });
    });
}

const corsMiddleware = initMiddleware(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

function convertKeepaTime(keepaMinutes) {
  return (keepaMinutes + 21564000) * 60000;
}

function processKeepaData(rawData) {
  const csvData = rawData.products[0].csv;
  const processedData = {
    amazon: processTimeSeries(csvData[0]), // AMAZON price history
    new: processTimeSeries(csvData[1]),    // NEW price history
    used: processTimeSeries(csvData[2]),   // USED price history
    fba: processTimeSeries(csvData[11]),   // NEW FBA price history
  };

  // Get last 90 days of data
  const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
  
  // Process each category
  const analysis = {};
  for (const [category, data] of Object.entries(processedData)) {
    const recentData = data.filter(point => point.timestamp >= ninetyDaysAgo);
    
    if (recentData.length > 0) {
      analysis[category] = {
        currentPrice: recentData[recentData.length - 1].price,
        lowestPrice: Math.min(...recentData.map(p => p.price)),
        highestPrice: Math.max(...recentData.map(p => p.price)),
        averagePrice: calculateAverage(recentData.map(p => p.price)),
        pricePoints: recentData.length,
        priceChanges: countPriceChanges(recentData),
        mostFrequentPrice: findMostFrequentPrice(recentData),
        priceRange: calculatePriceRange(recentData)
      };
    }
  }

  return {
    summary: analysis,
    rawProcessed: processedData
  };
}

function processTimeSeries(data) {
  if (!data || !Array.isArray(data)) return [];
  
  const processed = [];
  for (let i = 0; i < data.length; i += 2) {
    const timestamp = convertKeepaTime(data[i]);
    const price = data[i + 1];
    
    // Skip invalid prices
    if (price === -1) continue;
    
    processed.push({
      timestamp: timestamp,
      date: new Date(timestamp).toISOString(),
      price: price / 100 // Convert cents to dollars
    });
  }
  
  return processed.sort((a, b) => a.timestamp - b.timestamp);
}

function calculateAverage(prices) {
  return prices.length > 0 
    ? Math.round((prices.reduce((sum, price) => sum + price, 0) / prices.length) * 100) / 100
    : 0;
}

function countPriceChanges(data) {
  let changes = 0;
  for (let i = 1; i < data.length; i++) {
    if (Math.abs(data[i].price - data[i-1].price) > 0.01) {
      changes++;
    }
  }
  return changes;
}

function findMostFrequentPrice(data) {
  const priceFrequency = {};
  let maxFrequency = 0;
  let mostFrequentPrice = null;

  data.forEach(point => {
    const roundedPrice = Math.round(point.price * 100) / 100;
    priceFrequency[roundedPrice] = (priceFrequency[roundedPrice] || 0) + 1;
    
    if (priceFrequency[roundedPrice] > maxFrequency) {
      maxFrequency = priceFrequency[roundedPrice];
      mostFrequentPrice = roundedPrice;
    }
  });

  return {
    price: mostFrequentPrice,
    frequency: maxFrequency
  };
}

function calculatePriceRange(data) {
  if (data.length === 0) return { min: 0, max: 0, range: 0 };
  
  const prices = data.map(p => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  
  return {
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    range: Math.round((max - min) * 100) / 100
  };
}

export default async function handler(req, res) {
  await corsMiddleware(req, res);

  if (req.method === 'POST') {
    try {
      const { asin } = req.body;
      
      // Fetch data from Keepa
      const keepaApiKey = process.env.KEEPA_API_KEY;
      const response = await fetch(`https://api.keepa.com/product?key=${keepaApiKey}&domain=1&asin=${asin}`);
      const keepaData = await response.json();
      
      // Process the data
      const processedData = processKeepaData(keepaData);
      
      // Return both raw and processed data for validation
      res.status(200).json({
        success: true,
        asin: asin,
        analysis: processedData.summary,
        rawData: {
          keepaResponse: keepaData,
          processedTimeSeries: processedData.rawProcessed
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}