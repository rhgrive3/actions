import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {gitBlobSha1} from '../../lib/inkwave-main-ink-baseline.mjs';
import {paintEpochSource} from './inkwave-paint-source-epochs.mjs';
// Additive official e1f catalogue only. Historical archives and loaders remain unchanged.
const bytes = fs.readFileSync(new URL('../../fixtures/inkwave-paint-e1f-catalogue.json.gz', import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'), 'c093f8d432cecdf4f92bdd07b9beb72f856e7917413680e716205c2933e9eec3');
const catalogue = JSON.parse(gunzipSync(bytes));
assert.equal(catalogue.schema, 1);
assert.equal(catalogue.commit, 'e1fa66ad8465bf87caaf232d51543def72c35875');
assert.equal(catalogue.path, 'patches/splatoon3/runtime/main-weapon-catalog.mjs');
assert.equal(catalogue.gitBlob, '24191518c2d64f544c42bab60f1a2eac1b3eb26f');
assert.equal(gitBlobSha1(catalogue.content), catalogue.gitBlob);
export const e1fPaintEpochSource = path => path === catalogue.path ? catalogue.content : paintEpochSource('main9fe', path);
