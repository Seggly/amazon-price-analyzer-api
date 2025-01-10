export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type');
  
    // Handle OPTIONS request (preflight)
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
  
    // Only allow POST requests for actual data
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    try {
      const { asin } = req.body;
  
      // Simple test response
      res.status(200).json({
        message: 'API is working!',
        receivedAsin: asin
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }