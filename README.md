# Signal Commons India

A public, source-linked relay for Indian disaster alerts. The browser reads alert entities directly from Arkiv's Tiramisu testnet; the ingestion script reads the NDMA SACHET public RSS and linked CAP XML feed and writes short-lived entities. This is an independent project and is not an official NDMA service.

The homepage monsoon landscape is a generated illustration, labelled as such in the UI. It is not a live weather map or evidence of a specific event. Warning facts come only from the linked CAP records.

## Status

- The public feed parser and CAP parser work against the live SACHET feed.
- Browser and CLI Arkiv queries work against Tiramisu.
- A dedicated signing wallet has been generated locally. It needs **free Tiramisu test GLM** before the first alert can be published on Arkiv. No real money or mainnet assets are required. Until then, the UI truthfully shows an empty Arkiv dataset. Do not claim a finished hackathon submission before this is done.
- The public source repository is [BlackBeanEagles/signal-commons-india](https://github.com/BlackBeanEagles/signal-commons-india). The web app is deployed at [GitHub Pages](https://blackbeaneagles.github.io/signal-commons-india/). The site will show an honest empty state until the first Arkiv write. It has not yet been submitted to Devfolio.

## Requirements

Node.js 24+, npm, and a Tiramisu wallet funded with free test GLM for publishing. Never paste a private key into a chat, commit, screenshot, or submission form.

## Quick start

```powershell
npm install
npm run inspect-feed
npm run ingest:dry-run
npm run query
npm run verify
npm run dev
```

Open the printed local URL. `npm run query` is an independent Arkiv reader: it uses the published schema and does not depend on the website. For a compound indexed query try `npm run query -- --severity Severe --valid-for-minutes 60 --creator 0xYOUR_PUBLISHER_ADDRESS`. `npm run verify -- 0xYOUR_PUBLISHER_ADDRESS` compares each live entity's stored CAP digest with the source's current bytes; a changed source is reported separately from an unavailable source.

The static public site is built with `npm run build` and published from the `gh-pages` branch. It has no app backend: visitors query Arkiv directly. The tracked `master` branch contains source; `gh-pages` contains built static assets.

After an online visit, the service worker saves the static app shell for a later offline revisit. A successful Arkiv query saves up to 100 public alert records in that browser. If a later query fails, the app shows only saved alerts whose stated CAP expiry is still in the future, marks every card **Saved copy · unverified now**, and shows the last successful query block and sync time. It does not claim that cached alerts are currently on Arkiv or still valid at the source; cancellations and revisions require a fresh read. This fallback has no push delivery and cannot replace official emergency channels. Clearing site storage removes the saved copy.

## Publish real public alerts to Tiramisu

1. Fund a dedicated wallet through the [Arkiv faucet](https://hub.arkiv.network/faucet) with **test GLM only**. The generated local publisher address is `0xA455b84a4433d42E09cC6c16095B5e5270D6906D`. Do not send real assets to it. If starting from a fresh clone, run `npm run wallet:generate` to create your own dedicated wallet and ignored `.env.local`; this refuses to overwrite an existing key.
2. Confirm that `.env.local` contains `ARKIV_PRIVATE_KEY` and `VITE_TRUSTED_CREATORS` locally. Keep the key **only in that ignored local file**. Optional: set `MAX_ALERTS=10`. Run `npm run ingest:dry-run` first; it fetches live source data and makes no Arkiv writes.
3. Run `npm run ingest`. This reads the all-India RSS feed, follows each CAP link, skips expired or non-actual items, and creates Arkiv entities sequentially. The script prints each transaction hash and entity key, not the key.
4. Set `VITE_TRUSTED_CREATORS` in `.env.local` to the publisher's public address, restart `npm run dev`, and run `npm run query` to verify records. Or enter the public address in the UI's Publisher wallet field. The creator field identifies the relay wallet; it does not certify a government authority.

The importer caches RSS and CAP ETags under ignored `.cache/` to avoid unnecessary downloads. It also records each successful creation's public transaction hash and entity key in `.cache/transactions.json` so evidence survives alert expiry. This file contains no key or personal data. It validates that CAP URLs remain on the SACHET HTTPS hostname. It is designed to be run repeatedly, but publishing should be monitored; alerts can be revised or cancelled at the source. It attempts to remove relayed alerts referenced by CAP cancellations and displays the latest revision per RSS GUID. The full source lifecycle still needs field testing, so **do not use this prototype as an emergency decision service**.

## What to reproduce

1. Run `npm run inspect-feed` to observe live RSS/CAP fields.
2. Run `npm run ingest` with a funded publisher wallet. Note the printed public wallet address and transaction hash.
3. Run `npm run query` to reproduce the Arkiv query independently of the web app.
4. Open the app, enter the publisher's public address, and refresh. The app runs the same indexed query with an immutable `$creator` filter.
5. Run `npm run verify -- 0xYOUR_PUBLISHER_ADDRESS`, open a card's source bulletin and publisher explorer link, and compare the CAP expiry with the Arkiv entity lifetime.

Entity types, attributes, and queries are in [`arkiv/schema.md`](arkiv/schema.md). Actual Arkiv integration observations are in [`arkiv/friction.md`](arkiv/friction.md).

## Trust and privacy

Arkiv's `$creator` proves which wallet published a relay entity. It does not prove that the wallet is a government authority or that the source's claim is true. The original SACHET bulletin remains linked. District and hazard filters run in the browser; the saved district, publisher wallet, and public alert snapshot are in browser localStorage only. Searching without a publisher filter still reveals the Arkiv RPC used by the browser. The app does not put resident identities, subscriptions, private keys, or reports on Arkiv.

Follow official instructions at [NDMA SACHET](https://sachet.ndma.gov.in/) for safety decisions. Alert relaying can lag, and the testnet or app may be unavailable.

## Source and acknowledgement

Source: [NDMA SACHET public CAP/RSS alerts](https://sachet.ndma.gov.in/). The RSS feed identifies its content as public domain. This app is independent and displays source links and issuer names as supplied by the CAP bulletin. It does not imply NDMA endorsement. Built for the [Arkiv Global Tour Stop](https://github.com/Arkiv-Network/global-tour-stop-pre-devcon) challenge between 9 and 18 October 2026. No pre-existing project components are claimed.
