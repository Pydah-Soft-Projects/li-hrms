const ApiKey = require('../security/model/ApiKey');

exports.apiKeyAuth = async (req, res, next) => {
  try {
    const apiKey = req.header('x-api-key');

    if (!apiKey) {
      return res.status(401).json({ success: false, message: 'API key is missing' });
    }

    const keyDoc = await ApiKey.findOne({ key: apiKey, isActive: true });

    if (!keyDoc) {
      return res.status(401).json({ success: false, message: 'Invalid or inactive API key' });
    }

    // Attach client info to request in case it's needed downstream
    req.apiClient = keyDoc;
    
    next();
  } catch (error) {
    console.error('API Key Authentication Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error during authentication' });
  }
};
