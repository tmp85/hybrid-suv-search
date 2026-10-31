# Independent research export

The export path for the 7 AM ChatGPT research is `independent/listings.json` in `tmp85/hybrid-suv-search`, branch `main`. A push to that path triggers the existing ingestion workflow. The workflow reads the checked-out file, merges it with Muse and retained history, validates the result, and publishes the canonical `data/inventory.json`. The public site reads that canonical dataset. The two sources share eligibility and ranking rules.

`schema.json` describes the version 1 contract. `normalizeIndependent` in `dist/inventory.js` also checks identities, real calendar dates, chronology, duplicate rows and evidence URLs. To validate a proposed export locally, run this from the repository root:

```sh
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {normalizeIndependent} from './dist/inventory.js'; console.log(normalizeIndependent(JSON.parse(readFileSync('independent/listings.json','utf8'))).length+' valid observations')"
node --test tests/independent.test.mjs tests/pipeline.test.mjs
```

## Exporter instructions

1. After completing the existing research report, create one JSON object with `schemaVersion: 1`, `source: "chatgpt-independent"`, `mode: "observations"`, a unique `runId`, the actual `generatedAt` export timestamp, the report's `reportDate` and a working `reportUrl`. Use the report date and original observation times even when exporting an older report. Export time never refreshes a listing's verification.
2. Set `writer.mode` to `scheduled` only for a real unattended scheduled execution. Interactive tests, historical imports and manual bootstrap exports use `one_time`. Include real `writer.automationId` and `writer.runUrl` when available; otherwise use `null`. Never invent scheduler metadata or mark an interactive test as scheduled.
3. Put the independently researched rows in `listings`. Each row needs year, model name, hybrid type (`HEV` or `PHEV`), numeric advertised price and mileage, city, state, original URL, `observedAt`, `priceBasis`, and `verification.status` plus an evidence note. Preserve actual fees separately; use `null` for unknown fees, not zero. Include known trim, drivetrain, seat rows, seller, notes and typed history claims. Do not invent VINs, ownership, service records or availability. A report with no new observations may export an empty array.
4. Supply a real VIN or a defensible vehicle-specific listing identity. Known direct listing routes are recognized automatically. If a recorded source uses an opaque identifier, `listingId` must exactly match a full path segment or query value in the recorded URL. This preserves identity without enabling an unverified direct-listing button. Never substitute search, homepage, or unrelated inventory URLs for vehicle evidence.
5. `ad_observed` means an ad was observed, not that the seller confirmed the vehicle remains unsold. Use `awaiting_verification` for unresolved evidence, `inaccessible` for a blocked fetch, and `not_found` for a failed lookup. Use `confirmed_unavailable` only when the source explicitly says sold/removed/unavailable; use `excluded` with concrete disqualifying evidence. Supply the original evidence URL and a specific note for either archived status. HTTP errors and disappearance alone never prove a sale.
6. Read the current GitHub file revision, validate the full payload, then atomically replace `independent/listings.json` with a GitHub commit using that revision as a concurrency check. Do not overwrite unrelated changes. If another writer wins the race, reread and retry without replacing a newer report with an older one. Retain an immutable copy under `independent/runs/<runId>.json` in the same commit if the writer supports multi-file commits. Do not put credentials in any export or report.
7. Read back the committed file and capture the commit URL. Confirm the triggered Actions run succeeds and the canonical dataset contains the run ID, independent source health and each exported row's reconciliation entry. Report a failure explicitly and retain the previous good export; do not claim successful publication merely because a chat response contains JSON.

Reports are partial observations. Missing rows are retained and age naturally; omission is never an instruction to stale or archive a cross-post. Each source's error and last successful import are recorded separately. Invalid or older exports preserve last known good data while Muse can continue updating. A retry with the same run ID must contain identical bytes; the runner compares SHA-256 hashes and rejects changed content under an existing run ID. Corrections require a new run ID and current export time. Later observation timestamps control conflicting facts; contemporaneous ambiguous quotes use evidence and a deterministic content tie-breaker, retain both prices and record a conflict. Discovery-agent identity never affects rank or tie-breaking.

## Connection and automation evidence

A valid file establishes a connected export feed. It does not prove the 7 AM task can write future exports. Health separately reports `exporterMode` as `not_connected`, `one_time`, `scheduled_unverified`, or `scheduled_verified`.

Only after observing a genuine unattended export, its GitHub commit, successful ingestion and public-site result may the integration owner record `independent/automation.json`:

```json
{
  "enabled": true,
  "verified": true,
  "automationId": "actual scheduler ID",
  "verifiedRunId": "actual unattended run ID",
  "verificationUrl": "https://example.com/actual-run-evidence"
}
```

These are placeholders showing the shape, not valid verification evidence. Do not copy this example as configuration. If scheduler metadata is unavailable, scheduled exports remain `scheduled_unverified`; ingestion still works. A one-time export always remains labeled `one_time`, including after an earlier scheduled run was verified. The exporter must not award itself verified status.
