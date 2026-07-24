/**
 * Maps internal status/error states to plain-language, user-facing
 * messages. No raw error text, status codes, or stack traces ever appear
 * in the returned message — those stay in the separate `technicalDetail`
 * field for logging/debugging only, never shown to the end user by
 * either interface.
 */

function friendlyMessageFor(status, rawReason = '') {
  const reason = String(rawReason || '');

  switch (status) {
    case 'not_configured':
      return "Setup hasn't been completed yet. Run the setup wizard first.";

    case 'no_api_key':
      return "I don't have an AI model connected yet. Add an OpenRouter API key in Settings to enable live responses.";

    case 'no_model':
      return "I couldn't find an available model for this request. Try switching cost mode with /cost, or check back in a moment.";

    case 'model_resolution_failed':
      return "I'm having trouble reaching the model provider to check what's available right now. Please try again shortly.";

    case 'model_call_failed':
      if (/401/.test(reason) || /User not found/i.test(reason)) {
        return "I couldn't connect using the current API key. It may be invalid or expired — check the key in Settings.";
      }
      if (/429/.test(reason) || /rate limit/i.test(reason)) {
        return "I'm getting rate-limited by the model provider right now. Please wait a moment and try again.";
      }
      if (/timeout|timed out/i.test(reason)) {
        return "That request took too long to get a response. Please try again.";
      }
      return "I ran into a problem getting a response just now. Please try again in a moment.";

    case 'blocked':
      return "I wasn't able to process that request as given — it may be missing required information or isn't something I'm authorized to do.";

    case 'queued':
      return "That's been validated and queued, but isn't connected to a live runtime for this install yet.";

    case 'conversational_only':
      return "That's someone I can talk with directly, but not something I can dispatch as an automated task — try messaging them instead.";

    default:
      return "Something didn't go as expected. Please try again, and let the installer know if it keeps happening.";
  }
}

module.exports = { friendlyMessageFor };
