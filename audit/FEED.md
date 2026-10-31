# Muse origin audit — 2026-10-31

The machine-readable source is https://tmp85.github.io/hybrid-suv-search/listings.json, published from https://github.com/tmp85/hybrid-suv-search/blob/main/listings.json.

Before changes, the live Pages JSON and raw main JSON were byte-identical: SHA-256 `c518865644a5870ef564fb20356df9e8cd89ec2be286c0dc34988504133a7631`. GitHub HEAD was `b753755b94cb3916e6447ae16cb9fbd9a8d4459b`, committed 2026-10-31 14:14:01 UTC / 07:14:01 Phoenix. Pages Last-Modified was 14:14:46 UTC and its deployment succeeded at 14:14:49 UTC: https://github.com/tmp85/hybrid-suv-search/actions/runs/41209177371.

The JSON held 27 unique VINs: 16 observations dated October 31, 10 dated October 23, and one dated October 20. Every row had `verified_active: true`, so that flag alone did not establish current availability. Its report date was October 31. The previous October 30 feed contained 31 VINs. Four absent records were retained in historical data; two have reported explicit unavailable messages, one has a reported manufacturer-buyback badge, and one only redirects and therefore remains stale.

The HTML report held 21 same-day rows. Five of those were intentionally absent from JSON because Muse's contract exported only known VINs. The pipeline now parses the strictly validated, dated nine-column “All verified-active listings today” table as a Muse supplement, merging by a vehicle-specific marketplace ID and retaining the source URL. These are original CarGurus advertisements:

| Listing ID | Vehicle | Price | Mileage |
|---|---|---:|---:|
| 461421102 | 2018 Lexus RX 450h, Van Nuys | $22,641 | 114,653 |
| 454350256 | 2021 Highlander Hybrid LE, Santa Monica | $26,161 | 82,372 |
| 461261274 | 2018 RX 450h F Sport, El Monte | $26,499 | 95,194 |
| 458376264 | 2019 Highlander Hybrid XLE, Huntington Beach | $28,944 | 79,627 |
| 458285167 | 2021 Highlander Hybrid XLE, Covina | $29,500 | 83,952 |

The Santa Monica Highlander has one reported accident, rental use and three owners; those caveats are retained. The Van Nuys Lexus exceeds the preferred 100,000-mile limit but is retained for browsing. The JSON's smaller crossovers remain outside the midsize qualifying inventory. Unknown title evidence is not promoted to clean title.

The original repository had only README.md, index.html and listings.json; no ingestion workflow existed. Its only GitHub Actions workflow was the dynamic Pages deployment. Observed source commits varied between morning and late evening, so the new workflow reacts to feed pushes as well as two daily schedules; scheduled start times are not guaranteed by GitHub.

Canonical bootstrap uses the nine retained independent research vehicles, the October 26 structured Muse snapshot, and the last October 30 structured feed from commit `f53769e86cf06d9a357dc70368c925e94714f999` (dist/muse-prior-snapshot.json). This retains all four records removed by October 31, including a late-discovered Camelback Kia record absent from the older snapshot. The earlier anonymous October 23 HTML snapshot remains recoverable as dist/muse-snapshot.js; it is not republished as duplicate canonical vehicle records. Discovery agents and all original URLs remain attached to merged records.

No independently verified daily ChatGPT export/feed was found in this repository. The October 15 independent research and two one-time October 31 direct-seller observations are retained historical evidence, not proof of an automatic independent research pipeline.
