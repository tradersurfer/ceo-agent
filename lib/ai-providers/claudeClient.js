const { Anthropic } = require('@anthropic-ai/sdk');

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[JECI Engine Alert] ANTHROPIC_API_KEY environment variable is absent. Falling back to local/mock mode.");
}

const claudeClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'mock-install-key-development',
  maxRetries: 3,
  timeout: 60000 // Extended window for complex operational reasoning paths
});

module.exports = claudeClient;