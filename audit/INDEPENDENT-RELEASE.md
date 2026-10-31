# Independent research integration — October 31, 2026

The existing 7 AM ChatGPT research task now exports a real feed to `independent/listings.json` in `tmp85/hybrid-suv-search`. The same GitHub workflow merges it with Muse, preserves history, and publishes the data consumed by the existing public dashboard. No duplicate research task or new service was created.

## Scheduler and publication proof

- Existing automation: `6acc0c049d908191bdd620f519aee69c`; daily **07:00 America/Phoenix**, unchanged. Next daily research run: November 1, 2026 at 07:00 Arizona / 14:00 UTC.
- Original research chat: [Schedule SUV search reports](https://chatgpt.com/c/6acc0bf1-5fc8-83e8-9f58-0b52b72d9852). It reports the actual scheduler invocation and preserved settings. The scheduler did not return a separate run URL.
- Actual scheduler run: `dff15bb6-e128-8325-b70e-460eb29674a5`.
- [Scheduled export commit](https://github.com/tmp85/hybrid-suv-search/commit/8dd1c1bc741847e87e8c5409fe5f4b3b237e9973): nine observations, run ID `chatgpt-scheduled-dff15bb6-e128-8325-b70e-460eb29674a5`, writer mode `scheduled`; immutable copy under `independent/runs/`.
- [Automatically triggered ingestion passed](https://github.com/tmp85/hybrid-suv-search/actions/runs/41229777526).
- [Production isolated update test passed](https://github.com/tmp85/hybrid-suv-search/actions/runs/41229893218), without publishing its invented test price.
- All 55 local tests passed, including 10 independent-source tests. Invalid feeds, replayed older exports, partial-report omissions, duplicate identities and source-neutral quote handling were exercised.

## Public website verification

The Site was deployed at 18:26 UTC before the first export commit. Its existing remote-data loader subsequently imported the actual one-time and scheduled exports without another Site deployment. An already-open page changed from 81 to 83 records automatically. A fresh tab then loaded the scheduled dataset with 84 records. Public GitHub caching and the page's five-minute refresh can delay visible updates.

The website's own JSON export at **18:36:27 UTC** was compared with the scheduled feed and canonical inventory: **all nine source identities reconciled, zero missing**, with recorded prices and history preserved. See [machine-readable acceptance](independent-acceptance.json).

| Count | Before | After scheduled export |
|---|---:|---:|
| Retained vehicles | 81 | 84 |
| Active / awaiting verification | 21 | 22 |
| Stale / needs recheck | 48 | 49 |
| Archived / excluded | 12 | 13 |

The nine observations comprise six matches to existing vehicles and three independent additions: Highlander VIN `5TDJGRFH0JS041065`, Santa Fe VIN `5NMP24G17SH062657`, and Highlander VIN `5TDGARAH2NS511637`. The last is excluded because mandatory fees put it over budget. The Santa Fe remains awaiting verification; its opaque Craigslist URL is preserved as evidence but its original-listing button stays disabled. No evidence was upgraded merely because export or ingestion succeeded.

## Operation and recovery

Both Muse ingestion and the 7 AM independent exporter are automated. Feed commits trigger ingestion immediately; GitHub also runs it at 08:17 Arizona and retries at 11:47. The public dashboard refreshes on opening and every five minutes. GitHub schedules and public caches may delay updates.

Use [Data health and workflow runs](https://github.com/tmp85/hybrid-suv-search/actions/workflows/daily-ingestion.yml) to inspect failures. Rerun with the workflow's Run workflow control. A failed source preserves its last successful records and does not cancel the other source. Partial independent reports never imply that omitted vehicles were sold. Recover from `data/inventory.previous.json`, Git history or the 30-day workflow artifacts; validate before restoring. Keep exporter changes within [the schema and guide](../independent/README.md), preserve actual observation times, and never put credentials into a task prompt or feed.

The verification receipt in `independent/automation.json` was created only after the actual scheduled export, successful ingestion and public-site reconciliation. Future failures remain visible in source health. Seller-confirmed availability, complete vehicle history and mechanical condition are separate evidence checks, not guarantees of the automation.
