# Plugin System: Events, Jobs, and Tasks

## Overview

DevHolm's plugin system provides three complementary extension points for plugin developers:

1. **Events**: React to framework and application events in real-time
2. **Background Jobs**: Perform asynchronous work with retries and failure handling
3. **Scheduled Tasks**: Execute recurring work on fixed intervals or cron schedules

All plugin extensions use public SDK contracts (`@devholm/sdk/server`) with no requirement for direct access to framework internals.

## Event Handlers

### What are Event Handlers?

Event handlers allow plugins to react when specific events occur in the framework or application. Events are delivered synchronously to all registered handlers in order.

### Registering Event Handlers

```typescript
import { defineEventHandler, defineEventHandlerId, StandardEventTypes } from '@devholm/sdk/server';

defineEventHandler({
  handlerId: defineEventHandlerId('onUserCreated'),
  pluginId: 'my-plugin',
  eventTypeId: StandardEventTypes.USER_CREATED,
  handler: async (event) => {
    // React to user creation
    console.log('New user created:', event.userId);
  },
});
```

### Available Event Types

The framework defines standard event types that plugins can subscribe to:

- `USER_AUTHENTICATED`: User successfully authenticated
- `USER_CREATED`: New user account created
- `USER_DELETED`: User account deleted
- `CONTENT_CREATED`: Content item created
- `CONTENT_UPDATED`: Content item updated
- `CONTENT_DELETED`: Content item deleted
- `PLUGIN_ENABLED`: Plugin has been enabled
- `PLUGIN_DISABLED`: Plugin has been disabled
- `SETTINGS_CHANGED`: Configuration changed
- `REQUEST_COMPLETED`: HTTP request completed

### Event Handler Contracts

Event handlers must follow the contract:

```typescript
type EventHandler = (event: DomainEvent) => void | Promise<void>;
```

Handlers can be synchronous or asynchronous. If a handler throws an error:

- The error is caught and logged
- Other handlers continue executing
- The error does not propagate to the caller

### Event Versioning

Events support payload versioning for schema evolution:

```typescript
const event: UserCreatedEvent = {
  eventTypeId: StandardEventTypes.USER_CREATED,
  payloadVersion: eventPayloadVersion(1), // Schema version
  occurredAt: new Date(),
  userId: 'user-123',
  email: 'user@example.com',
};
```

### Plugin Enablement

Event handlers only execute if their plugin is enabled. Framework checks `site_settings` for `plugin:{pluginId}:enabled == 'true'` before invoking handlers.

### Error Handling and Idempotency

Event handlers should be idempotent - safe to invoke multiple times for the same event. The framework may retry handlers on transient failures.

If your handler modifies state, consider:

- Using unique event identifiers to detect duplicates
- Storing processed event IDs to skip re-processing
- Designing operations as idempotent operations

## Background Jobs

### What are Background Jobs?

Background jobs enable plugins to perform work asynchronously, with automatic retry logic and failure tracking. Jobs can fail, be retried, and observe retry policies.

### Registering Job Handlers

```typescript
import { defineJobHandler, defineJobTypeId, StandardJobRetryPolicies } from '@devholm/sdk/server';

defineJobHandler({
  jobTypeId: defineJobTypeId('send-email'),
  pluginId: 'email-plugin',
  handler: async (context) => {
    // Perform async work
    await sendEmail(context.payload.recipientEmail, context.payload.subject);
  },
  retryPolicy: StandardJobRetryPolicies.STANDARD,
});
```

### Enqueuing Jobs

```typescript
import { enqueueJob } from '@devholm/sdk/server';

await enqueueJob(
  defineJobTypeId('send-email'),
  {
    recipientEmail: 'user@example.com',
    subject: 'Welcome!',
  },
  {
    idempotencyKey: 'email-welcome-123', // For deduplication
  }
);
```

### Retry Policies

The framework provides standard retry policies:

#### NO_RETRY

- Maximum retries: 0
- Backoff: 0ms
- Use for: jobs that should not be retried

#### STANDARD

- Maximum retries: 3
- Initial backoff: 1000ms
- Backoff multiplier: 2x (1s → 2s → 4s)
- Use for: most background jobs

#### AGGRESSIVE

- Maximum retries: 5
- Initial backoff: 500ms
- Backoff multiplier: 1.5x
- Use for: critical jobs that must succeed

### Job Execution Context

Job handlers receive a context with:

```typescript
interface JobExecutionContext {
  readonly jobInstanceId: JobInstanceId; // Unique job instance ID
  readonly jobTypeId: JobTypeId; // Job type
  readonly attempt: number; // Current attempt (1-based)
  readonly enqueuedAt: Date; // When job was queued
  readonly startedAt: Date; // When execution started
}
```

### Payload Versioning

Job payloads support versioning for schema evolution:

```typescript
const payload = {
  version: jobPayloadVersion(2), // Current schema version
  data: {
    /* ... */
  },
};
```

### Idempotency and Failure Handling

Jobs may be retried after failures. Design your handlers to be idempotent:

1. **Generate unique instance IDs**: Use deterministic IDs so retries use the same ID
2. **Check before modifying**: Before creating a resource, check if it already exists
3. **Handle transient vs. permanent failures**: Only retry on transient errors

Example:

```typescript
defineJobHandler({
  jobTypeId: defineJobTypeId('create-report'),
  pluginId: 'reporting-plugin',
  handler: async (context) => {
    const reportId = `report-${context.jobInstanceId}`;

    // Check if report already exists (idempotency)
    const existing = await getReport(reportId);
    if (existing) {
      return; // Already processed
    }

    // Create report
    await createReport(reportId, context.payload);
  },
  retryPolicy: StandardJobRetryPolicies.STANDARD,
});
```

## Scheduled Tasks

### What are Scheduled Tasks?

Scheduled tasks allow plugins to execute work on a recurring schedule - either at fixed intervals or using cron expressions for precise timing.

### Registering Scheduled Tasks

```typescript
import { defineScheduledTask, defineTaskTypeId, StandardSchedules } from '@devholm/sdk/server';

defineScheduledTask({
  taskTypeId: defineTaskTypeId('cleanup-cache'),
  pluginId: 'cache-plugin',
  handler: async (context) => {
    // Run cleanup logic
    await cleanupExpiredCache();
  },
  schedule: StandardSchedules.EVERY_HOUR,
});
```

### Schedule Types

#### Interval-Based Schedules

Fixed time intervals:

```typescript
import { intervalSchedule } from '@devholm/sdk/server';

// Every 5 minutes
intervalSchedule(5 * 60 * 1000);

// Every 5 minutes, starting 30 seconds from now
intervalSchedule(5 * 60 * 1000, 30 * 1000);
```

Standard intervals provided:

- `EVERY_MINUTE`: 60 seconds
- `EVERY_5_MINUTES`: 5 minutes
- `EVERY_HOUR`: 1 hour
- `EVERY_DAY`: 24 hours
- `EVERY_WEEK`: 7 days

#### Cron-Based Schedules

For precise timing, use cron expressions:

```typescript
import { cronSchedule } from '@devholm/sdk/server';

// Every day at midnight
cronSchedule('0 0 * * *');

// Every Monday at 9 AM
cronSchedule('0 9 * * 1');

// Every 15 minutes
cronSchedule('*/15 * * * *');
```

Standard cron expressions provided:

```typescript
import { StandardCronExpressions } from '@devholm/sdk/server';

StandardCronExpressions.EVERY_MINUTE; // * * * * *
StandardCronExpressions.EVERY_5_MINUTES; // */5 * * * *
StandardCronExpressions.EVERY_HOUR; // 0 * * * *
StandardCronExpressions.EVERY_DAY_MIDNIGHT; // 0 0 * * *
StandardCronExpressions.EVERY_DAY_NOON; // 0 12 * * *
StandardCronExpressions.EVERY_MONDAY_MIDNIGHT; // 0 0 * * 1
```

### Task Execution Context

Task handlers receive a context with:

```typescript
interface TaskExecutionContext {
  readonly taskTypeId: TaskTypeId; // Task type
  readonly pluginId: string; // Plugin that owns the task
  readonly lastExecutedAt?: Date; // When task last executed
  readonly nextExecutionAt: Date; // When task will next execute
}
```

### Task Observability and Failure Handling

Tasks should handle failures gracefully:

```typescript
defineScheduledTask({
  taskTypeId: defineTaskTypeId('sync-data'),
  pluginId: 'sync-plugin',
  handler: async (context) => {
    try {
      await syncDataWithExternalService();
    } catch (error) {
      // Log error for monitoring
      console.error('Sync failed:', error);

      // Decide whether to throw (mark task as failed) or recover
      // For transient failures, consider retrying with backoff
      if (error instanceof TransientError) {
        throw error; // Task scheduler will retry
      }
      // For permanent failures, log and continue
    }
  },
  schedule: StandardSchedules.EVERY_HOUR,
});
```

## SDK Test Utilities

Plugins can test their extensions using public SDK exports:

```typescript
import {
  defineEventHandler,
  defineJobHandler,
  defineScheduledTask,
  StandardEventTypes,
  StandardSchedules,
  StandardJobRetryPolicies,
} from '@devholm/sdk/server';

describe('My Plugin', () => {
  it('should handle user creation events', () => {
    const handler = vi.fn();

    defineEventHandler({
      handlerId: defineEventHandlerId('test-handler'),
      pluginId: 'test-plugin',
      eventTypeId: StandardEventTypes.USER_CREATED,
      handler,
    });

    // Verify registration and test behavior
    expect(handler).toBeDefined();
  });
});
```

## Plugin Enablement

Plugins can be enabled/disabled via `site_settings`:

```
plugin:{pluginId}:enabled = 'true'  // Enable plugin
plugin:{pluginId}:enabled = 'false' // Disable plugin
```

When a plugin is disabled:

- **Event handlers** are skipped (not invoked)
- **Queued jobs** won't execute
- **Scheduled tasks** won't run

Enabling a plugin makes all its handlers active again.

## Design Patterns

### Pattern: Event-Driven Job Triggering

React to events by enqueueing background work:

```typescript
defineEventHandler({
  handlerId: defineEventHandlerId('onUserCreated'),
  pluginId: 'onboarding-plugin',
  eventTypeId: StandardEventTypes.USER_CREATED,
  handler: async (event) => {
    // Enqueue background work when event occurs
    await enqueueJob(
      defineJobTypeId('send-welcome-email'),
      { userId: event.userId },
      { idempotencyKey: `welcome-${event.userId}` }
    );
  },
});

defineJobHandler({
  jobTypeId: defineJobTypeId('send-welcome-email'),
  pluginId: 'onboarding-plugin',
  handler: async (context) => {
    await sendWelcomeEmail(context.payload.userId);
  },
  retryPolicy: StandardJobRetryPolicies.STANDARD,
});
```

### Pattern: Scheduled Cleanup with Event Notification

Run cleanup tasks and notify about results:

```typescript
defineScheduledTask({
  taskTypeId: defineTaskTypeId('cleanup-temp-files'),
  pluginId: 'storage-plugin',
  handler: async (context) => {
    const deletedCount = await cleanupTempFiles();

    // Emit event for monitoring
    // (In future: dispatchEvent available to plugins)
  },
  schedule: StandardSchedules.EVERY_DAY,
});
```

## API Reference

### Event Types

- `defineEventHandler(registration)`: Register an event handler
- `eventTypeId(value)`: Create strongly-typed event type ID
- `eventHandlerId(value)`: Create strongly-typed event handler ID
- `eventPayloadVersion(version)`: Create event payload version

### Job Types

- `defineJobHandler(registration)`: Register a job handler
- `jobTypeId(value)`: Create strongly-typed job type ID
- `jobInstanceId(value)`: Create strongly-typed job instance ID
- `jobPayloadVersion(version)`: Create job payload version
- `enqueueJob(jobTypeId, payload, options)`: Enqueue a job
- `StandardJobRetryPolicies`: Predefined retry policies

### Task Types

- `defineScheduledTask(registration)`: Register a scheduled task
- `taskTypeId(value)`: Create strongly-typed task type ID
- `intervalSchedule(intervalMs, initialDelayMs?)`: Create interval-based schedule
- `cronSchedule(expression)`: Create cron-based schedule
- `StandardSchedules`: Predefined interval schedules
- `StandardCronExpressions`: Predefined cron expressions

## See Also

- [Plugin Development Guide](./plugin-development-guide.md)
- [Authorization and Permissions](./authorization.md)
- [Error Handling Best Practices](./error-handling.md)
