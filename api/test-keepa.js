import cors from 'cors';

// Initialize CORS middleware
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

// Convert Keepa time to Unix timestamp
function convertKeepaTime(keepaMinutes) {
  return (keepaMinutes + 21564000) * 60000;
}
function processKeepaData(rawData) {
  const csvData = rawData.products[0].csv;

  // Get price data (prioritize Buy Box > Amazon > New)
  const buyBoxPrices = processTimeSeries(csvData[18]);
  const amazonPrices = processTimeSeries(csvData[0]);
  const newPrices = processTimeSeries(csvData[1]);

  const priceData = buyBoxPrices.length > 0 ? buyBoxPrices : 
                   amazonPrices.length > 0 ? amazonPrices : 
                   newPrices;

  // Get last 90 days data only
  const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
  const data = priceData.filter(point => point.timestamp >= ninetyDaysAgo);

  if (data.length === 0) return { analysis: null };

  const currentPrice = data[data.length - 1].price;
  const lowestPrice = Math.min(...data.map(p => p.price));
  const highestPrice = Math.max(...data.map(p => p.price));
  const usualPrice = findUsualPrice(data);
  const priceDrops = analyzePriceDrops(data);
  const lastChange = analyzeLastChange(data);
  const stableDays = analyzeStability(data);

  return {
      analysis: {
          new: {
              currentPriceContext: {
                  currentPrice,
                  usualPrice: {
                      price: usualPrice.price,
                      percentageOfTime: usualPrice.percentageOfTime
                  },
                  lowestPrice,
                  highestPrice
              },
              priceDrops: {
                  total: priceDrops.count,
                  averageDrop: priceDrops.averageAmount,
                  daysSinceLastDrop: priceDrops.daysSinceLastDrop
              },
              recentActivity: {
                  stableDays,
                  lastChange
              }
          }
      }
  };
}

// Simplified helper functions
function findUsualPrice(data) {
  const priceCount = data.reduce((acc, point) => {
      acc[point.price] = (acc[point.price] || 0) + 1;
      return acc;
  }, {});
  
  const mostCommonPrice = Object.entries(priceCount)
      .reduce((a, b) => (a[1] > b[1] ? a : b))[0];

  return {
      price: parseFloat(mostCommonPrice),
      percentageOfTime: Math.round((priceCount[mostCommonPrice] / data.length) * 100)
  };
}

function analyzePriceDrops(data) {
  let drops = 0;
  let totalDrops = 0;
  let lastDrop = null;

  for (let i = 1; i < data.length; i++) {
      const diff = data[i].price - data[i-1].price;
      if (diff < -0.01) {
          drops++;
          totalDrops += Math.abs(diff);
          lastDrop = data[i].timestamp;
      }
  }

  return {
      count: drops,
      averageAmount: drops > 0 ? Math.round((totalDrops / drops) * 100) / 100 : 0,
      daysSinceLastDrop: lastDrop ? Math.floor((Date.now() - lastDrop) / (24 * 60 * 60 * 1000)) : null
  };
}

function analyzeLastChange(data) {
  if (data.length < 2) return null;
  
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const change = last.price - prev.price;
  
  return {
      amount: Math.round(change * 100) / 100,
      percentage: Math.round((change / prev.price) * 100 * 10) / 10,
      direction: change > 0 ? 'increase' : 'decrease',
      daysAgo: Math.floor((Date.now() - last.timestamp) / (24 * 60 * 60 * 1000))
  };
}

function analyzeStability(data) {
  return Math.floor((Date.now() - data[data.length - 1].timestamp) / (24 * 60 * 60 * 1000));
}

function processTimeSeries(data) {
  if (!data || !Array.isArray(data)) return [];
  
  return data.reduce((acc, val, idx) => {
      if (idx % 2 === 0 && data[idx + 1] !== -1) {
          acc.push({
              timestamp: (val + 21564000) * 60000,
              price: data[idx + 1] / 100
          });
      }
      return acc;
  }, []).sort((a, b) => a.timestamp - b.timestamp);
}

// Main API handler
// In your test-keepa.js API endpoint
export default async function handler(req, res) {
  await corsMiddleware(req, res);

  if (req.method === 'OPTIONS') {
      return res.status(200).end();
  }

  if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
      const { asin, domain = 1 } = req.body;
      console.log('Received request:', { asin, domain });

      if (!asin) {
          return res.status(400).json({ 
              success: false, 
              error: 'ASIN is required' 
          });
      }

      const keepaApiKey = process.env.KEEPA_API_KEY;
      if (!keepaApiKey) {
          return res.status(500).json({ 
              success: false, 
              error: 'Keepa API key not configured' 
          });
      }

      // Make sure domain is a number
      const keepaDomain = parseInt(domain) || 1;
      
      console.log('Calling Keepa API with:', { asin, keepaDomain });
      
      // Include domain in Keepa API request
      const keepaUrl = `https://api.keepa.com/product?key=${keepaApiKey}&domain=${keepaDomain}&asin=${asin}&maxLength=90`;
      const response = await fetch(keepaUrl);
      
      if (!response.ok) {
          const errorText = await response.text();
          console.error('Keepa API error:', {
              status: response.status,
              statusText: response.statusText,
              error: errorText
          });
          return res.status(response.status).json({
              success: false,
              error: `Keepa API error: ${response.status} - ${errorText}`
          });
      }

      const keepaData = await response.json();
      
      // Check if Keepa returned an error
      if (keepaData.error) {
          console.error('Keepa returned error:', keepaData.error);
          return res.status(400).json({
              success: false,
              error: `Keepa error: ${keepaData.error}`
          });
      }

      const result = processKeepaData(keepaData);
      
      res.status(200).json({
          success: true,
          asin: asin,
          domain: keepaDomain,
          analysis: result.analysis,
          priceHistory: result.priceHistory
      });
  } catch (error) {
      console.error('Handler error:', error);
      res.status(500).json({
          success: false,
          error: error.message || 'An unexpected error occurred',
          details: error.toString()
      });
  }
}