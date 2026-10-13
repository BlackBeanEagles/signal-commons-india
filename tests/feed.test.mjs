import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRss, parseCap, referencedRssIds } from '../scripts/feed.mjs';

test('RSS reads public alert identity and link', () => {
  const xml = `<rss><channel><item><title>Synthetic rain warning</title><guid isPermaLink="false">sample-1</guid><link>https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=sample-1</link><category>Met</category><author>Synthetic issuer</author><pubDate>Tue, 13 Oct 2026 10:41:55 GMT</pubDate></item></channel></rss>`;
  const result = parseRss(xml);
  assert.equal(result.length, 1);
  assert.equal(result[0].guid, 'sample-1');
  assert.equal(result[0].category, 'Met');
});

test('CAP chooses English information, reads areas and official expiry', () => {
  const xml = `<cap:alert xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2"><cap:identifier>sample</cap:identifier><cap:sender>Synthetic Authority</cap:sender><cap:status>Actual</cap:status><cap:msgType>Alert</cap:msgType><cap:info><cap:language>hi-IN</cap:language><cap:headline>नमूना</cap:headline></cap:info><cap:info><cap:language>en-IN</cap:language><cap:event>Heavy Rain</cap:event><cap:severity>Severe</cap:severity><cap:headline>Synthetic rain warning</cap:headline><cap:expires>2026-10-13T19:02:00+05:30</cap:expires><cap:area><cap:areaDesc>Synthetic District A</cap:areaDesc></cap:area><cap:area><cap:areaDesc>Synthetic District B</cap:areaDesc></cap:area></cap:info></cap:alert>`;
  const result = parseCap(xml);
  assert.equal(result.sender, 'Synthetic Authority');
  assert.equal(result.headline, 'Synthetic rain warning');
  assert.deepEqual(result.areas, ['Synthetic District A', 'Synthetic District B']);
  assert.equal(result.expiresAt, '2026-10-13T13:32:00.000Z');
});

test('CAP references map to source RSS IDs', () => {
  assert.deepEqual(referencedRssIds('IMD,IN-123_1,2026-10-13T00:00:00Z IMD,IN-456_2,2026-10-13T01:00:00Z'), ['123', '456']);
});
