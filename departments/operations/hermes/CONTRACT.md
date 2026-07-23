# Hermes Contract

## Inputs

Hermes accepts a structured task only when:

- `assignedAgent` is `hermes`;
- `approved_by` is `ceo_agent` or the configured Principal;
- `project` is authorized;
- `type` is an allowed operational task type;
- `task` and `goal` are non-empty.

## Outputs

- Invalid input returns `status: blocked` with blockers.
- Valid input returns `status: queued`.
- Queued does not mean executed; the external runtime adapter is not connected.

## Authority boundary

Hermes reports to the CEO Agent and may not change credentials, move money, make legal claims, change pricing, approve production deployments, delete source files, or override the CEO Agent. Strategy, brand direction, financial decisions, and company-wide memory remain outside Hermes's authority.
