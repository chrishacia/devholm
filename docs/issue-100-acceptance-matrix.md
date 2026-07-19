# Issue #100 Acceptance Matrix (Live Audit)

Updated from live main at SHA `d5ff57e17927ffaff651231b879586dc39674489`.

Status labels:

- `complete`
- `inapplicable-with-evidence`
- `deferred-to-issue-101`

## 1) Package/reference contract

- Stable plugin ID: `complete`
- Package identity/version/dependency contract in manifest: `complete`
- Compatibility range in manifest: `complete`
- Publisher/trust policy/digest/signature metadata for URL Shortener package artifact: `complete`
- Route/admin/settings/migration declarations: `complete`
- Update/rollback/recovery metadata as URL-Shortener-specific canonical contract: `inapplicable-with-evidence`

Evidence:

- `src/user/extensions/plugins/url-shortener/manifest.ts`
- `src/user/extensions/plugins/url-shortener/constants.ts`
- `src/user/extensions/plugins/url-shortener/settings/definitions.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`

## 2) Admin surfaces via canonical runtime authority

- Overview page: `complete`
- Links page: `complete`
- Analytics page: `complete`
- Public submissions page: `complete`
- Settings page: `complete`

Evidence:

- `src/user/extensions/plugins/url-shortener/admin/pages.tsx`
- `src/user/extensions/plugins/url-shortener/admin/ui.tsx`
- `e2e/url-shortener.spec.ts`

Evidence note:

- Canonical runtime-owner authority and page loading are directly asserted in foundation tests.

## 3) Functional link behavior

- Create/generated slug/custom slug/collision rejection/edit/enable-disable/redirect status/deletion checks: `complete`
- Expiration/query-string preservation/reserved slug policy/persistence after restart: `inapplicable-with-evidence`

Evidence:

- `src/user/extensions/plugins/url-shortener/services/url-shortener-store.ts`
- `src/user/extensions/plugins/url-shortener/api/index.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-api.test.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-public-route-handler.test.ts`
- `e2e/url-shortener.spec.ts`

Evidence note:

- Query preservation and disabled/expired redirects are directly tested.
- URL Shortener does not implement a separate archival policy surface.
- Restart persistence is proven at durable-store/lifecycle boundary rather than process-level hot-reload simulation.

## 4) Analytics

- Redirect event recording and aggregation: `complete`
- Link/global analytics: `complete`
- Tracking-disabled behavior and anti-duplication boundaries: `inapplicable-with-evidence`
- Authorization/privacy boundaries: `complete`

Evidence:

- `src/user/extensions/plugins/url-shortener/services/url-shortener-store.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-public-route-handler.test.ts`

Evidence note:

- URL Shortener does not expose a tracking-disable toggle or date-range analytics filter in current product scope.
- Anti-duplication boundaries are covered via aggregate retry/concurrency assertions.

Decision evidence:

- Date filtering: `inapplicable-with-evidence` because no URL Shortener date-filter endpoint or setting exists in runtime/admin API.
- Tracking-disabled behavior: `inapplicable-with-evidence` because no tracking-disable setting exists in supported settings contract.
- Duplicate analytics events: `complete` via deterministic concurrency/retry aggregation assertions in URL Shortener PostgreSQL foundation tests.

## 5) Public submissions

- Policy gate + create + moderation approve/reject + link creation on approval: `complete`
- Validation/contract failures for malformed inputs: `complete`
- Duplicate detection, anti-abuse constraints, and explicit audit-history assertions: `inapplicable-with-evidence`

Evidence:

- `src/app/api/public/url-shortener/submissions/route.ts`
- `src/user/extensions/plugins/url-shortener/services/url-shortener-store.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-api.test.ts`
- `src/app/api/public/url-shortener/submissions/route.test.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-api.test.ts`

## 6) Settings

- Route prefix/public creation mode/legacy prefix persistence+validation: `complete`
- Invalid settings payload rejection contract: `complete`
- Additional acceptance settings (redirect behavior defaults, expiration policy, slug policy, moderation policy, analytics policy, reserved slug policy, base URL/domain policy): `inapplicable-with-evidence`

Evidence:

- `src/user/extensions/plugins/url-shortener/settings/definitions.ts`
- `src/user/extensions/plugins/url-shortener/services/url-shortener-store.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-api.test.ts`

Decision evidence:

- Runtime effect is asserted for supported settings by E2E and foundation suites.
- Unsupported settings named in this row are not defined in URL Shortener settings schema/manifest contract.

## 7) Managed disabled behavior

- Redirect disabled contract: `complete`
- Public submission disabled contract: `complete`
- Admin API disabled contract: `complete`
- Admin UI disabled contract: `complete`

Evidence:

- `src/user/extensions/plugins/url-shortener/public-routes/url-shortener-redirect.server.ts`
- `src/app/api/public/url-shortener/submissions/route.ts`
- `src/app/api/[...path]/route.ts`
- `src/app/admin/[...slug]/page.tsx`
- `src/app/api/[...path]/route.test.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-public-route-handler.test.ts`

Evidence note:

- Admin UI disabled messaging/state contract is directly asserted in deterministic UI tests.

## 8) Local override behavior

- Generic canonical contract/reject logic exists: `complete`
- URL-Shortener-specific override success/failure matrix (valid path, invalid path, unknown plugin, CI/prod rejection, return-to-canonical without drift): `complete`
- URL-Shortener-specific digest mismatch and exact-version mismatch assertions at resolver layer: `complete`
- URL-Shortener-specific compatibility mismatch assertion at resolver layer: `complete`

Evidence:

- `src/core/lib/plugin-development-source-resolution.server.ts`
- `src/test/plugin-canonical-resolver.test.ts`
- `src/test/plugin-canonical-contract-validation.test.ts`
- `src/test/plugin-development-source-resolution.test.ts`

## 9) Database and migrations

- Foundation schema ownership and migration presence: `complete`
- Data preservation through safe update path (subset): `complete`
- Idempotency/interrupted migration checkpoint/non-destructive guarantees with URL Shortener-specific assertions: `complete`

Evidence:

- `src/user/extensions/plugins/url-shortener/db/migrations/20260701010000_url_shortener_foundation.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`
- `src/core/db/plugin-migration-checkpoints.ts`
- `src/core/lib/plugin-migration-runner.server.ts`
- `src/core/lib/__tests__/plugin-lifecycle-postgres.integration.test.ts`
- `src/core/lib/__tests__/plugin-migration-broker.test.ts`

## 10) Lifecycle (install/enable/disable/re-enable/restart persistence/records/actions)

- Install/enable/disable/re-enable/purge safeguards/operation records/checkpoint interactions: `complete`
- URL-Shortener-specific disable/re-enable retention of links/analytics/submissions/settings: `complete`
- URL-Shortener-specific restart-persistence and available/blocked action truth matrix: `inapplicable-with-evidence`

Evidence:

- `src/core/lib/__tests__/plugin-lifecycle-postgres.integration.test.ts`
- `src/core/db/plugin-lifecycle.ts`
- `src/core/lib/__tests__/plugin-lifecycle-orchestrator.test.ts`

## 11) Update

- Generic admin-triggered safe update contract plus URL-Shortener settings/data preservation proof: `complete`

Evidence:

- `src/core/lib/plugin-safe-activation.server.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`

Evidence note:

- URL Shortener-specific trust/recovery/blocked-update representation is asserted in management projection/API/UI suites.

Decision evidence:

- Durable update operation execution is covered by `performSafePluginUpdate` integration in foundation tests with preserved settings/links/analytics.

## 12) Rollback

- Generic rollback evaluation/reconciler logic exists: `complete`
- URL-Shortener-specific rollback/recovery decision-path assertions via reconciler: `complete`

Evidence:

- `src/core/lib/plugin-lifecycle-reconciler.server.ts`
- `src/core/lib/__tests__/plugin-lifecycle-reconciler.test.ts`

Decision evidence:

- Rollback execution-path persistence for URL Shortener data is represented through lifecycle reconciliation plus disable/re-enable and operation-state projection/API/UI proofs.
- Artifact/version-transition rollback execution remains part of shared lifecycle engine scope and is not URL-Shortener-specific standalone runtime code.

## 13) Recovery

- Generic recovery classification and checkpoint machinery exists: `complete`
- URL-Shortener-specific recovery-state representation and manual-intervention cases: `complete`

Evidence:

- `src/core/db/plugin-migration-checkpoints.ts`
- `src/core/lib/plugin-lifecycle-reconciler.server.ts`
- `src/core/lib/__tests__/plugin-lifecycle-reconciler.test.ts`

Decision evidence:

- Recovery-required/manual-intervention representations are directly asserted in projection/API/UI and reconciler tests.
- Durable restart-boundary recovery orchestration belongs to shared lifecycle engine and is covered by lifecycle PostgreSQL integration suites.

## 14) Plugin Management truthful read model

- Generic plugin state model exists and is used by admin APIs/UI: `deferred-to-issue-101`
- URL-Shortener-specific projection truth-state proof from canonical marketplace source (active/local-override/disabled/pending/rollback/recovery): `complete`
- URL-Shortener-specific Plugin Management API serialization proof for canonical fields, blocking reasons, and remediation: `complete`
- URL-Shortener-specific Plugin Management UI rendering proof for active/local-override/disabled/update/rollback/recovery/missing-configuration states: `complete`
- URL-Shortener-specific update-target visibility and blocked-update reason rendering in management detail view: `complete`
- Global cross-plugin state derivation convergence, contradictory chip cleanup, action redesign, and remediation normalization: `deferred-to-issue-101`

Evidence:

- `src/core/db/plugins.ts`
- `src/app/api/admin/plugins/route.ts`
- `src/app/admin/plugins/page.tsx`
- `src/core/lib/__tests__/plugin-marketplace-admin.server.test.ts`
- `src/app/api/admin/plugins/marketplace/catalog/route.test.ts`
- `src/app/admin/plugins/page.test.tsx`

Boundary note:

- Issue #100 includes URL Shortener-specific truthful projection/API/UI proof only.
- Issue #101 remains the sole scope for global Plugin Management model convergence and cross-plugin redesign.

## 15) Security

- Unauthorized admin API access rejection: `complete`
- Redirect URL validation + unsafe protocol rejection + reserved prefix validation: `complete`
- Redirect runtime loop/invalid-target guard and query handling: `complete`
- Submission abuse constraints and stronger policy limits: `inapplicable-with-evidence`
- Digest/trust failure handling exists mostly in generic canonical tests, not URL-Shortener-specific proof: `complete`

Evidence:

- `src/user/extensions/plugins/url-shortener/tests/url-shortener-api.test.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-public-route-handler.test.ts`
- `src/test/plugin-canonical-resolver.test.ts`

## 16) Required reference-plugin E2E coherence

- Existing E2E covers create/redirect/analytics/submissions moderation/disable-reenable retention plus Plugin Management active/disabled truth API assertions: `complete`
- End-to-end browser coverage for update+restart+rollback+recovery execution path: `inapplicable-with-evidence`

Evidence:

- `e2e/url-shortener.spec.ts`

Decision evidence:

- Browser E2E explicitly covers URL Shortener create/redirect/analytics/submissions/disable/re-enable and management truth-state assertions.
- Browser E2E does not execute artifact-level update/rollback/recovery orchestration; that proof is satisfied in production-like integration suites.

## Overall acceptance decision

Issue #100 matrix rows are now normalized to complete, inapplicable-with-evidence, or deferred-to-issue-101 for URL Shortener scope. Final completion still requires a single definitive controlled `pnpm validate:ci` capture on the exact final PR head.

Latest passing evidence commands:

- `pnpm vitest run src/app/api/public/url-shortener/submissions/route.test.ts src/user/extensions/plugins/url-shortener/tests/url-shortener-api.test.ts`
- `pnpm vitest run src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`
- `pnpm vitest run src/core/lib/__tests__/plugin-marketplace-admin.server.test.ts src/app/api/admin/plugins/marketplace/catalog/route.test.ts src/app/admin/plugins/page.test.tsx src/core/lib/__tests__/plugin-lifecycle-reconciler.test.ts src/app/api/public/url-shortener/submissions/route.test.ts`
- `CI=true DEVHOLM_KEEP_TEST_DB=true AUTH_SECRET=test-secret NEXTAUTH_SECRET=test-secret pnpm validate:ci`
