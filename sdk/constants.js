const Statuses = Object.freeze({
  CREATED: 'created',
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

const Departments = Object.freeze({
  EXECUTIVE: 'executive',
  OPERATIONS: 'operations',
  ENGINEERING: 'engineering',
  MARKETING: 'marketing',
  CLIENT_SERVICES: 'client_services',
  FINANCE: 'finance',
  GROWTH: 'growth',
  RESEARCH: 'research',
  DESIGN: 'design',
  EXECUTIVE_ORCHESTRATION: 'executive_orchestration',
  OPERATIONS_EXECUTION: 'operations_execution',
  CONTENT: 'content',
  COMMUNITY: 'community',
});

const Priorities = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
});

const TaskTypes = Object.freeze({
  CRON_CREATE: 'cron_create',
  WEBHOOK_SUBSCRIBE: 'webhook_subscribe',
  API_TRIGGER: 'api_trigger',
  WORKFLOW_EXECUTION: 'workflow_execution',
  SKILL_CHAIN: 'skill_chain',
  SANDBOX_EXECUTION: 'sandbox_execution',
  SYSTEM_MONITORING: 'system_monitoring',
  ALERT_DISPATCH: 'alert_dispatch',
  INTAKE_PARSING: 'intake_parsing',
  CRM_ACTION: 'crm_action',
  SCHEDULED_JOB: 'scheduled_job',
  FILE_PROCESSING: 'file_processing',
  MEMORY_LOOKUP: 'memory_lookup',
  AUTOMATION_RUN: 'automation_run',
  CONTENT_CREATION: 'content_creation',
  COMMUNITY_ENGAGEMENT: 'community_engagement',
  FINANCIAL_FORECASTING: 'financial_forecasting',
  FINANCIAL_STATEMENT_ANALYSIS: 'financial_statement_analysis',
  SEO_OPTIMIZATION: 'seo_optimization',
  SOFTWARE_DEVELOPMENT: 'software_development',
  RESEARCH: 'research',
  DESIGN_GENERATION: 'design_generation',
  IMAGE_GENERATION: 'image_generation',
  ANALYSIS: 'analysis',
  REPORTING: 'reporting',
});

const HealthStates = Object.freeze({
  HEALTHY: 'healthy',
  BUSY: 'busy',
  OFFLINE: 'offline',
  DEGRADED: 'degraded',
});

const LifecycleStates = Object.freeze({
  CREATED: 'created',
  INITIALIZING: 'initializing',
  READY: 'ready',
  BUSY: 'busy',
  PAUSED: 'paused',
  OFFLINE: 'offline',
  RECOVERING: 'recovering',
  FAILED: 'failed',
});

const ExecutiveStatuses = Object.freeze({
  RECEIVED: 'received',
  ROUTED: 'routed',
  BLOCKED: 'blocked',
  ESCALATED: 'escalated',
  READY: 'ready',
});

module.exports = {
  Statuses,
  Departments,
  Priorities,
  TaskTypes,
  HealthStates,
  LifecycleStates,
  ExecutiveStatuses,
};
