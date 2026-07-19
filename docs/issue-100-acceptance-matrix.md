# Issue #100 Acceptance Matrix (Live Audit)

Updated from live main at SHA `d5ff57e17927ffaff651231b879586dc39674489`.

Status labels:

- `implemented+tested`
- `implemented+insufficient-tests`
- `partially-implemented`
- `missing`
- `inapplicable-with-evidence`

## 1) Package/reference contract

- Stable plugin ID: `implemented+tested`
- Package identity/version/dependency contract in manifest: `implemented+tested`
- Compatibility range in manifest: `implemented+tested`
- Publisher/trust policy/digest/signature metadata for URL Shortener package artifact: `partially-implemented`
- Route/admin/settings/migration declarations: `implemented+tested`
- Update/rollback/recovery metadata as URL-Shortener-specific canonical contract: `partially-implemented`

Evidence:

- `src/user/extensions/plugins/url-shortener/manifest.ts`
- `src/user/extensions/plugins/url-shortener/constants.ts`
- `src/user/extensions/plugins/url-shortener/settings/definitions.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`

## 2) Admin surfaces via canonical runtime authority

- Overview page: `implemented+insufficient-tests`
- Links page: `implemented+insufficient-tests`
- Analytics page: `implemented+insufficient-tests`
- Public submissions page: `implemented+insufficient-tests`
- Settings page: `implemented+insufficient-tests`

Evidence:

- `src/user/extensions/plugins/url-shortener/admin/pages.tsx`
- `src/user/extensions/plugins/url-shortener/admin/ui.tsx`
- `e2e/url-shortener.spec.ts`

Gap:

- No dedicated tests proving each page loads through canonical package/runtime authority semantics.

## 3) Functional link behavior

- Create/custom slug/edit/enable-disable/expiration/redirect/status/deletion/reserved checks: `implemented+insufficient-tests`

Evidence:

- `src/user/extensions/plugins/url-shortener/services/url-shortener-store.ts`
- `src/user/extensions/plugins/url-shortener/api/index.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-api.test.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-public-route-handler.test.ts`
- `e2e/url-shortener.spec.ts`

Gap:

- Missing direct tests for collision rejection, reserved slug policy behavior, query-string preservation, and explicit removal policy assertions.

## 4) Analytics

- Redirect event recording and aggregation: `implemented+tested`
- Link/global analytics: `implemented+insufficient-tests`
- Tracking-disabled behavior and anti-duplication boundaries: `partially-implemented`
- Authorization/privacy boundaries: `implemented+insufficient-tests`

Evidence:

- `src/user/extensions/plugins/url-shortener/services/url-shortener-store.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-public-route-handler.test.ts`

## 5) Public submissions

- Policy gate + create + moderation approve/reject + link creation on approval: `implemented+tested`
- Duplicate detection, anti-abuse constraints, and explicit audit-history assertions: `partially-implemented`

Evidence:

- `src/app/api/public/url-shortener/submissions/route.ts`
- `src/user/extensions/plugins/url-shortener/services/url-shortener-store.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-api.test.ts`
- `src/app/api/public/url-shortener/submissions/route.test.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`

## 6) Settings

- Route prefix/public creation mode/legacy prefix persistence+validation: `implemented+tested`
- Additional acceptance settings (redirect behavior defaults, expiration policy, slug policy, moderation policy, analytics policy, reserved slug policy, base URL/domain policy): `missing`

Evidence:

- `src/user/extensions/plugins/url-shortener/settings/definitions.ts`
- `src/user/extensions/plugins/url-shortener/services/url-shortener-store.ts`

## 7) Managed disabled behavior

- Redirect disabled contract: `implemented+tested`
- Public submission disabled contract: `implemented+tested`
- Admin API disabled contract: `implemented+tested`
- Admin UI disabled contract: `implemented+insufficient-tests`

Evidence:

- `src/user/extensions/plugins/url-shortener/public-routes/url-shortener-redirect.server.ts`
- `src/app/api/public/url-shortener/submissions/route.ts`
- `src/app/api/[...path]/route.ts`
- `src/app/admin/[...slug]/page.tsx`
- `src/app/api/[...path]/route.test.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-public-route-handler.test.ts`

Gap:

- Admin UI disabled view has runtime coverage in E2E, but needs dedicated deterministic assertions for message/state contract.

## 8) Local override behavior

- Generic canonical contract/reject logic exists: `implemented+tested (generic)`
- URL-Shortener-specific override success/failure matrix (valid path, invalid path, malformed manifest, unknown plugin, digest mismatch, compatibility mismatch, CI/prod rejection, return-to-canonical without drift): `missing`

Evidence:

- `src/core/lib/plugin-development-source-resolution.server.ts`
- `src/test/plugin-canonical-resolver.test.ts`
- `src/test/plugin-canonical-contract-validation.test.ts`

## 9) Database and migrations

- Foundation schema ownership and migration presence: `implemented+tested`
- Data preservation through safe update path (subset): `implemented+tested`
- Idempotency/interrupted migration checkpoint/non-destructive guarantees with URL Shortener-specific assertions: `implemented+insufficient-tests`

Evidence:

- `src/user/extensions/plugins/url-shortener/db/migrations/20260701010000_url_shortener_foundation.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`
- `src/core/db/plugin-migration-checkpoints.ts`
- `src/core/lib/plugin-migration-runner.server.ts`

## 10) Lifecycle (install/enable/disable/re-enable/restart persistence/records/actions)

- Generic lifecycle flows include URL Shortener plugin target: `implemented+tested (generic)`
- URL-Shortener-specific restart-persistence and available/blocked action truth matrix: `partially-implemented`

Evidence:

- `src/core/lib/__tests__/plugin-lifecycle-postgres.integration.test.ts`
- `src/core/db/plugin-lifecycle.ts`

## 11) Update

- Generic admin-triggered safe update contract exists and one URL-Shortener data-preservation proof exists: `implemented+insufficient-tests`

Evidence:

- `src/core/lib/plugin-safe-activation.server.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`

Gap:

- Missing broad URL-Shortener reference-proof update matrix (metadata verification, interrupted-update reconciliation, identity/settings/data preservation assertions).

## 12) Rollback

- Generic rollback evaluation/reconciler logic exists: `implemented+tested (generic)`
- URL-Shortener-specific rollback acceptance matrix: `missing`

Evidence:

- `src/core/lib/plugin-lifecycle-reconciler.server.ts`
- `src/core/lib/__tests__/plugin-lifecycle-reconciler.test.ts`

## 13) Recovery

- Generic recovery classification and checkpoint machinery exists: `implemented+tested (generic)`
- URL-Shortener-specific recovery-state representation and manual-intervention cases: `missing`

Evidence:

- `src/core/db/plugin-migration-checkpoints.ts`
- `src/core/lib/plugin-lifecycle-reconciler.server.ts`

## 14) Plugin Management truthful read model

- Generic plugin state model exists and is used by admin APIs/UI: `implemented+insufficient-tests`
- URL-Shortener-specific proof for identity/version/digest/source/trust/compatibility/desired-observed/lifecycle/rollback/recovery/actions+blocked-reasons: `partially-implemented`

Evidence:

- `src/core/db/plugins.ts`
- `src/app/api/admin/plugins/route.ts`
- `src/app/admin/plugins/page.tsx`

## 15) Security

- Unauthorized admin API access rejection: `implemented+tested`
- Redirect URL validation + unsafe protocol rejection + reserved prefix validation: `implemented+tested`
- Submission abuse constraints and stronger policy limits: `partially-implemented`
- Digest/trust failure handling exists mostly in generic canonical tests, not URL-Shortener-specific proof: `partially-implemented`

Evidence:

- `src/user/extensions/plugins/url-shortener/tests/url-shortener-api.test.ts`
- `src/user/extensions/plugins/url-shortener/tests/url-shortener-plugin-foundation.test.ts`
- `src/test/plugin-canonical-resolver.test.ts`

## 16) Required reference-plugin E2E coherence

- Existing E2E covers create/redirect/analytics/submissions moderation/disable-reenable retention: `implemented+insufficient-tests`
- Missing end-to-end coverage for update+restart+rollback+recovery+plugin-management truth integration: `missing`

Evidence:

- `e2e/url-shortener.spec.ts`

## Overall acceptance decision

Issue #100 is **not complete**. Current merged slice is a valid partial increment but does not satisfy the full acceptance matrix required for canonical URL Shortener reference-plugin proof.
