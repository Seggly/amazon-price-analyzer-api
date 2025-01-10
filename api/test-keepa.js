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
    const processedData = {
        new: processTimeSeries(csvData[1]) // Only process NEW price history
    };

    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const recentData = {
        new: processedData.new.filter(point => point.timestamp >= ninetyDaysAgo)
    };

    const analysis = {};
    if (recentData.new.length > 0) {
        const data = recentData.new;
        const lowestPrice = Math.min(...data.map(p => p.price));
        const highestPrice = Math.max(...data.map(p => p.price));
        const usualPriceAnalysis = findUsualPrice(data);
        const priceDropsAnalysis = analyzePriceDrops(data);
        const lastMovementAnalysis = analyzeLastPriceMovement(data);
        const stabilityAnalysis = analyzePriceStability(data);
        const lowestPriceMetrics = analyzeTimeAtPrice(data, lowestPrice);

        analysis.new = {
            currentPriceContext: {
                currentPrice: data[data.length - 1].price,
                usualPrice: {
                    price: usualPriceAnalysis.price,
                    percentageOfTime: usualPriceAnalysis.percentageOfTime
                },
                lowestPrice: lowestPrice,
                highestPrice: highestPrice
            },
            priceDrops: {
                total: priceDropsAnalysis.count,
                averageDrop: priceDropsAnalysis.averageAmount,
                daysSinceLastDrop: priceDropsAnalysis.daysSinceLastDrop
            },
            recentActivity: {
                stableDays: stabilityAnalysis.stableDays,
                lastChange: lastMovementAnalysis ? {
                    amount: lastMovementAnalysis.amount,
                    percentage: lastMovementAnalysis.percentage,
                    direction: lastMovementAnalysis.direction,
                    daysAgo: lastMovementAnalysis.daysAgo
                } : null
            },
            volatilityMetrics: {
                totalChanges: data.length - 1,
                priceRange: {
                    min: lowestPrice,
                    max: highestPrice,
                    spread: Math.round((highestPrice - lowestPrice) * 100) / 100
                }
            },
            lowestPriceMetrics: {
                price: lowestPrice,
                durationDays: lowestPriceMetrics.totalDurationDays,
                lastSeen: Math.floor((Date.now() - data.find(p => Math.abs(p.price - lowestPrice) < 0.01).timestamp) / (24 * 60 * 60 * 1000))
            }
        };
    }

    return {
        analysis: analysis,
        priceHistory: recentData
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
    if (data.length === 0) return null;
    
    const now = Date.now();
    const priceTimePeriods = {};
    
    // For each price, it's valid from its timestamp until the next price change
    for (let i = 0; i < data.length; i++) {
      const price = Math.round(data[i].price * 100) / 100;
      const startTime = data[i].timestamp;
      const endTime = (i === data.length - 1) ? now : data[i + 1].timestamp;
      const duration = endTime - startTime;
      
      priceTimePeriods[price] = (priceTimePeriods[price] || 0) + duration;
    }
  
    let maxDuration = 0;
    let usualPrice = null;
    const totalDuration = Object.values(priceTimePeriods).reduce((sum, duration) => sum + duration, 0);
  
    for (const [price, duration] of Object.entries(priceTimePeriods)) {
      if (duration > maxDuration) {
        maxDuration = duration;
        usualPrice = parseFloat(price);
      }
    }
  
    return {
      price: usualPrice,
      durationDays: Math.round(maxDuration / (1000 * 60 * 60 * 24)),
      percentageOfTime: Math.round((maxDuration / totalDuration) * 100)
    };
  }

// Analyze price drops in the data
function analyzePriceDrops(data) {
    const drops = [];
    const now = Date.now();
    let lastDrop = null;
  
    for (let i = 1; i < data.length; i++) {
      const priceDiff = data[i].price - data[i-1].price;
      if (priceDiff < -0.01) { // Only count drops more than 1 cent
        drops.push({
          fromPrice: data[i-1].price,
          toPrice: data[i].price,
          amount: Math.abs(priceDiff),
          timestamp: data[i].timestamp,
          duration: (i === data.length - 1) ? now - data[i].timestamp : data[i + 1].timestamp - data[i].timestamp
        });
        lastDrop = data[i].timestamp;
      }
    }
  
    return {
      count: drops.length,
      averageAmount: drops.length > 0 
        ? Math.round((drops.reduce((sum, drop) => sum + drop.amount, 0) / drops.length) * 100) / 100
        : 0,
      daysSinceLastDrop: lastDrop ? Math.floor((now - lastDrop) / (24 * 60 * 60 * 1000)) : null,
      drops: drops // Including detailed drop history
    };
  }

// Analyze the most recent price change
function analyzeLastPriceMovement(data) {
    if (data.length < 2) return null;
  
    const lastEntry = data[data.length - 1];
    const previousEntry = data[data.length - 2];
    const change = lastEntry.price - previousEntry.price;
    const percentChange = (change / previousEntry.price) * 100;
    
    return {
      from: previousEntry.price,
      to: lastEntry.price,
      amount: Math.round(change * 100) / 100,
      percentage: Math.round(percentChange * 10) / 10,
      daysAgo: Math.floor((Date.now() - lastEntry.timestamp) / (24 * 60 * 60 * 1000)),
      direction: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'stable',
      timestamp: lastEntry.timestamp
    };
  }

// Analyze how long the price has been stable
function analyzePriceStability(data) {
    if (data.length === 0) return { stableDays: 0 };
  
    const now = Date.now();
    const lastPrice = data[data.length - 1].price;
    const lastPriceStartTime = data[data.length - 1].timestamp;
    
    // If there's only one entry or it's the last entry
    const stableDays = Math.floor((now - lastPriceStartTime) / (24 * 60 * 60 * 1000));
  
    return {
      stableDays: stableDays,
      price: lastPrice
    };
  }

// Calculate average price
function calculateAverage(prices) {
  return prices.length > 0 
    ? Math.round((prices.reduce((sum, price) => sum + price, 0) / prices.length) * 100) / 100
    : 0;
}
// Add after calculateAverage
function analyzeTimeAtPrice(data, targetPrice) {
    const periods = [];
    let currentPeriod = null;
    const now = Date.now();
  
    for (let i = 0; i < data.length; i++) {
      const price = data[i].price;
      const startTime = data[i].timestamp;
      const endTime = (i === data.length - 1) ? now : data[i + 1].timestamp;
  
      if (Math.abs(price - targetPrice) < 0.01) {
        if (!currentPeriod) {
          currentPeriod = {
            start: startTime,
            end: endTime
          };
        } else {
          currentPeriod.end = endTime;
        }
      } else if (currentPeriod) {
        periods.push(currentPeriod);
        currentPeriod = null;
      }
    }
  
    if (currentPeriod) {
      periods.push(currentPeriod);
    }
  
    const totalDuration = periods.reduce((sum, period) => 
      sum + (period.end - period.start), 0);
  
    return {
      price: targetPrice,
      totalDurationDays: Math.round(totalDuration / (24 * 60 * 60 * 1000)),
      periods: periods
    };
  }
// Main API handler
export default async function handler(req, res) {
    await corsMiddleware(req, res);
  
    if (req.method === 'POST') {
      try {
        const { asin } = req.body;
        const keepaApiKey = process.env.KEEPA_API_KEY;
        const response = await fetch(`https://api.keepa.com/product?key=${keepaApiKey}&domain=1&asin=${asin}&maxLength=90`);        const keepaData = await response.json();
        
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