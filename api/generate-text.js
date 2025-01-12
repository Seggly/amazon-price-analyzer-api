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

export default async function handler(req, res) {
    await corsMiddleware(req, res);
    
    // Handle OPTIONS request
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
        if (!priceData.meterScore || !priceData.currentPriceContext || !priceData.priceDrops) {
            throw new Error('Missing required price data fields');
        }

        const prompt = `
### Task:
Generate the following components for a product pricing popup based on the provided inputs:
1. **Header**: A short, clear, and action-oriented statement that explains the meter score. The output should align with the meter.
2. **First Phrase**: Explain with numbers why the meter score was assigned. Avoid explicitly mentioning the current price but compare it to the lowest price, usual price, or max price to justify the score. 
3. **Second Phrase**: Reinforce the meter score using additional insights such as price trends, stability, or historical context. 
4. **Third Phrase (CTA)**: Tie the explanation to a specific call-to-action. Adapt the tone based on the meter score:
   - High Score: Encourage buying but offer tracking as optional.
   - Mid Score: Not a bad price but recommend tracking to find a better deal soon.
   - Low Score: Strongly urge tracking to avoid overpaying.

### Inputs:
Current Price Context:
- Meter Score: ${priceData.meterScore.score}%
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
- Last Change: $${Math.abs(priceData.recentActivity.lastChange.amount)} 
  (${priceData.recentActivity.lastChange.percentage}% ${priceData.recentActivity.lastChange.direction}) 
  ${priceData.recentActivity.lastChange.daysAgo} days ago

Volatility Metrics:
- Total Price Changes in 90 Days: ${priceData.volatilityMetrics.totalChanges}
- Price Range: $${priceData.volatilityMetrics.priceRange.min} - $${priceData.volatilityMetrics.priceRange.max}

Time at Lowest Price:
- Stayed at $${priceData.lowestPriceMetrics.price} for ${priceData.lowestPriceMetrics.durationDays} days

### Instructions:
- Keep sentences concise and clear (3rd-grade reading level).
- Ensure the tone and flow are cohesive across all four components.
- Base the outputs strictly on the provided inputs and meter score logic.
- Return the response in this format:
  Header: [Your text]
  First Phrase: [Your text]
  Second Phrase: [Your text]
  Third Phrase: [Your text]
`;

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
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that generates clear, concise pricing recommendations."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 200
            })
        });

        const data = await response.json();

        if (!data.choices?.[0]?.message?.content) {
            throw new Error('Invalid response from OpenAI');
        }

        const content = data.choices[0].message.content;
        const lines = content.split('\n').filter(line => line.trim());

        const text = {
            header: lines.find(l => l.toLowerCase().startsWith('header:'))?.replace(/^header:/i, '').trim() || 'Price analysis unavailable',
            firstPhrase: lines.find(l => l.toLowerCase().startsWith('first phrase:'))?.replace(/^first phrase:/i, '').trim() || '',
            secondPhrase: lines.find(l => l.toLowerCase().startsWith('second phrase:'))?.replace(/^second phrase:/i, '').trim() || '',
            thirdPhrase: lines.find(l => l.toLowerCase().startsWith('third phrase:'))?.replace(/^third phrase:/i, '').trim() || ''
        };

        if (!text.header || !text.firstPhrase || !text.secondPhrase || !text.thirdPhrase) {
            throw new Error('Failed to generate all required text components');
        }

        res.status(200).json({
            success: true,
            text
        });

    } catch (error) {
        console.error('Error in generate-text:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate text'
        });
    }
}