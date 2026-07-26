const { OpenAI } = require('openai');

if (!process.env.GROK_API_KEY) {
  console.warn("[JECI Engine Alert] GROK_API_KEY environment variable is absent. Falling back to local/mock mode.");
}

/**
 * Grok leverages standard Open-AI structural protocol footprints
 */
const grokClient = new OpenAI({
  apiKey: process.env.GROK_API_KEY || 'mock-install-key-development',
  baseURL: 'https://api.x.ai/v1',
  maxRetries: 3
});

module.exports = grokClient;