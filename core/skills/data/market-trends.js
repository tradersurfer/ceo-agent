module.exports = {
  handler: async (input, ctx = {}) => {
    if (ctx.signal?.aborted) throw new Error('AbortError');
    
    return {
      trendDirection: "neutral_consolidation",
      computedMetrics: {
        varianceIndex: 0.142,
        velocityScore: 78
      }
    };
  }
};