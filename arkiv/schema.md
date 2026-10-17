# Arkiv schema — Signal Commons India

Network: Tiramisu, chain ID `7738577`. SDK: `@arkiv-network/sdk` 0.8.x. Primary app namespace: `signal-commons-india`.

## Entity: `alert`

One entity represents a retrieved CAP alert revision. The publisher is a relay wallet, not the issuing authority. The importer reads the NDMA SACHET RSS feed and linked CAP XML, hashes the XML, and creates a short-lived entity if that digest has not already been published by the same creator for the same RSS GUID.

Queryable attributes:

- `app: str("signal-commons-india")` — namespace filter.
- `kind: str("alert")` — entity type filter.
- `source_id: str(guid)` — RSS GUID; used to check prior publications.
- `source_digest: str(sha256)` — digest of retrieved CAP XML; used to avoid repeated writes.
- `event: str` — hazard/event classification supplied in CAP.
- `severity: str` — CAP severity, preserved as supplied.
- `area: str` — first CAP area description, a coarse public geography, truncated at a UTF-8 boundary to Arkiv's 128-byte indexed-string limit. The full descriptions remain in the payload.
- `expires_at_ms: u64` — source expiry in Unix milliseconds, for numeric range queries.

Payload (`application/json`, not indexed): source URL, RSS GUID, SHA-256 digest, retrieval time, headline, description, instruction, CAP sender, all CAP area descriptions, event, severity, urgency, certainty, sent time, expiry, and a note that the wallet relays rather than issues the alert.

System fields used: immutable `$creator` for publisher provenance, `$expiresAt` for Arkiv Entity Expiration, and `$key` for the exact record.

**Lifetime:** `ExpirationTime.atDate()` uses the CAP bulletin's official expiry. The importer skips items expiring within three minutes to avoid dead-on-arrival writes. Arkiv's expiry removes records from live queries; it is not a promise to erase chain history.

## Exact app query

```ts
const query = client
  .select({ key: true, creator: true, payload: true, expiresAt: true })
  .where(eq('app', str('signal-commons-india')))
  .where(eq('kind', str('alert')))
  .limit(200)

// When a trusted relay wallet is configured:
const page = await query.createdBy(publisherAddress).fetch()
```

The app follows up to four additional cursor pages, then filters district and hazard and sorts by CAP sent time locally. The 1,000-entity ceiling is an MVP limit to remove before wider deployment; Arkiv pages are limited to 200. Local filtering preserves district preferences on the user's device, but network observers can still see RPC access.

An independent CLI also adds indexed `severity` equality and numeric `expires_at_ms` range conditions when supplied. Example: `npm run query -- --severity Severe --valid-for-minutes 60 --creator 0xYOUR_PUBLISHER_ADDRESS`.

## Importer duplicate query

```ts
const page = await publicClient
  .select({ key: true, attributes: true })
  .where(eq('app', str('signal-commons-india')))
  .where(eq('source_id', str(rssGuid)))
  .createdBy(publisherAddress)
  .limit(100)
  .fetch()
```

A matching `source_digest` means the CAP XML is already published. A changed digest creates a revision. The reader keeps the latest retrieved revision for each RSS GUID. The importer attempts to remove alerts referenced by CAP cancellations; this needs field testing before live safety use.

## Data deliberately kept off Arkiv

No private keys, real personal data, precise user location, subscriptions, or browser search preferences. Only public government warning content and public relay metadata are written. Source XML is cached locally for conditional HTTP requests, not written wholesale to Arkiv.
