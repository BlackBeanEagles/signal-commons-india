# Arkiv friction report — Signal Commons India

This file records tested behaviour, not invented SDK defects. Each issue includes the surface, steps, expected and actual result, and the change made.

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

## 5. First funded write and duplicate query

- Surface: Tiramisu public RPC; `@arkiv-network/sdk` 0.8.1; Node.js 24; `scripts/ingest.mjs` and `scripts/query.mjs`.
- Steps: fund publisher `0xA455b84a4433d42E09cC6c16095B5e5270D6906D` with free test GLM, run `npm run ingest`, then run `npm run query -- --creator 0xA455b84a4433d42E09cC6c16095B5e5270D6906D` and `npm run verify -- 0xA455b84a4433d42E09cC6c16095B5e5270D6906D`. Rerun `npm run ingest` without changing the source CAP bytes.
- Expected: entities are created on Tiramisu with source expiry; the creator-filtered query finds them; the same source digest is skipped on retry.
- Actual on 17 October 2026: nine entities were created in the first run and one more after the indexed-string fix below. The independent query returned ten current entities, and the verifier reported ten matching CAP digests, zero changed or invalid, and zero source unavailable. The rerun printed `already published` for unchanged CAP records. The first write is [transaction `0x6cdff12f…41c0`](https://tiramisu.explorer.arkiv.network/tx/0x6cdff12fb12282bfe0719b57de711ccf5909399a6d4f182b4d9dcd4f15be41c0).
- Improvement: surface entity-creation errors with the offending indexed attribute and byte length; the current error identified the 128-byte limit but not the attribute name.

## 6. Indexed string byte limit

- Surface: `@arkiv-network/sdk` 0.8.1 local validation during `createEntity()`; Tiramisu `str` attributes; Node.js 24.
- Steps: run the importer on RSS GUID `1792211300008007`, whose first CAP area description begins `Coimbatore, Kanniyakumari, Nagapattinam, Pudukkottai, Ramanat...`; set the `area` attribute with `str(shortText(cap.areas[0], 180))`.
- Expected: a 180-character truncated string might be accepted, or the SDK would identify the `area` field and its byte size before broadcast.
- Actual on 17 October 2026: `Invalid str value ...: 165 UTF-8 bytes exceeds the 128-byte limit on a str`. The first nine writes succeeded; this item made no transaction. The importer now cuts indexed text at a UTF-8 boundary of at most 128 bytes while retaining the full area in the JSON payload. Rerunning created the missing alert in [transaction `0x98af0d6a…01a`](https://tiramisu.explorer.arkiv.network/tx/0x98af0d6abce4e1d79ba2632b27ce96b24bfad93bee3b444eb6ea5f13f19cf01a).
- Improvement: include the attribute name and actual byte count in validation errors; document the `str` byte limit beside mutation examples.

## 4. Safe ingestion rehearsal

- Surface: local importer, Node.js 24, SACHET RSS/CAP feed, and `@arkiv-network/sdk` 0.8.1.
- Steps: run `npm run ingest:dry-run` with no wallet balance; inspect the console output.
- Expected: parse recent live CAP alerts, report which entities would be created, and make no Arkiv mutations.
- Actual on 13 October 2026: the feed contained 99 items; of the 10 most recent inspected, 7 were eligible and 3 were expired or non-actual. No `createEntity()` or `deleteEntity()` call runs in dry-run mode.
- Improvement: an Arkiv cookbook example showing source expiry, revision replacement, and cancellation handling would be useful. This is a request for an example, not evidence of an SDK bug.

