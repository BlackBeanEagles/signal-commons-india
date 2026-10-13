# Arkiv friction report — Signal Commons India

This file records tested behaviour, not invented SDK defects. Add each real issue encountered during the remaining build, with version, exact steps, expected and actual result, and a suggested improvement.

## 1. Browser RPC connectivity

- Surface: Tiramisu public JSON-RPC; `@arkiv-network/sdk` 0.8.1; Node.js 24; Vite 7.
- Steps: Send `eth_chainId` to `https://rpc.tiramisu.db-chain.testnet.arkiv.network`; send an OPTIONS preflight with origin `http://localhost:5173` and `Access-Control-Request-Method: POST`; load the Vite app and run its alert query.
- Expected: chain ID `7738577`, browser CORS permission, and a query result.
- Actual on 13 October 2026: `eth_chainId` returned `0x7614d1`; preflight returned `204` and `Access-Control-Allow-Origin: *`; the app fetched an Arkiv page at block `520009` with zero matching project entities. Zero is expected before a publisher writes them.
- Improvement: none requested; this path worked. A public example demonstrating direct browser queries with an empty-result state would help new builders.

## 2. SDK payload-decoding typing

- Surface: `@arkiv-network/sdk` 0.8.1 TypeScript types, `select()` results.
- Steps: Select `{ payload: true }`, then call `entity.payload.toJson()` in a strict TypeScript Vite build.
- Expected: the payload bytes themselves might expose the documented JSON helper.
- Actual: TypeScript reported `Property 'toJson' does not exist on type 'Uint8Array'`. The helper is on the entity (`entity.toJson()`), and changing the call made the build pass.
- Suggested improvement: show the helper call explicitly next to the result shape in query examples, or add a common-mistake note. This is a documentation discoverability issue, not an SDK failure.

## 3. Source integration is external to Arkiv

- Surface: NDMA SACHET public RSS/CAP source, Node fetch and `fast-xml-parser` 5.11.2.
- Steps: GET `rss_india.xml`; parse RSS items; GET each linked `FetchXMLFile?identifier=...`; parse the CAP expiry and area.
- Expected: source-linked public alerts with machine-readable expiry and area.
- Actual on 13 October 2026: the feed returned 99 RSS items and linked CAP XML with event, severity, area and expiry. The source provided an ETag; the importer sends it on subsequent fetches and reuses cached XML for 304 responses.
- Improvement: no Arkiv change requested. Publishing a tested example for expiring external-source data, including source revisions and cancellation handling, would help builders.

## Remaining verification

A funded publisher wallet is required to test `createEntity()` on Tiramisu, explorer evidence, Entity Expiration, and duplicate checks against live project entities. Record the actual outcomes here after funding; do not present them as tested yet.

## 4. Safe ingestion rehearsal

- Surface: local importer, Node.js 24, SACHET RSS/CAP feed, and `@arkiv-network/sdk` 0.8.1.
- Steps: run `npm run ingest:dry-run` with no wallet balance; inspect the console output.
- Expected: parse recent live CAP alerts, report which entities would be created, and make no Arkiv mutations.
- Actual on 13 October 2026: the feed contained 99 items; of the 10 most recent inspected, 7 were eligible and 3 were expired or non-actual. No `createEntity()` or `deleteEntity()` call runs in dry-run mode.
- Improvement: an Arkiv cookbook example showing source expiry, revision replacement, and cancellation handling would be useful. This is a request for an example, not evidence of an SDK bug.

