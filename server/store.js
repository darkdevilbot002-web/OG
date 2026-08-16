/**
 * OGxISAI License store
 * ─────────────────────
 * Keys are stored in MongoDB when MONGODB_URI is set, otherwise in a local
 * JSON file (data/keys.json). You can warm up / persist keys across Render
 * restarts by setting SEED_KEYS (comma separated) in your environment.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const ADMIN_KEY    = process.env.ADMIN_KEY || 'dev-admin-CHANGE-ME';
const ADMIN_USER   = process.env.ADMIN_USER || 'OG';
const ADMIN_PASS   = process.env.ADMIN_PASS || 'OG@098';
const MONGODB_URI  = process.env.MONGODB_URI || null;
const MONGO_DB     = process.env.MONGO_DB || 'ogxisai';
const MONGO_COLL   = process.env.MONGO_COLL || 'licenses';
const SESSION_SECRET = process.env.SESSION_SECRET || ADMIN_KEY;
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 120000; // token lifetime
/* Feature tiers: 'pro' unlocks EVERYTHING (sound quality + all powers). */
const FEATURES = { pro: ['all'] };
const DATA_DIR     = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE    = path.join(DATA_DIR, 'keys.json');
const SEED         = (process.env.SEED_KEYS || '')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

let useMongo = false;
let mongoClient = null;
let coll = null;
let fileMap = {};

function genKey() {
  const block = () => crypto.randomBytes(3).toString('hex').toUpperCase();
  return `OGX-${block()}-${block()}-${block()}`;
}

function freshRecord(plan, days, note) {
  return {
    plan,
    createdAt: Date.now(),
    expiresAt: days && days > 0 ? Date.now() + days * 86400000 : null,
    active: true,
    deviceId: null,
    note: note || null,
    verifications: 0,
    lastVerifiedAt: null,
  };
}

async function loadFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      fileMap = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (_) { /* keep empty map */ }
}

function persistFile() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(fileMap, null, 2));
  } catch (_) { /* best effort */ }
}

async function get(k) {
  if (useMongo) {
    const doc = await coll.findOne({ _id: k });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest;
  }
  return fileMap[k] || null;
}

async function upsert(k, rec) {
  if (useMongo) {
    await coll.updateOne({ _id: k }, { $set: rec }, { upsert: true });
  } else {
    fileMap[k] = rec;
    persistFile();
  }
}

/** Seed any keys defined via SEED_KEYS env (useful on Render restarts). */
async function seed() {
  for (const k of SEED) {
    if (!(await get(k))) await upsert(k, freshRecord('pro', 0, 'seed'));
  }
}

async function init() {
  if (MONGODB_URI) {
    useMongo = true;
    mongoClient = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 6000 });
    await mongoClient.connect();
    coll = mongoClient.db(MONGO_DB).collection(MONGO_COLL);
  } else {
    await loadFile();
  }
  await seed();
}

/** Mint a brand-new license key that you give to a buyer. */
async function create({ plan = 'pro', days = 0, note = '' } = {}) {
  let k;
  do { k = genKey(); } while (await get(k));
  const rec = freshRecord(plan, days, note);
  await upsert(k, rec);
  return { key: k, record: rec };
}

/** Validate a key the extension sends. Releases all powers when valid. */
async function verify(key, deviceId) {
  key = String(key || '').trim().toUpperCase();
  const rec = await get(key);
  if (!rec) return { valid: false, code: 'INVALID', message: 'Invalid license key.' };
  if (!rec.active) return { valid: false, code: 'REVOKED', message: 'This license key has been revoked.' };
  if (rec.expiresAt && Date.now() > rec.expiresAt) {
    return { valid: false, code: 'EXPIRED', message: 'This license key has expired.' };
  }
  if (rec.deviceId && deviceId && rec.deviceId !== deviceId) {
    return { valid: false, code: 'DEVICE', message: 'This license key is already activated on another device.' };
  }
  if (!rec.deviceId && deviceId) rec.deviceId = deviceId;
  rec.lastVerifiedAt = Date.now();
  rec.verifications = (rec.verifications || 0) + 1;
  await upsert(key, rec);

  return {
    valid: true,
    code: 'OK',
    message: 'License validated.',
    plan: rec.plan,
    features: FEATURES[rec.plan] || [],
    powers: FEATURES[rec.plan] || [],
    expiresAt: rec.expiresAt,
    deviceId: rec.deviceId || deviceId || null,
  };
}

/* ── Signed, short-lived session tokens ────────────────────
   The client must keep re-verifying (heartbeat). Because every
   refresh looks the key up in the store again, revoking the key
   invalidates every live token on the next refresh. */
function b64u(s) { return Buffer.from(String(s)).toString('base64url'); }
function b64d(s) { return Buffer.from(String(s), 'base64url').toString('utf8'); }

function signSession({ key, deviceId, plan, exp }) {
  const body = b64u(JSON.stringify({ key, dev: deviceId, plan, exp }));
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function parseSession(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    const expect = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    if (!sig || expect !== sig) return null;
    const payload = JSON.parse(b64d(body));
    if (!payload || !payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (_) { return null; }
}

async function revoke(k) {
  k = String(k || '').trim().toUpperCase();
  const rec = await get(k);
  if (rec) await upsert(k, { ...rec, active: false });
  return !!rec;
}

async function activate(k) {
  k = String(k || '').trim().toUpperCase();
  const rec = await get(k);
  if (!rec || (rec.expiresAt && Date.now() > rec.expiresAt)) return false;
  await upsert(k, { ...rec, active: true });
  return true;
}

function statusOf(rec) {
  if (!rec) return 'missing';
  if (!rec.active) return 'revoked';
  if (rec.expiresAt && Date.now() > rec.expiresAt) return 'expired';
  return 'active';
}

async function list() {
  const decorate = (key, rec) => ({ key, status: statusOf(rec), ...rec });
  if (useMongo) {
    const docs = await coll.find().toArray();
    return docs.map((d) => {
      const { _id: key, ...rec } = d;
      return decorate(key, rec);
    });
  }
  return Object.keys(fileMap).map((k) => decorate(k, fileMap[k]));
}

module.exports = {
  ADMIN_KEY,
  ADMIN_USER,
  ADMIN_PASS,
  SESSION_TTL_MS,
  init,
  create,
  verify,
  revoke,
  activate,
  statusOf,
  list,
  signSession,
  parseSession,
};