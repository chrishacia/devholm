# Marketplace Publisher Trust Policy

Issue: #69

This document defines the machine-checkable trust policy for marketplace publishers.

## Supported Publisher Classes

- first-party: DevHolm-controlled publisher identities that are explicitly enrolled.
- private: explicitly enrolled private publishers scoped to configured plugin/site/channel boundaries.
- third-party: explicitly enrolled external publishers scoped to configured boundaries.
- unknown: always denied (fail closed).

Default behavior is deny unless an enrollment explicitly allows the requested operation.

## Trust Contract

Policy documents are versioned and currently require `policyVersion: 1`.

Each enrollment record includes:

- policyVersion
- enrollmentId
- publisherId
- publisherClass
- publisherStatus
- signingKeyId
- trustRootId
- keyStatus
- enrollmentScope
- allowedPluginIds
- allowedPluginNamespaces
- allowedSiteScopes
- allowedArtifactChannels
- allowedOperations
- effectiveAt
- expiresAt (optional)
- revokedAt (optional)
- revocationReason (optional)
- policySource
- createdAt/createdBy
- updatedAt/updatedBy

Malformed policy documents fail closed.
Unsupported policy versions fail closed.
Missing policy storage fails closed for non-first-party publishers.

## Decision Model

Trust evaluation returns a structured decision:

- outcome: allow or deny
- reasonCode
- matchedEnrollmentId
- matchedTrustRootId
- evaluatedScope (plugin, channel, site scope, operation)
- revocationState
- metadata (policy version/source and evaluation timestamp)

Stable deny reason codes include:

- publisher-unknown
- publisher-revoked
- publisher-suspended
- key-unknown
- key-revoked
- key-publisher-mismatch
- enrollment-missing
- enrollment-expired
- scope-denied
- plugin-denied
- site-denied
- channel-denied
- policy-version-unsupported
- policy-malformed

## Trust And Authorization Separation

Signature verification, trust policy, capability authorization, lifecycle authorization, migration authorization, and operator approval are separate gates.

A trusted publisher does not bypass:

- capability contract blockers
- lifecycle execution controls
- migration execution controls
- explicit admin approval requirements

## Revocation Behavior

Revoked or suspended enrollments deny future operations.
Expired enrollments deny future operations.
Key revocation denies future operations.

Previously installed artifacts are not automatically removed by trust revocation.
Subsequent install/update/rollback/enable/lifecycle/migration operations require a fresh allow decision.

## Offline And Cache Behavior

Cache origin does not imply trust.
Cached artifacts still require signature verification and trust-policy evaluation.
If policy data is malformed or unsupported, evaluation fails closed.

## Current Product Enablement

Third-party and private publishers are supported only through explicit administrative enrollment policy.
There is no public self-service publisher portal in this phase.
