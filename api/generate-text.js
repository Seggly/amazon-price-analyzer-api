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
    methods: ['GET, POST, OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

export default async function handler(req, res) {
    await corsMiddleware(req, res);
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { analysis } = req.body;
        if (!analysis || !analysis.new) {
            throw new Error('Invalid analysis data received');
        }

        const priceData = analysis.new;

        const prompt = `### Task:
You are a friendly Amazon price analyzer AI.
You are appearing on a Google Chrome extension popup on an Amazon product page.
You are provided with the last 90 days price history of this product.
The user wants to know if the product is at a good price or not.
Format your answer in a conversational way like if you are texting a very good friend in a hurry who needs a concise answer.
Put personality in your message.
Start each Subject block with a title.
Don't use any complicated words.

### Outputs:
Follow this conversational framework:
Header: give your conclusion (e.g., "Lowest price in a year—BUY NOW! 🎯").
Subject 1: give a price insight explanation with key insights 
Subject 2: Should you buy now? Guidance on whether to buy or wait and if the price likely to go up, down

### Output Example:

Lowest price in a year—BUY NOW! 🎯

💡 Price Insight
I'd call this a WOW! moment for your wallet. The product is at its lowest price of $16.99 right now, which is a solid deal! Most of the time, it's priced at $19.99, so you're saving $3. It just dropped to this price 6 days ago, so it's fresh in the bargain zone.💸

🤔 Should You Buy Now?
Oh, absolutely YES! 💯 At $16.99, you're grabbing it at its very best. The price doesn't stay here forever (only about 10 days on average), so don't sleep on this deal.🚀

### Inputs:
Price Context:
- Current Price: $${priceData.currentPriceContext.currentPrice}
- Usual Price: $${priceData.currentPriceContext.usualPrice.price} (${priceData.currentPriceContext.usualPrice.percentageOfTime}% of the time)
- Lowest Price: $${priceData.currentPriceContext.lowestPrice}
- Highest Price: $${priceData.currentPriceContext.highestPrice}

Price Drops:
- Total: ${priceData.priceDrops.total}
- Average Drop: $${priceData.priceDrops.averageDrop}
- Last Drop: ${priceData.priceDrops.daysSinceLastDrop} days ago

Recent Activity:
- Stable for: ${priceData.recentActivity.stableDays} days
- Last Change: ${priceData.recentActivity.lastChange.direction === 'decrease' ? '-' : '+'}$${Math.abs(priceData.recentActivity.lastChange.amount)} 
  (${priceData.recentActivity.lastChange.percentage}% ${priceData.recentActivity.lastChange.direction}) 
  ${priceData.recentActivity.lastChange.daysAgo} days ago

Volatility Metrics:
- Total Price Changes in 90 Days: ${priceData.volatilityMetrics.totalChanges}
- Price Range: $${priceData.volatilityMetrics.priceRange.min} - $${priceData.volatilityMetrics.priceRange.max}

Average Time at Lowest Price each time:
- Stayed at $${priceData.lowestPriceMetrics.price} for ${priceData.lowestPriceMetrics.durationDays} days

### Instructions:
Return your response exactly in this format without any line numbers or additional text:

Header: [Your conclusion text]

💡 Price Insight
[Your price insight text]

🤔 Should You Buy Now?
[Your buying advice text]`;

        console.log('Sending to OpenAI:', prompt);

        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key not configured');
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "You are a friendly and helpful price analysis assistant that gives clear, concise advice in a conversational tone."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
            })
        });

        const data = await response.json();

        if (!data.choices?.[0]?.message?.content) {
            throw new Error('Invalid response from OpenAI');
        }

        const content = data.choices[0].message.content;
        console.log('Raw OpenAI response:', content);

        // Split content into sections
        const sections = content.split('\n\n');
        let text = {
            header: '',
            subject1: '',
            subject2: ''
        };

        // Parse header (first section that starts with "Header:")
        const headerSection = sections.find(s => s.toLowerCase().startsWith('header:'));
        if (headerSection) {
            text.header = headerSection.replace(/^header:/i, '').trim();
        }

        // Find the price insight section
        const insightSection = sections.find(s => s.includes('💡 Price Insight'));
        if (insightSection) {
            text.subject1 = insightSection.trim();
        }

        // Find the buying advice section
        const adviceSection = sections.find(s => s.includes('🤔 Should You Buy Now?'));
        if (adviceSection) {
            text.subject2 = adviceSection.trim();
        }

        // If we're missing any sections, try alternate format
        if (!text.header || !text.subject1 || !text.subject2) {
            console.log('Failed to parse sections using emojis, trying alternate format');
            text.header = text.header || sections[0]?.trim() || 'Price analysis unavailable';
            text.subject1 = text.subject1 || sections[1]?.trim() || 'Price insight unavailable';
            text.subject2 = text.subject2 || sections[2]?.trim() || 'Buying advice unavailable';
        }

// Validate we have all components with content
if (!text.header || !text.subject1 || !text.subject2) {
    console.error('Failed to parse sections:', sections);
    throw new Error('Failed to generate all required text components');
}

// Create debug info object
const debugInfo = {
    prompt: prompt,  // Include the complete prompt
    rawResponse: content,
    parsedSections: sections
};

// Return the formatted response with debug info
res.status(200).json({
    success: true,
    text,
    debug: debugInfo
});

    } catch (error) {
        console.error('Error in generate-text:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate text',
            errorDetails: error
        });
    }
}