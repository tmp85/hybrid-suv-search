# hybrid search

Public dashboard: <https://hybrid-suv-search.tmp85.chatgpt.site/>

Data repository: <https://github.com/tmp85/hybrid-suv-search>

Workflow: [Refresh Hybrid Search inventory](https://github.com/tmp85/hybrid-suv-search/actions/workflows/daily-ingestion.yml)

This is the existing static dashboard, with a persistent daily inventory pipeline. `.openai/hosting.json` preserves Site `appgprj_6ad13a6258a481918fbd0cafc457f5e0` and its `dist/` deployment directory. UI changes are published through Sites; ordinary inventory updates require no new Sites deployment or Sites credentials in GitHub Actions.

## Data flow and schedule

`scripts/ingest.mjs` reads Muse's current [`listings.json`](https://raw.githubusercontent.com/tmp85/hybrid-suv-search/main/listings.json) from the GitHub origin and compares its hash with the [GitHub Pages feed](https://tmp85.github.io/hybrid-suv-search/listings.json). It supplements missing entries from the origin's dated HTML listings table only when that table passes its date, count, and identity checks. GitHub Pages lag is recorded rather than mistaken for origin freshness.

The workflow validates and merges the data, retains original links, discovery agents and price observations, checks eligible direct seller URLs, then commits `data/inventory.json`, `data/health.json`, a recoverable previous inventory, and the packaged `dist/inventory.json`. The dashboard fetches the [published inventory](https://raw.githubusercontent.com/tmp85/hybrid-suv-search/main/data/inventory.json) on opening and every five minutes. If fetching fails, it uses its saved browser or packaged data and displays the failure. Notes, favorites, and personal decisions remain browser-local; use Export for backups or device transfer.

The GitHub workflow is configured for **8:17 AM America/Phoenix daily**, with a later **11:47 AM retry**. Arizona is UTC−7 year-round; the corresponding UTC times are 15:17 and 18:47. Eligible source/code commits and manual dispatch also trigger it. GitHub schedules run from the default branch and can be delayed or skipped during service load; these times are targets, not delivery guarantees. The workflow must be installed and enabled on `main` for scheduling to take effect.

Muse ingestion is automated. The independent feed is [`independent/listings.json`](independent/listings.json), validated against the [export contract](independent/README.md). A commit to this feed automatically triggers ingestion; Actions reads its checked-out copy to avoid CDN lag. Independent reports are partial observations: omitted vehicles retain their earlier evidence and age normally. Malformed or stale exports are flagged without dropping the last known good records.

The initial October 31 independent feed is a **one-time export** of two genuine discoveries from the 7 AM report. Scheduled publication is not verified merely by having a feed or changing the task prompt. The health panel separately reports the feed's import status and the writer's automation status. [Prepared task instructions](independent/task-prompt.txt) preserve the existing 7 AM America/Phoenix research schedule and request a real scheduler-run test. Neither ingestion nor a scheduled narrative implies seller confirmation or fresh title verification.

## Status and ranking

| State | Meaning and board behavior |
|---|---|
| Verified active | A recent attributable ad observation supports the vehicle's identity. Displayed as a candidate; unsold status and mechanical condition still require confirmation. |
| Newly discovered / awaiting verification | A retained lead lacks sufficient direct or recent verification. Browsable with that limitation. |
| Stale / requires recheck | Evidence is over seven days old, the source omitted the vehicle, or a request was blocked, redirected, or inconclusive. Kept for recheck; never automatically called sold. |
| Confirmed unavailable | Explicit vehicle-specific unavailability evidence exists. Removed from active results, with history retained. |
| Excluded | Documented disqualifying history, such as a manufacturer buyback, exists. Removed from active results, with the reason retained. |

A personal shortlist choice cannot override a documented archive or exclusion. HTTP 403/429, a missing search result, or a generic redirect is not proof of a sale. The pipeline does not bypass access challenges. `data/verification-overrides.json` records reviewed corrections with source URL, date, and reason; use it for evidenced corrections rather than editing generated inventory by hand.

Every discovery agent uses the same ranking function in `dist/inventory.js`. It scores mileage, price, age, recorded history, documented maintenance, availability evidence, and an AWD bonus. Age and mileage are approximate remaining-life indicators; this is not a validated brand-reliability model, battery diagnosis, or lifespan prediction. Unknown documentation earns no documentation bonus. Price-drop badges require comparable observations for the same listing and price basis; conflicting simultaneous quotes are not treated as reductions.

The health counts describe retained records: **active/new** excludes stale and archived; **stale** and **archived** are separate totals. `qualifyingActive` additionally applies the price, region, hybrid, and midsize rules. UI filters can reduce visible cards further. A qualifying lead is not a guarantee of clean title; reported history remains attributed evidence.

## Manual run and checks

In GitHub, open the workflow link above, choose **Run workflow**, select `main`, and optionally enable `test_update`. With an authenticated GitHub CLI:

```sh
gh workflow run daily-ingestion.yml --repo tmp85/hybrid-suv-search --ref main
gh workflow run daily-ingestion.yml --repo tmp85/hybrid-suv-search --ref main -f test_update=true
gh run list --repo tmp85/hybrid-suv-search --workflow daily-ingestion.yml --limit 5
gh run watch RUN_ID --repo tmp85/hybrid-suv-search --exit-status
```

`test_update` exercises an isolated one-dollar price change through the merger and validates its history. It records the test result but publishes the actual live price, never the invented test price.

From this checkout, Node 22 is sufficient; no dependency installation or framework build is needed:

```sh
node --test tests/*.test.mjs
node scripts/ingest.mjs
node scripts/ingest.mjs --test-update
```

Local ingestion changes generated files but does not itself publish a GitHub commit or deploy the Site. `--skip-checks` skips direct seller requests for debugging; it must not be presented as a completed availability check.

## Failure handling and recovery

Source requests retry three times with bounded timeouts. Workflow concurrency serializes ingestion runs, atomic writes prevent partial JSON, and dataset validation runs before publication. A source failure preserves the last known good vehicle records and records the failed attempt. Missing source records remain stale rather than being deleted.

The workflow warns when the Muse report is over 48 hours old or its imported count falls by more than 35%. It publishes retained data and health before failing the job for degraded source health. Failed jobs appear in GitHub Actions; enable GitHub Actions notifications for this repository if email alerts are desired. No separate email or chat notification service is configured.

For a failure, inspect the run summary and `data/health.json`, fix the reported source/schema/access problem, and rerun. Do not replace a healthy dataset with an empty response or reset source dates to make an old feed appear current.

Recovery options, in order:

1. Use `data/inventory.previous.json` for the immediately preceding validated dataset. Validate it before replacing `data/inventory.json`, copy the same recovered content to `dist/inventory.json`, and commit the recovery on `main`.
2. Use Git history for an older good data commit when the immediate previous dataset is also degraded. Restore the inventory and matching health files together, preserving their original timestamps and provenance.
3. Download the workflow's `hybrid-search-inventory-RUN_ID` artifact. Run data artifacts are retained for 30 days and include current/previous inventory plus health.

After recovery, rerun ingestion, review its alerts and reconciliation, and open the public dashboard in a fresh browser session. Existing open sessions refresh within five minutes. For a UI regression, restore a previous saved Sites version; that is separate from restoring GitHub inventory data. Export browser notes before resetting browser storage.

## Acceptance record — October 31, 2026

Muse ingestion and public data refresh are deployed and demonstrated. Two GitHub Actions runs succeeded, including the isolated test update. The public site loaded all 27 current JSON records plus five valid HTML-only records. Its exported inventory reconciles all 32 with zero missing. All 45 local tests passed.

The independent feed and its automatic downstream ingestion are being connected. The 7 AM writer must pass an actual scheduled-run test before it can be called fully automatic. Some seller pages restrict live checks, and a new browser tab was tested rather than a separate storage-isolated browser profile. These limits are explicit in the release record.

See [RELEASE.md](RELEASE.md) for run links, counts, source status, browser verification, next schedule, and remaining blockers. Per-record source reconciliation is in the [published inventory](https://raw.githubusercontent.com/tmp85/hybrid-suv-search/main/data/inventory.json).
