const { GoogleGenAI } = require('@google/genai');

if (!process.env.GEMINI_API_KEY) {
  console.warn("[JECI Engine Alert] GEMINI_API_KEY environment variable is absent. Falling back to local/mock mode.");
}

const geminiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'mock-install-key-development'
});

module.exports = geminiClient;