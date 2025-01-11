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
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { analysis } = req.body;
        
        // Log the received data for debugging
        console.log('Received request body:', JSON.stringify(req.body, null, 2));

        if (!analysis || !analysis.new) {
            throw new Error('Invalid analysis data received');
        }

        const priceData = analysis.new;
        
        // Debug log for price data
        console.log('Processing price data:', JSON.stringify(priceData, null, 2));

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
                        content: `Generate pricing recommendations in this format:
                        Header: A clear recommendation based on the price analysis
                        First Phrase: Numerical justification
                        Second Phrase: Additional context
                        Third Phrase: Call to action

                        Based on this data:
                        - Meter Score: ${priceData.meterScore.score}%
                        - Current Price: $${priceData.currentPriceContext.currentPrice}
                        - Price History: The price has changed ${priceData.volatilityMetrics.totalChanges} times in 90 days
                        - Lowest Recent Price: $${priceData.currentPriceContext.lowestPrice}
                        - Usual Price: $${priceData.currentPriceContext.usualPrice.price}`
                    }
                ],
                temperature: 0.7,
                max_tokens: 200
            })
        });

        // Debug log for OpenAI response
        console.log('OpenAI response status:', response.status);
        
        const data = await response.json();
        console.log('OpenAI response data:', JSON.stringify(data, null, 2));

        if (!data.choices?.[0]?.message?.content) {
            console.error('Invalid OpenAI response:', data);
            throw new Error('Invalid response from OpenAI');
        }

        const content = data.choices[0].message.content;
        const lines = content.split('\n').filter(line => line.trim());

        console.log('Parsed lines:', lines);

        const text = {
            header: lines.find(l => l.toLowerCase().includes('header:'))?.split('Header:')[1]?.trim() || 'Price analysis unavailable',
            firstPhrase: lines.find(l => l.toLowerCase().includes('first phrase:'))?.split('First Phrase:')[1]?.trim() || '',
            secondPhrase: lines.find(l => l.toLowerCase().includes('second phrase:'))?.split('Second Phrase:')[1]?.trim() || '',
            thirdPhrase: lines.find(l => l.toLowerCase().includes('third phrase:'))?.split('Third Phrase:')[1]?.trim() || ''
        };

        console.log('Generated text:', text);

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