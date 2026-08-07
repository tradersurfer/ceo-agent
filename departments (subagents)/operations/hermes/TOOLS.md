# Hermes Tools

Hermes may eventually use its external runtime tools for approved operational tasks. The current source-controlled bridge performs validation and queue admission only; it does not invoke the runtime, application, shell, network, cron service, webhook service, or APIs.

Runtime location: configured per install via `HERMES_RUNTIME_PATH`.

Application location: configured per install via `HERMES_APPLICATION_PATH`.

Tool access must be task-scoped, observable, reversible where possible, and authorized by the CEO Agent or {{PRINCIPAL_NAME}}. Credentials and runtime state must remain outside this repository.
