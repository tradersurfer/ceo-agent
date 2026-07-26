const { OpenAI } = require('openai');

// Pre-load context environments if not initialized globally
if (!process.env.OPENAI_API_KEY) {
  console.warn("[JECI Engine Alert] OPENAI_API_KEY environment variable is absent. Falling back to local/mock mode.");
}

const openAIClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'mock-install-key-development',
  maxRetries: 3,
  timeout: 45000 // 45 seconds to cover larger strategic synthesis requests
});

module.exports = openAIClient;