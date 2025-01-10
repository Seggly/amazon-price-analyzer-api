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

// Process price history from Keepa
function processKeepaData(rawData) {
    const csvData = rawData.products[0].csv;
    const processedData = {
      amazon: processTimeSeries(csvData[0]),
      new: processTimeSeries(csvData[1]),
      fba: processTimeSeries(csvData[11])
    };
  
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const recentData = {
      amazon: processedData.amazon.filter(point => point.timestamp >= ninetyDaysAgo),
      new: processedData.new.filter(point => point.timestamp >= ninetyDaysAgo),
      fba: processedData.fba.filter(point => point.timestamp >= ninetyDaysAgo)
    };
  
    const analysis = {};
    for (const [category, data] of Object.entries(recentData)) {
      if (data.length > 0) {
        const priceDrops = analyzePriceDrops(data);
        const lastMovement = analyzeLastPriceMovement(data);
        const stability = analyzePriceStability(data);
        const usualPrice = findUsualPrice(data);
  
        analysis[category] = {
          currentPrice: data[data.length - 1].price,
          lowestPrice: Math.min(...data.map(p => p.price)),
          highestPrice: Math.max(...data.map(p => p.price)),
          usualPrice: usualPrice,
          averagePrice: calculateAverage(data.map(p => p.price)),
          priceDrops: priceDrops,
          lastMovement: lastMovement,
          priceStability: stability
        };
      }
    }
  
    return {
      analysis: analysis,
      priceHistory: processedData
    };
  }

// Convert Keepa's raw data into timestamp/price pairs
function processTimeSeries(data) {
  if (!data || !Array.isArray(data)) return [];
  
  const processed = [];
  for (let i = 0; i < data.length; i += 2) {
    const timestamp = convertKeepaTime(data[i]);
    const price = data[i + 1];
    
    if (price !== -1) { // Skip invalid prices
      processed.push({
        timestamp: timestamp,
        date: new Date(timestamp).toISOString(),
        price: price / 100 // Convert cents to dollars
      });
    }
  }
  
  return processed.sort((a, b) => a.timestamp - b.timestamp);
}

// Find the most common price
function findUsualPrice(data) {
  const priceFrequency = {};
  let maxFrequency = 0;
  let usualPrice = null;

  data.forEach(point => {
    const price = Math.round(point.price * 100) / 100; // Round to 2 decimal places
    priceFrequency[price] = (priceFrequency[price] || 0) + 1;
    
    if (priceFrequency[price] > maxFrequency) {
      maxFrequency = priceFrequency[price];
      usualPrice = price;
    }
  });

  return {
    price: usualPrice,
    frequency: maxFrequency,
    percentageOfTime: Math.round((maxFrequency / data.length) * 100)
  };
}

// Analyze price drops in the data
function analyzePriceDrops(data) {
  const drops = [];
  for (let i = 1; i < data.length; i++) {
    const priceDiff = data[i].price - data[i-1].price;
    if (priceDiff < -0.01) { // Only count drops more than 1 cent
      drops.push({
        amount: Math.abs(priceDiff),
        timestamp: data[i].timestamp
      });
    }
  }

  const lastDrop = drops[drops.length - 1];
  const daysSinceLastDrop = lastDrop 
    ? Math.floor((Date.now() - lastDrop.timestamp) / (24 * 60 * 60 * 1000))
    : null;

  return {
    count: drops.length,
    averageAmount: drops.length > 0 
      ? Math.round((drops.reduce((sum, drop) => sum + drop.amount, 0) / drops.length) * 100) / 100
      : 0,
    daysSinceLastDrop: daysSinceLastDrop
  };
}

// Analyze the most recent price change
function analyzeLastPriceMovement(data) {
  if (data.length < 2) return null;

  const lastPrice = data[data.length - 1].price;
  const previousPrice = data[data.length - 2].price;
  const change = lastPrice - previousPrice;
  const percentChange = (change / previousPrice) * 100;
  const daysAgo = Math.floor((Date.now() - data[data.length - 1].timestamp) / (24 * 60 * 60 * 1000));

  return {
    amount: Math.round(change * 100) / 100,
    percentage: Math.round(percentChange * 10) / 10,
    daysAgo: daysAgo,
    direction: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'stable'
  };
}

// Analyze how long the price has been stable
function analyzePriceStability(data) {
  if (data.length < 2) return { stableDays: 0 };

  let stableDays = 0;
  const lastPrice = data[data.length - 1].price;
  const threshold = 0.01; // 1 cent threshold

  for (let i = data.length - 2; i >= 0; i--) {
    if (Math.abs(data[i].price - lastPrice) > threshold) {
      break;
    }
    stableDays = Math.floor((data[data.length - 1].timestamp - data[i].timestamp) / (24 * 60 * 60 * 1000));
  }

  return {
    stableDays: stableDays
  };
}

// Calculate average price
function calculateAverage(prices) {
  return prices.length > 0 
    ? Math.round((prices.reduce((sum, price) => sum + price, 0) / prices.length) * 100) / 100
    : 0;
}

// Main API handler
export default async function handler(req, res) {
    await corsMiddleware(req, res);
  
    if (req.method === 'POST') {
      try {
        const { asin } = req.body;
        const keepaApiKey = process.env.KEEPA_API_KEY;
        const response = await fetch(`https://api.keepa.com/product?key=${keepaApiKey}&domain=1&asin=${asin}`);
        const keepaData = await response.json();
        
        const result = processKeepaData(keepaData);
        
        res.status(200).json({
          success: true,
          asin: asin,
          analysis: result.analysis,
          priceHistory: result.priceHistory
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