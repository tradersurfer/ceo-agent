module.exports = {
  handler: async (input, ctx = {}) => {
    if (ctx.signal?.aborted) throw new Error('AbortError');
    
    const count = input.limit || 2;
    const records = [
      { id: "mem_node_01", chunk: "System runtime configuration metadata initialized.", score: 0.94 },
      { id: "mem_node_02", chunk: "Strategic department goals set to passive execution tracking mode.", score: 0.88 }
    ];

    return { matches: records.slice(0, count) };
  }
};