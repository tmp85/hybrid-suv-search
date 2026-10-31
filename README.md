# hybrid search

Public dashboard: <https://hybrid-suv-search.tmp85.chatgpt.site/>

Data repository: <https://github.com/tmp85/hybrid-suv-search>

Workflow: [Refresh Hybrid Search inventory](https://github.com/tmp85/hybrid-suv-search/actions/workflows/daily-ingestion.yml)

This is the existing static dashboard, with a persistent daily inventory pipeline. `.openai/hosting.json` preserves Site `appgprj_6ad13a6258a481918fbd0cafc457f5e0` and its `dist/` deployment directory. UI changes are published through Sites; ordinary inventory updates require no new Sites deployment or Sites credentials in GitHub Actions.

## Data flow and schedule

`scripts/ingest.mjs` reads Muse's current [`listings.json`](https://raw.githubusercontent.com/tmp85/hybrid-suv-search/main/listings.json) from the GitHub origin and compares its hash with the [GitHub Pages feed](https://tmp85.github.io/hybrid-suv-search/listings.json). It supplements missing entries from the origin's dated HTML listings table only when that table passes its date, count, and identity checks. GitHub Pages lag is recorded rather than mistaken for origin freshness.

The workflow validates and merges the data, retains original links, discovery agents and price observations, checks eligible direct seller URLs, then commits `data/inventory.json`, `data/health.json`, a recoverable previous inventory, and the packaged `dist/inventory.json`. The dashboard fetches the [published inventory](https://raw.githubusercontent.com/tmp85/hybrid-suv-search/main/data/inventory.json) on opening and every five minutes. If fetching fails, it uses its saved browser or packaged data and displays the failure. Notes, favorites, and personal decisions remain browser-local; use Export for backups or device transfer.

The GitHub workflow is configured for **8:17 AM America/Phoenix daily**, with a later **11:47 AM retry**. Arizona is UTC−7 year-round; the corresponding UTC times are 15:17 and 18:47. Eligible source/code commits and manual dispatch also trigger it. GitHub schedules run from the default branch and can be delayed or skipped during service load; these times are targets, not delivery guarantees. The workflow must be installed and enabled on `main` for scheduling to take effect.

**Muse ingestion is automated once the workflow is enabled. ChatGPT's independent daily narrative research is not connected to a verified export feed.** Historical independent observations remain attributed and dated. Neither ingestion nor a scheduled narrative implies an automated Facebook search, seller confirmation, or fresh title verification.

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

## Acceptance record

Baseline evidence and historical counts are in [audit/BASELINE.md](audit/BASELINE.md). They must not be quoted as today's available inventory.

The release owner must record the following against actual public URLs and workflow run IDs before declaring the production integration complete:

- [ ] Current Muse origin records appear in the deployed dashboard; every source ID has a reconciliation disposition.
- [ ] Shared ranking handles equivalent Muse and independent records identically.
- [ ] Confirmed unavailable/excluded records disappear from active results; stale and inaccessible records are not called sold.
- [ ] Original-listing buttons resolve to the intended vehicle advertisements or accurately disclose unavailable/inaccessible evidence.
- [ ] Two end-to-end workflow runs succeed, including `test_update`, and published data changes are observed on the public Site.
- [ ] A fresh browser session verifies the deployed interface, counts, health, source filters, and links.
- [ ] The workflow is enabled on `main`, both scheduled times are present, and the next expected run is reported with GitHub's scheduling limitation.
- [ ] The handoff identifies ChatGPT independent research as unconnected and lists any remaining access or verification blockers.

Unchecked items are pending verification, not implied successes.
