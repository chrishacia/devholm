# Baseline Failures And Exceptions

This inventory exists so DevHolm does not normalize vague statements like "known baseline" or "unrelated flake" without evidence.

## Accepted failures

None.

## Documented exceptions

| Item                                              | Current status              | Reason                                                                                                                                                  | Owner / tracking         | Blocks completion                                                       | Expected resolution                                                                          | Evidence                                                                    |
| ------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `e2e/url-shortener.spec.ts` non-chromium projects | Documented intentional skip | The scenario mutates shared plugin enablement state and is validated deterministically in chromium only while the full E2E suite still runs separately. | This stabilization issue | No, if `pnpm test:e2e:url-shortener` and `pnpm test:e2e:full` both pass | Remove the browser-specific skip after plugin enablement can be isolated per browser project | `test.skip(browserName !== 'chromium', ...)` in `e2e/url-shortener.spec.ts` |

## Inventory rules

- Every accepted exception must name the exact test or job.
- Every accepted exception must identify who owns the fix and what evidence justifies the temporary state.
- Rerun-only success must be recorded here or resolved before closeout.
