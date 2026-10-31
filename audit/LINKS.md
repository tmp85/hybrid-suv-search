# Direct listing audit — October 31, 2026

Read-only HTTP checks completed around 10:50 AM America/Phoenix (17:50 UTC). No sellers were contacted. A live advertisement establishes that the ad is displayed, not that the vehicle remains unsold. The checks did not bypass access restrictions.

| Vehicle / VIN | Exact retained URL | Result | Safe interpretation |
|---|---|---|---|
| 2022 Toyota Venza LE / JTEAAAAH6NJ101083 | https://www.iemotorsdirect.com/pre-owned-cars/detail/2022-Toyota-Venza/1588507 | HTTP 200, no redirect, correct year/model and VIN in page | Direct advertisement verified. Current displayed total is $23,984: $23,899 vehicle price plus $85 documentation. Mileage is 64,180. The existing seed's $24,484 is outdated. |
| 2022 Kia Sorento Hybrid S / KNDRGDLG3N5107069 | https://www.autonationchevroletarrowhead.com/used-Peoria%2B%2B-2022-Kia-Sorento%2BHybrid-S-KNDRGDLG3N5107069 | First request HTTP 200, no redirect, correct vehicle and VIN in title/body; a later request without the audit user-agent received HTTP 403 | Direct advertisement was observed in this audit. Intermittent access restrictions do not establish unavailability. No independently audited price override. |
| Same Peoria Sorento / KNDRGDLG3N5107069 | https://www.edmunds.com/kia/sorento-hybrid/2022/vin/KNDRGDLG3N5107069/?radius=50 | HTTP 403 | Current request inaccessible; retain attributed Muse observation, do not mark sold. |
| 2023 Kia Sorento Hybrid EX / KNDRHDLG6P5204248 | https://www.cargurus.com/details/451663169 | HTTP 403 | Current request inaccessible; URL retains marketplace listing ID, but this audit cannot independently confirm the rendered advertisement. |
| 2024 Mazda CX-90 PHEV / JM3KKDHA8R1150573 | https://www.tuttleclickmazda.com/used/Mazda/2024-Mazda-CX-90-PHEV-irvine-ca-faeb2743ac18003fe20877a2be018538.htm?edmcid=1995368&edminv=JM3KK_DHA8R1150573&utm_content=JM3KKDHA8R1150573 | HTTP 403 | Current request inaccessible, not proof of sale or removal. |
| Archived 2023 Kia Sorento Hybrid / KNDRHDLG0P5187947 | https://www.kiaofirvine.com/viewdetails/cpo/kndrhdlg0p5187947/2023-kia-sorento-hybrid-sport-utility?type=cash | HTTP 200 after redirect to https://www.kiaofirvine.com/inventory/cpo?vehicleStatus=unavailable; target VIN absent | Explicit dealer unavailable signal. Keep archived history; do not infer sold. |

The Venza dealer describes the displayed total as including documentation, electronic filing, and emissions testing. Taxes, registration, government charges, smog-certificate fees, and financing are excluded. Its current ad does not independently establish clean title, maintenance history, battery health, or unsold status.

## Link-selection findings

- `directListingUrl` currently qualifies URL syntax and any embedded VIN. That alone is not a live destination check. The page should distinguish a retained direct link from a recently verified advertisement.
- `originalListing` initially prioritizes the source associated with old photos. Prefer a source with recent successful vehicle-specific verification, retaining other original URLs in history.
- Inventory/search URLs (including six iSeeCars search links and the Carson City Hyundai search page in the October 31 JSON) must not become direct listing buttons merely because their associated record has a VIN.
- AutoTrader and Cars.com should receive marketplace tags rather than the generic Dealer fallback.
- The Venza page contains CAPTCHA words in ordinary contact forms while the advertisement is fully readable. A bare CAPTCHA substring is not sufficient to classify a page as an access challenge.

## Ranking assessment

Use the same deterministic scoring function for all discovery agents. Give documented title/condition and service evidence meaningful weight; reward lower mileage and good price within the requested budget; add a small AWD bonus. Treat unknown evidence neutrally or conservatively, never as a clean history. Fresh verified evidence should rank ahead of stale or unresolved evidence. Disqualified and confirmed-unavailable records must be absent from the active board regardless of their score or a browser-local shortlist decision.

Without a sourced, maintained model-reliability dataset, avoid invented reliability percentages, projected remaining years/miles, or brand-based numeric bonuses. Mileage, age, documented maintenance, condition, and known unresolved issues are transparent screening proxies, not a mechanical inspection or a remaining-life prediction. Show the score components and this limitation. A unit test should change only the agent attribution and prove the score is identical.

## Verification limits

These are representative checks, not a claim that every marketplace advertisement currently renders. The blocked pages above require an ordinary accessible browser or later authorized recheck. No blocked or missing-search result was treated as sold. A separate fresh-browser deployment check remains the owning agent's responsibility.
