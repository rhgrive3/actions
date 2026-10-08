#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parse } from '../patches/loading-cache/vendor/acorn.mjs';

const root = path.resolve(process.argv[2] || '_site');
const actorMotion = 'patches/splatoon3/runtime/actor-motion.mjs';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = JSON.parse(fs.readFileSync(path.join(root, 'inkwave-build.json')));
const actorBytes = fs.readFileSync(path.join(root, actorMotion));
assert.equal(identity.artifacts[actorMotion], hash(actorBytes), 'actor-motion build identity');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const preloads = [...html.matchAll(/<link rel="modulepreload" href="\.\/([^"]+)">/g)].map(match => match[1]);
assert(!preloads.includes(actorMotion), 'actor-motion must not add an eager HTML preload request');

const clock = fs.readFileSync(path.join(root, 'patches/splatoon3/runtime/clock.mjs'), 'utf8');
const clockAst = parse(clock, { ecmaVersion: 'latest', sourceType: 'module' });
assert(clockAst.body.some(node => node.type === 'ImportDeclaration' && node.source.value === './actor-motion.mjs'),
  'fixed clock must retain its actor-motion runtime import');

const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const workerAst = parse(worker, { ecmaVersion: 'latest', sourceType: 'script' });
const build = workerAst.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'BUILD').declarations[0].init;
const config = JSON.parse(worker.slice(build.start, build.end));
assert.equal(config.revision, identity.build.revision, 'service-worker and build identity revision');
assert(config.precache.includes(actorMotion), 'actor-motion must remain in the service-worker precache');
assert.equal(config.assets[actorMotion].sha256, identity.artifacts[actorMotion], 'service-worker and build artifact digest');
const cached = fs.readFileSync(path.join(root, '_versions', config.revision, actorMotion));
assert.equal(hash(cached), config.assets[actorMotion].sha256, 'actor-motion immutable cache identity');

console.log(JSON.stringify({ status: 'passed', actorMotion, staticClockImport: true, eagerPreload: false,
  serviceWorkerPrecached: true, buildIdentity: identity.artifacts[actorMotion] }, null, 2));
