export default async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    try {
      const { analysis } = req.body;
      const priceData = analysis.new;  // We're only using NEW prices
  
      // Format the data for our prompt
      const promptData = {
        currentContext: {
          meterScore: priceData.meterScore.score,
          currentPrice: priceData.currentPriceContext.currentPrice,
          usualPrice: {
            price: priceData.currentPriceContext.usualPrice.price,
            percentageOfTime: priceData.currentPriceContext.usualPrice.percentageOfTime
          },
          lowestPrice: priceData.currentPriceContext.lowestPrice,
          highestPrice: priceData.currentPriceContext.highestPrice
        },
        priceDrops: {
          total: priceData.priceDrops.total,
          averageDrop: priceData.priceDrops.averageDrop,
          daysSinceLastDrop: priceData.priceDrops.daysSinceLastDrop
        },
        recentActivity: {
          stableDays: priceData.recentActivity.stableDays,
          lastChange: priceData.recentActivity.lastChange
        },
        volatilityMetrics: {
          totalChanges: priceData.volatilityMetrics.totalChanges,
          priceRange: priceData.volatilityMetrics.priceRange
        },
        lowestPriceMetrics: {
          price: priceData.lowestPriceMetrics.price,
          durationDays: priceData.lowestPriceMetrics.durationDays
        }
      };
  
      const prompt = `
  ### Task:
  Generate the following components for a product pricing popup based on the provided inputs:
  1. **Header**: A short, clear, and action-oriented statement that explains the meter score. The output should align with the meter:
     - High Score (70%-100%): Encourage buying now.
     - Mid Score (40%-69%): Suggest it's an okay deal.
     - Low Score (0%-39%): Strongly recommend waiting.
  2. **First Phrase**: Explain with numbers why the meter score was assigned. Avoid explicitly mentioning the current price but compare it to the lowest price, usual price, or max price to justify the score. 
  3. **Second Phrase**: Reinforce the meter score using additional insights such as price trends, stability, or historical context. 
  4. **Third Phrase (CTA)**: Tie the explanation to a specific call-to-action. Adapt the tone based on the meter score:
     - High Score: Encourage buying but offer tracking as optional.
     - Mid Score: Not a bad price but recommend tracking to find a better deal soon.
     - Low Score: Strongly urge tracking to avoid overpaying.
  
  ### Inputs:
  Current Price Context:
  - Meter Score: ${promptData.currentContext.meterScore}%
  - Current Price: $${promptData.currentContext.currentPrice}
  - Usual Price: $${promptData.currentContext.usualPrice.price} (${promptData.currentContext.usualPrice.percentageOfTime}% of the time)
  - Lowest Price: $${promptData.currentContext.lowestPrice}
  - Highest Price: $${promptData.currentContext.highestPrice}
  
  Price Drops:
  - Total: ${promptData.priceDrops.total}
  - Average Drop: $${promptData.priceDrops.averageDrop}
  - Last Drop: ${promptData.priceDrops.daysSinceLastDrop} days ago
  
  Recent Activity:
  - Stable for: ${promptData.recentActivity.stableDays} days
  - Last Change: $${Math.abs(promptData.recentActivity.lastChange.amount)} 
    (${promptData.recentActivity.lastChange.percentage}% ${promptData.recentActivity.lastChange.direction}) 
    ${promptData.recentActivity.lastChange.daysAgo} days ago
  
  Volatility Metrics:
  - Total Price Changes in 90 Days: ${promptData.volatilityMetrics.totalChanges}
  - Price Range: $${promptData.volatilityMetrics.priceRange.min} - $${promptData.volatilityMetrics.priceRange.max}
  
  Time at Lowest Price:
  - Stayed at $${promptData.lowestPriceMetrics.price} for ${promptData.lowestPriceMetrics.durationDays} days
  
  ### Instructions:
  - Keep sentences concise and clear (3rd-grade reading level).
  - Ensure the tone and flow are cohesive across all four components.
  - Base the outputs strictly on the provided inputs and meter score logic.
  - Return the response in this format:
    - Header: [Your text]
    - First Phrase: [Your text]
    - Second Phrase: [Your text]
    - Third Phrase: [Your text]
  `;
  
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
      
      // Parse OpenAI response
      const content = data.choices[0].message.content;
      const lines = content.split('\n').filter(line => line.trim());
      
      // Extract the four components
      const text = {
        header: lines.find(l => l.startsWith('Header:'))?.replace('Header:', '').trim() || 'Price analysis unavailable',
        firstPhrase: lines.find(l => l.startsWith('First Phrase:'))?.replace('First Phrase:', '').trim() || '',
        secondPhrase: lines.find(l => l.startsWith('Second Phrase:'))?.replace('Second Phrase:', '').trim() || '',
        thirdPhrase: lines.find(l => l.startsWith('Third Phrase:'))?.replace('Third Phrase:', '').trim() || ''
      };
  
      res.status(200).json({
        success: true,
        text
      });
  
    } catch (error) {
      console.error('Error generating text:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }