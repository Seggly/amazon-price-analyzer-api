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
You are texting your friend who ask if a product is at a good price or not on Amazon
You are provided with the last 90 days price history of this product.
You will respond in a convivial way using simple term to convey why you think this is a good price or not.
Format your answer in 2 short and concise action-driven lines per subject.
Put personality in your message.
Use emoji's.

### Outputs:
Assign a grade to the price between: excellent, good, average, not-good and bad-price
Follow this conversational framework:
Header: give your conclusion (eg: Lowest price in a year—BUY NOW! 🎯)
Subject 1: give a price insight explanation with key insights 
Subject 2: should you buy now? Guidance on whether to buy or wait and if the price likely to go up, down

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

Average Time at Lowest Price:
- On average, stays at $${priceData.lowestPriceMetrics.price} for ${priceData.lowestPriceMetrics.averageDurationDays} days (occurred ${priceData.lowestPriceMetrics.numberOfPeriods} times)

### Instructions:
- Return the response in this format:

priceGrade: [Your Price Grade]

Header: [Your conclusion text]

💡 Price Insight: [Your price insight text]

🤔 Should You Buy Now?[Your buying advice text]`;

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
                model: "gpt-4o-mini",
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
                temperature: 2
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }
    
        const data = await response.json();
        console.log('OpenAI response:', data);
    
        if (!data.choices?.[0]?.message?.content) {
            console.error('Invalid OpenAI response:', data);
            throw new Error('Invalid response from OpenAI');
        }

        const content = data.choices[0].message.content;
        console.log('Raw OpenAI response:', content);

        // Split content into sections
        const sections = content.split('\n\n');
        console.log('Split sections:', sections);

        let text = {
            priceGrade: '',
            header: '',
            subject1: '',
            subject2: ''
        };

        // Parse each section
        for (const section of sections) {
            const lowerSection = section.toLowerCase().trim();
            
            if (lowerSection.startsWith('pricegrade:')) {
                text.priceGrade = section.split(':')[1].trim().toLowerCase();
                console.log('Found price grade:', text.priceGrade);
            }
            else if (lowerSection.startsWith('header:')) {
                text.header = section.replace(/^header:/i, '').trim();
            }
            else if (section.includes('💡 Price Insight:')) {
                text.subject1 = section.trim();
            }
            else if (section.includes('🤔 Should You Buy Now?')) {
                text.subject2 = section.trim();
            }
        }

        // Validate the price grade
        if (!text.priceGrade || !['excellent', 'good', 'average', 'not-good', 'bad-price'].includes(text.priceGrade)) {
            console.warn('Invalid or missing price grade:', text.priceGrade);
            text.priceGrade = 'average'; // Default fallback
        }

        // If any sections are missing, try alternate format
        if (!text.header || !text.subject1 || !text.subject2) {
            console.log('Missing sections, trying alternate format');
            text.header = text.header || sections[1]?.trim() || 'Price analysis unavailable';
            text.subject1 = text.subject1 || sections[2]?.trim() || 'Price insight unavailable';
            text.subject2 = text.subject2 || sections[3]?.trim() || 'Buying advice unavailable';
        }

        console.log('Final processed text:', text);

        res.status(200).json({
            success: true,
            text,
            debug: {
                prompt,
                rawResponse: content,
                parsedSections: sections,
                processedText: text
            }
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