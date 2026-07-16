# Privacy-First Analytics Enhancement Direction

## Status

This is a later strategic roadmap direction. It is not part of the active Issue #92 through Issue #104 plugin-convergence sequence and must not interrupt Issue #97 or subsequent convergence children.

Promote this direction into one or more dedicated implementation issues only after the existing analytics architecture, privacy model, SDK/event contracts, storage behavior, and user-facing controls have been inventoried and acceptance criteria can be defined safely.

## Product intent

DevHolm should provide increasingly useful first-party analytics that help site owners understand how visitors actually move through and interact with their sites.

The goal is not to imitate every metric collected by Google Analytics, Adobe Analytics, or other dedicated surveillance-scale platforms. The goal is to provide a coherent, trustworthy, privacy-first analytics product with enough depth to answer practical questions about:

- acquisition
- landing and entry behavior
- navigation paths
- content engagement
- conversion and goal completion
- exit behavior
- return visits
- device and traffic patterns
- custom interactions defined by site owners and developers

Analytics should connect isolated measurements into understandable visitor journeys rather than presenting entry pages, exit pages, clicks, and views as unrelated counters.

## Privacy posture

Anonymous-first analytics remains the default.

DevHolm should collect the minimum data required for useful analysis and must not silently become a cross-site tracking or advertising-identification system.

The design must distinguish clearly between:

- anonymous aggregate analytics
- pseudonymous first-party visitor recognition
- consent-dependent analytics
- authenticated-user analytics
- prohibited or unsupported tracking

Any repeat-visitor mechanism must be evaluated as pseudonymous processing rather than described casually as fully anonymous.

The eventual implementation must address:

- GDPR and UK GDPR
- ePrivacy and cookie/device-storage rules
- CCPA/CPRA and similar state privacy laws
- regional consent requirements
- Global Privacy Control where applicable
- data minimization
- purpose limitation
- configurable retention
- deletion and export workflows
- opt-out and consent withdrawal
- administrator-facing disclosures
- visitor-facing privacy documentation
- Do Not Track policy, even if only documented as unsupported or advisory
- child-directed and sensitive-site restrictions

Legal requirements differ by deployment location and use case. DevHolm should provide safe controls and documented defaults rather than claim universal compliance automatically.

## Visitor and session recognition

DevHolm should support progressively richer first-party visit analysis while minimizing identification risk.

Potential recognition modes to evaluate include:

1. **Strict anonymous mode**
   - no durable visitor identifier
   - short-lived session grouping only
   - aggregate reports
   - safest default for high-privacy deployments

2. **Pseudonymous first-party visitor mode**
   - random first-party identifier
   - scoped to one DevHolm site or installation
   - rotated on a documented schedule
   - never shared across unrelated sites
   - no raw identity embedded in the identifier
   - consent-controlled where legally required

3. **Privacy-preserving server-derived recognition**
   - carefully bounded, rotating derivation from coarse request attributes
   - strong salting and short retention
   - resistance to reversal and cross-site correlation
   - used only after a formal privacy and security review

4. **Authenticated-user analytics**
   - explicit separate mode
   - clear purpose and access controls
   - user-level reporting disabled by default
   - subject-access and deletion handling

Avoid durable browser fingerprinting based on high-entropy hardware, font, canvas, audio, extension, or similar signals unless a future legal, privacy, and security review establishes a narrowly justified use. Covert or difficult-to-reset fingerprinting should not be the default path to return-visitor measurement.

## Core analytics expansion

Future analytics should support increasingly connected analysis across the following areas.

### Acquisition and entry

- referrer and referring domain
- campaign and UTM dimensions
- search-engine attribution where available
- direct, referral, social, campaign, and internal traffic classification
- landing page
- first page of session
- new versus returning visitor classification where enabled
- bot and suspected automation filtering

### Journey and navigation analysis

- previous page and next page
- entry-to-exit path sequences
- top navigation paths
- path exploration from a selected page
- path exploration toward a selected conversion
- loops and repeated navigation
- dead ends and abandonment points
- internal search-to-content paths
- page-flow visualization
- journey depth
- session duration and engaged duration

### Content engagement

- page and post views
- unique visitors and sessions
- engaged visits
- active time versus background-tab time
- scroll depth thresholds
- content completion approximation
- outbound-link clicks
- download clicks
- media starts, progress, completion, and failure
- copy interactions where explicitly instrumented
- form starts, field-level abandonment where privacy-safe, validation failures, and completion
- search queries with configurable redaction

Do not capture form values, passwords, secrets, payment data, health information, or other sensitive field content as analytics payloads.

### Exit and abandonment

- exit page
- last meaningful interaction
- time from last interaction to exit
- route or workflow abandonment
- funnel step abandonment
- error preceding exit
- outbound destination category
- broken-link or failed-action contribution

### Return behavior and cohorts

Where pseudonymous recognition is enabled lawfully:

- new versus returning visitors
- return frequency
- days between visits
- retention by acquisition source
- retention by landing page
- retention by content category
- rolling visitor cohorts
- repeat conversion behavior
- device continuity only within the chosen privacy model

### Technology and environment

Use coarse, privacy-preserving dimensions where possible:

- device class
- operating-system family
- browser family
- viewport category
- language
- approximate region where lawful and configured
- network or performance category without storing raw IP addresses unnecessarily
- JavaScript capability
- connection-quality indicators where supported

Avoid exposing overly precise combinations that create re-identification risk, especially for low-volume sites.

### Performance and quality correlation

Connect analytics to operational quality where useful:

- Core Web Vitals
- route latency
- asset failures
- API failures
- JavaScript errors
- hydration errors
- plugin errors
- form submission failures
- broken internal links
- 404 journeys
- performance impact on conversion or abandonment

Analytics and observability must remain distinct systems with controlled correlation, rather than leaking unrestricted logs into analytics reports.

## Funnels, goals, and conversions

Provide first-class definitions for:

- goals
- conversion events
- ordered funnels
- unordered funnels
- optional steps
- exclusion steps
- time windows
- page-based goals
- event-based goals
- form-submission goals
- commerce or plugin-defined goals

Reports should include:

- entrants
- completion rate
- drop-off by step
- time to completion
- source and campaign breakdown
- device and page breakdown
- new versus returning comparison
- trend over time

Goal definitions must use stable identifiers and survive route-title or presentation changes.

## Custom events and tracking beacons

Site owners and developers need supported ways to instrument meaningful interactions without editing analytics internals.

Provide a versioned first-party analytics event contract with methods conceptually similar to:

- `trackEvent(name, properties)`
- `trackClick(eventId, context)`
- `trackConversion(goalId, context)`
- `trackPageView(context)`
- `trackTiming(metric, duration, context)`
- `trackError(code, context)`

The final API names must follow DevHolm SDK conventions.

Supported integration surfaces should include:

- content-editor links and buttons
- page and post blocks
- forms
- navigation components
- core UI
- lifecycle-managed plugins
- site-owned React components
- locally developed build-time pages
- server actions and APIs
- public routes
- background jobs where event semantics make sense

### Declarative content instrumentation

Content authors should eventually be able to configure tracking without writing JavaScript, for example:

- mark a link or button as a named analytics event
- associate a click with a goal
- assign stable event and campaign identifiers
- choose which safe contextual fields are recorded
- preview the resulting event definition

Do not require arbitrary inline scripts or unsafe `onclick` injection.

### Developer instrumentation

The public SDK should expose typed server and client helpers that:

- validate event names and schemas
- enforce property allowlists and size limits
- strip or reject sensitive fields
- support stable event-schema versions
- handle batching and delivery retries
- avoid blocking navigation
- deduplicate repeated submissions
- support testing utilities
- expose development diagnostics
- work for site-owned and plugin-owned code through the same contract

### Optional beacon delivery

Evaluate a first-party beacon endpoint using mechanisms such as `navigator.sendBeacon` or equivalent fetch behavior for exit-safe delivery.

Requirements include:

- same-origin by default
- CSRF and abuse controls
- payload size limits
- rate limiting
- bot filtering
- schema validation
- idempotency/deduplication
- consent enforcement
- no arbitrary third-party forwarding
- Content Security Policy compatibility

## Event and data model

Define versioned contracts for at least:

- visitor
- session
- page view
- navigation transition
- interaction event
- goal/conversion
- funnel participation
- campaign attribution
- performance measurement
- error/quality event
- consent state

Each event should use appropriate fields such as:

- event ID
- schema version
- occurred-at timestamp
- received-at timestamp
- site/tenant scope
- pseudonymous visitor ID where enabled
- session ID
- page/route identity
- content identity
- referrer category
- campaign identifiers
- event name
- safe typed properties
- consent mode
- source SDK/version

Use stable content and route identifiers rather than depending only on mutable URLs or titles.

## Identity, IP, and sensitive-data handling

The future design must explicitly decide:

- whether raw IP addresses are ever stored
- whether IPs are truncated, transformed, or used transiently only
- salt rotation and identifier rotation
- separation of analytics identity from authentication identity
- whether authenticated identity may be joined to analytics and under what approval
- which headers may be processed
- which query parameters are always redacted
- which paths require redaction
- how low-volume dimensions are suppressed
- how deletion requests affect derived aggregates

Default behavior should avoid retaining raw IP addresses and should redact common secret, token, email, and personal-data patterns before persistence.

## Consent and configuration

Provide configurable analytics modes and controls such as:

- analytics disabled
- strict anonymous analytics
- pseudonymous first-party analytics
- consent-required analytics
- authenticated analytics extensions
- per-event-category consent
- region-aware behavior where supported

Administrators need controls for:

- enabled data categories
- retention duration
- identifier rotation
- geography precision
- custom-event registration
- consent integration
- excluded routes
- excluded administrator traffic
- bot filtering
- internal traffic filters
- export
- deletion
- aggregate-only reporting

The UI must explain the privacy implications of each mode accurately.

## Reporting and exploration

Future reporting should evolve beyond isolated summary cards and tables.

Potential views include:

- overview with trends and comparisons
- real-time or near-real-time activity with strict privacy thresholds
- acquisition
- content
- journeys and path exploration
- funnels and goals
- events
- return behavior and cohorts
- technology
- geography at safe granularity
- performance and errors
- custom dashboards

Common reporting capabilities should include:

- date comparison
- segmentation
- filters
- drill-down
- saved views
- annotations
- CSV/JSON export
- privacy threshold indicators
- data freshness indicators
- sampling or aggregation disclosures

## Storage, scale, and retention

Before implementation, evaluate:

- PostgreSQL suitability by deployment size
- partitioning
- aggregation tables
- rollups
- event retention versus aggregate retention
- background processing
- indexes
- high-cardinality dimensions
- storage quotas
- cleanup jobs
- backup impact
- export portability
- optional external analytics storage adapters later

DevHolm should remain operable for ordinary self-hosted sites without requiring a dedicated analytics warehouse, while leaving a clean extension path for larger deployments.

## Security and abuse controls

Require:

- authenticated and authorized administration reports
- scoped event ingestion
- origin validation
- rate limiting
- payload validation
- bounded property counts and sizes
- injection protection
- sensitive-data redaction
- bot and spam-event defenses
- replay/deduplication handling
- audit logs for configuration changes
- safe CSV export
- tenant/site isolation
- no analytics query path that permits arbitrary SQL or unrestricted dimensions

## Testing expectations

When promoted, implementation issues should include tests for:

- anonymous-mode guarantees
- pseudonymous identifier rotation
- consent gating
- opt-out and withdrawal
- event-schema validation
- sensitive-property rejection
- custom click tracking
- client and server SDK tracking
- duplicate-event handling
- beacon delivery during navigation
- sessionization
- path reconstruction
- funnel calculations
- cohort calculations
- retention cleanup
- export/deletion
- bot filtering
- low-volume privacy thresholds
- PostgreSQL integration
- high-volume behavior
- accessibility of reports and visualizations

## Sequencing and promotion

This direction should remain in roadmap intake until the active plugin-convergence sequence is complete.

Before implementation:

1. inventory the current analytics collection, schema, reports, retention, and privacy behavior;
2. identify what is already anonymous and what is actually pseudonymous;
3. define the analytics privacy modes;
4. define the event and session contracts;
5. define SDK and declarative instrumentation contracts;
6. define storage, retention, aggregation, and deletion behavior;
7. obtain a legal/privacy review of defaults and disclosures;
8. split implementation into dependency-ordered child issues.

Likely phases include:

1. current-state inventory and privacy architecture
2. canonical event/session model
3. first-party SDK and declarative custom events
4. journey and path reconstruction
5. goals and funnels
6. return visits and cohorts
7. performance/error correlation
8. reporting and exploration UI
9. retention, export, deletion, and compliance controls
10. scale, hardening, and release audit

## Explicit non-goals for initial promotion

- advertising profiles
- cross-site identity graphs
- selling or sharing visitor data
- third-party ad targeting
- covert persistent fingerprinting
- session replay or keystroke capture
- capturing form-field values
- universal legal-compliance claims
- replacing dedicated enterprise analytics warehouses
