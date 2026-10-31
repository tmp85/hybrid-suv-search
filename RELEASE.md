# Hybrid Search production verification — October 31, 2026

The existing public dashboard is deployed as Sites version 7 at https://hybrid-suv-search.tmp85.chatgpt.site/. Muse ingestion is automated and demonstrated end to end. The full two-agent integration remains incomplete because independent ChatGPT reports have no verified machine-readable export.

## Deployment and workflow evidence

- Site source commit: `fb07e802980ad796bce4665ddaf98fd2c5dbe838`; deployment `appgdep_6ae62c755d00819183254922c623364f` succeeded at 17:59:23 UTC.
- Data repository: https://github.com/tmp85/hybrid-suv-search
- Workflow: https://github.com/tmp85/hybrid-suv-search/actions/workflows/daily-ingestion.yml
- Run 1, source-push trigger: https://github.com/tmp85/hybrid-suv-search/actions/runs/41227085705 — succeeded at 17:58:37 UTC.
- Run 2, manual `test_update=true`: https://github.com/tmp85/hybrid-suv-search/actions/runs/41227200127 — succeeded at 18:00:12 UTC.
- Run 2 persisted `testUpdate.passed=true`, using an isolated one-dollar price change through the merger. Published vehicle prices remain those of the actual live feed.
- A new public browser tab displayed the run-1 update at 10:58:28 AM Arizona. After run 2, the same deployed version displayed 11:00:03 AM Arizona without another Site deployment. Raw GitHub's CDN delayed this metadata refresh by several minutes; open pages retry every five minutes.
- GitHub reports workflow state `active`. Next configured occurrence: October 31 at 11:47 AM America/Phoenix; then November 1 at 8:17 AM. GitHub scheduling may delay or skip runs. Source-push triggers cover Muse updates outside those times.

## Before and after

| Measure | Before | After |
|---|---:|---:|
| Public dashboard retained records | 51 | 81 |
| Default shortlist visible cards | 16 | 19 |
| Fresh active records (new evidence states) | Not distinguished | 21 |
| Stale records | Not distinguished | 48 |
| Archived records | Mixed personal/source status | 12 |

The 81 records include retained historical discoveries. This is not a claim of 81 available vehicles. Of 21 active records, two exceed the default 100,000-mile preference. Ten retained records are outside the configured price/region/segment rules, overlapping stale/archive totals. The active qualifying board with default filters contains 59 fresh or stale leads; the shortlist contains 19 recent candidates. Older anonymous October 23 report rows remain in the source snapshot instead of being duplicated on the canonical board.

## Source reconciliation

The October 31 JSON origin contains 27 unique VINs. Its SHA-256 equals the public Pages feed: `c518865644a5870ef564fb20356df9e8cd89ec2be286c0dc34988504133a7631`.

The dated HTML report adds five vehicle-specific CarGurus IDs absent from that JSON: `461421102`, `454350256`, `461261274`, `458376264`, `458285167`. All 32 current source records are present in the public website's exported 81-record workspace. No source record is missing. Twenty-seven current source records appear on the default qualifying board; the other five have explicit filter/criteria reasons in `audit/acceptance.json`. The published dataset contains per-source ID to vehicle-ID reconciliation.

The website's Export action was exercised and its actual JSON was compared against the current origin and run-2 dataset. Ranking invariance was checked for every exported vehicle after changing only discovery-agent attribution. All 45 local tests passed, including 13 pipeline tests also executed in both GitHub workflow runs.

## Browser and availability checks

- Public UI: title, source filter, shared scores, direct listing buttons, health panel, export, archive, stale labels and price-drop badges verified in a newly opened tab. No browser console errors observed. Existing browser data migrated to the canonical 81 records while preserving personal fields.
- Confirmed-unavailable Irvine VIN `KNDRHDLG0P5187947` returned no active-board results, remained in Archive, and had its original-listing button disabled.
- Temecula VIN `KNDRHDLG0P5189018`, with a redirect/restricted check, remained stale and kept its recorded direct URL. It was not called sold.
- The Venza button opened the correct dealer advertisement in a separate browser tab: VIN `JTEAAAAH6NJ101083`, 64,180 miles, $23,899 plus $85 documentation = $23,984. Peoria's original dealer matched VIN/title in direct HTTP checking. Detailed evidence is in `audit/LINKS.md`.
- Automated source checks confirmed neither every seller advertisement nor every title history. Restricted pages remain unresolved. Link syntax/embedded VIN validation is complete; full live destination verification is limited by those restrictions.
- Fresh-page verification was completed in a new tab, including migration of the browser's earlier stored dataset. A separate storage-isolated/incognito browser session was not available through the tool.

## What is and is not automatic

| Source/process | Status |
|---|---|
| Muse JSON from GitHub origin | Automated daily, retry, and source-push ingestion; hash compared with Pages |
| Muse HTML-only listing supplement | Automated, strict matching-date and row-count validation |
| Direct seller availability rechecks | Automated best effort; restricted/not-found responses stay unresolved |
| Published persistent inventory | Automated GitHub commits; Site loads it without republishing |
| ChatGPT independent 7 AM narrative research | Reports exist, but no verified feed/export/writer; not automated into this website |
| Historical ChatGPT research and today's direct audit | Retained dated observations, not a daily independent feed |
| Hermes/manual/browser observations, Facebook searches | No automatic connected feed |

Failure alerts use GitHub job warnings, failed health steps, artifacts and the website health panel. No separate email/chat notification service was installed; GitHub account notification settings control delivery. A new source outage preserves last-good vehicles and last-success dates. A failed or skipped workflow is visible through Actions and eventually a stale update warning on the public site.

## Maintenance and recovery

Use the repository README for full commands. Run the workflow manually through Actions or `gh workflow run daily-ingestion.yml --repo tmp85/hybrid-suv-search --ref main`. Run with `-f test_update=true` to exercise the isolated price-update test. Recover from `data/inventory.previous.json`, Git history, or a 30-day workflow artifact, validating the recovered data and retaining its original dates before publishing. UI rollback uses prior saved Sites versions.

Do not describe the entire two-agent system as fully automatic until a real independent research export is implemented and exercised. Do not describe blocked advertisements as confirmed available or sold.
