# Track case and evidence plan

We intend to enter all five tracks with one project. The rules allow multiple track entries, but a team can receive only one prize. This file is an honest case for judges, not a claim that every pillar is already solved.

## Best Indian Use Case

**User and harm:** people in Indian districts need to find current public hazard warnings and verify the issuing source. The interface uses India time, searches CAP area descriptions, links every result to SACHET, and avoids requiring an account. The relay is an awareness tool; official instructions remain authoritative.

**Evidence still needed:** field feedback from at least one Indian user, a public URL, and live Arkiv records that stay current during judging.

## Censorship Resistance

**Harm:** if a single website or API goes down, a warning reader disappears. Public Arkiv entities are queryable with the SDK from this app or the independent CLI; source URLs and schema are public. The front end can be statically hosted by others.

**Limit:** the current app uses one public Tiramisu RPC endpoint and one source feed. We should demonstrate a second independently hosted reader or configurable RPC before claiming resilience to endpoint or source takedown.

## Open Source

**Harm:** closed alert integrations require permission to reuse data and logic. The MIT code includes the feed parser, entity schema, importer, independent reader, and reproducible commands. The original public bulletin is linked.

**Evidence still needed:** public repository, independent reproduction from the recorded deadline SHA, and preferably a second reader using only the schema.

## Privacy

**Harm:** resident subscriptions and precise locations can reveal where people live or what hazards concern them. District and hazard preferences stay in the browser; the public ledger contains no resident identities or subscriptions. No wallet connection is required to read.

**Limit:** the RPC and official source can still see network metadata, and a user who opens a source link contacts that site. Do not claim anonymity or private browsing.

## Security

**Harm:** forged relays could misstate an official warning. The record contains the public CAP source link and SHA-256 digest, and Arkiv exposes the immutable creator wallet. The UI labels the wallet as a relay, not as NDMA. Source URLs are restricted to SACHET HTTPS and rendered text uses DOM text nodes.

**Limit:** a creator wallet proves who wrote the Arkiv entity, not that the content is genuine. We need a live transaction, explorer link, and source-versus-digest verification demo. Source cancellation and revision handling need field testing.

## Why Arkiv

The core artifact is a public, indexed, time-scoped warning record that anyone can query by attributes and creator without our API. Arkiv expiry lets live readers omit stale alerts, while the immutable creator field supports relay provenance. Postgres would put reads behind our server and operator; IPFS alone would not provide the same attribute query and expiry surface. We deliberately keep user preferences and secrets off Arkiv. We do not need every Arkiv feature to justify the ones used.
