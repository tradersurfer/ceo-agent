/**
 * Registers COO/Hermes skills.
 *
 * payment_webhook_event_classify (formerly payment_gateway_sync):
 * Classifies a caller-supplied webhook event shape and proposes follow-up
 * actions. It does NOT verify Stripe (or any provider) signatures, does NOT
 * read webhook secrets, and does NOT call provider APIs. Authentic webhook
 * verification requires the raw HTTP body + Stripe-Signature header at the
 * API-route layer — see docs/ISSUE-stripe-webhook-verification-route-layer.md.
 *
 * ADR-001a exclusions unchanged (no docker/shell/db skills here).
 */
function registerCooSkills(registry) {
  const PERMISSION = Object.freeze({ requiresAgentAssignment: true });

  registry.register('payment_webhook_event_classify', {
    capability: 'api_webhook_orchestration',
    description:
      'Classifies a caller-supplied payment webhook event shape (e.g. Stripe-style type strings) into a status label and suggested follow-up actions. Does not verify webhook authenticity, does not read credentials, and does not call payment provider APIs.',
    disableModelInvocation: true,
    inputSchema: {
      webhookEvent: { type: 'object', required: true },
      provider: { type: 'string', required: false },
    },
    outputSchema: {
      transactionStatus: { type: 'string', required: true },
      actions: { type: 'array', required: true },
    },
    permissions: PERMISSION,
    handler: async ({ webhookEvent = {}, provider = 'stripe' }) => {
      const event = webhookEvent;
      const type = String(event.type || event.event || event.eventType || 'unknown');
      const data = event.data && event.data.object ? event.data.object : (event.data || event.object || {});
      const amount = data.amount != null ? Number(data.amount) : (data.amount_total != null ? Number(data.amount_total) : null);
      const currency = data.currency || data.currency_code || null;
      const customerId = data.customer || data.customer_id || null;
      const statusField = String(data.status || data.payment_status || '').toLowerCase();
      let transactionStatus = 'unrecognized';
      const actions = [];
      const successTypes = ['payment_intent.succeeded', 'charge.succeeded', 'checkout.session.completed', 'invoice.paid', 'customer.subscription.created', 'customer.subscription.updated'];
      const failureTypes = ['payment_intent.payment_failed', 'charge.failed', 'invoice.payment_failed', 'charge.dispute.created'];
      const cancelTypes = ['customer.subscription.deleted', 'checkout.session.expired', 'payment_intent.canceled'];
      if (successTypes.includes(type) || statusField === 'succeeded' || statusField === 'paid') {
        transactionStatus = 'succeeded';
        actions.push({ type: 'grant_access', reason: 'payment_succeeded' });
        actions.push({ type: 'crm_update', field: 'payment_status', value: 'paid' });
        if (customerId) actions.push({ type: 'sync_customer', customerId: String(customerId) });
      } else if (failureTypes.includes(type) || statusField === 'failed') {
        transactionStatus = 'failed';
        actions.push({ type: 'flag_revenue_risk', reason: type });
        actions.push({ type: 'crm_update', field: 'payment_status', value: 'failed' });
        actions.push({ type: 'notify_ops', severity: 'medium' });
      } else if (cancelTypes.includes(type) || statusField === 'canceled' || statusField === 'cancelled') {
        transactionStatus = 'canceled';
        actions.push({ type: 'revoke_or_review_access', reason: type });
        actions.push({ type: 'crm_update', field: 'payment_status', value: 'canceled' });
      } else if (type.includes('refund')) {
        transactionStatus = 'refunded';
        actions.push({ type: 'crm_update', field: 'payment_status', value: 'refunded' });
        actions.push({ type: 'notify_finance', reason: 'refund_event' });
      } else {
        transactionStatus = 'unrecognized';
        actions.push({ type: 'manual_review', reason: 'Unrecognized webhook shape; authenticity not verified by this skill.' });
      }
      actions.push({
        type: 'note',
        detail: 'Classification only. No signature verification, no credential use, no provider API call.',
        provider: String(provider),
        amount,
        currency,
      });
      return { transactionStatus, actions };
    },
  });

  // Alias retained only as a registry migration note: old name must be updated
  // in skill-registry.json, agent-registry.json, and Organization.js in the same PR.

  registry.register('webhook_payload_parsing', {
    capability: 'api_webhook_orchestration',
    description: 'Extracts common operational fields from a webhook payload object and routes it to a department by content heuristics.',
    disableModelInvocation: true,
    inputSchema: {
      payload: { type: 'object', required: true },
      source: { type: 'string', required: false },
    },
    outputSchema: {
      parsed: { type: 'object', required: true },
      routedTo: { type: 'string', required: true },
    },
    permissions: PERMISSION,
    handler: async ({ payload = {}, source = 'unknown' }) => {
      const keys = Object.keys(payload || {});
      const lowerKeys = keys.map(k => k.toLowerCase());
      const textBlob = JSON.stringify(payload).toLowerCase();
      const extract = (...candidates) => {
        for (const key of candidates) {
          if (payload[key] != null) return payload[key];
          const found = keys.find(k => k.toLowerCase() === key.toLowerCase());
          if (found && payload[found] != null) return payload[found];
        }
        return null;
      };
      const parsed = {
        source: String(source),
        eventType: extract('type', 'event', 'eventType', 'event_type', 'topic'),
        id: extract('id', 'event_id', 'uuid', 'reference'),
        customer: extract('customer', 'customer_id', 'customerId', 'email', 'user_email'),
        amount: extract('amount', 'amount_total', 'value', 'total'),
        status: extract('status', 'payment_status', 'state'),
        keyCount: keys.length,
        topLevelKeys: keys.slice(0, 20),
      };
      let routedTo = 'operations';
      if (/payment|invoice|stripe|billing|refund|subscription/.test(textBlob) || lowerKeys.some(k => /payment|invoice|amount/.test(k))) routedTo = 'finance';
      else if (/lead|signup|marketing|campaign|utm_/.test(textBlob)) routedTo = 'marketing';
      else if (/deploy|github|build|error|exception|stack/.test(textBlob)) routedTo = 'technology';
      else if (/employee|hr|payroll|pto|onboarding/.test(textBlob)) routedTo = 'people';
      else if (/contract|legal|compliance|gdpr|tos/.test(textBlob)) routedTo = 'legal';
      return { parsed, routedTo };
    },
  });
}
module.exports = { registerCooSkills };
