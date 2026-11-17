// End-to-end check outside Foundry:
//   real BLFX module graph  +  real A-A AAHandler.make()  +  this module's scripts/main.js
// Foundry globals are faked just enough for those files to load and run.
//
//   node --preserve-symlinks --import ./test/register.mjs test/run.mjs
//
// Paths can be overridden with BLFX_DIR and AA_DIR.
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';

const BLFX_SRC = process.env.BLFX_DIR ?? path.join(os.homedir(), 'Downloads/boss-loot-assets-premium');
// Serve BLFX from a Foundry-like path (.../modules/boss-loot-assets-premium/), as the browser would.
// Needs node --preserve-symlinks so module URLs keep this path.
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dedupe-data-'));
fs.mkdirSync(path.join(DATA, 'modules'));
fs.symlinkSync(BLFX_SRC, path.join(DATA, 'modules/boss-loot-assets-premium'));
const BLFX_DIR = path.join(DATA, 'modules/boss-loot-assets-premium');
const AA_DIR = process.env.AA_DIR ?? path.join(os.homedir(), 'Github/autoanimations');
const BLFX_ENTRY = pathToFileURL(path.join(BLFX_DIR, 'scripts/bossLootFx.js')).href;

/* ---------------- fake Foundry ---------------- */

// Anything not explicitly faked resolves to a harmless callable/constructible stub.
const stub = () =>
  new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'prototype' ? t.prototype : k === 'then' ? undefined : stub()),
    apply: () => stub(),
    construct: () => stub(),
  });

const hooks = {};
let blfxInitCount = 0;
globalThis.Hooks = {
  on: (n, fn) => ((hooks[n] ??= []).push(fn), 1),
  once: (n, fn) => {
    if (n === 'init' && new Error().stack.includes('bossLootFx.js')) blfxInitCount++;
    (hooks[n] ??= []).push(fn);
    return 1;
  },
  off: () => {},
  call: (n, ...a) => (hooks[n] ?? []).every(fn => fn(...a) !== false),
  callAll: (n, ...a) => ((hooks[n] ?? []).forEach(fn => fn(...a)), true),
};

const getProperty = (o, k) => k.split('.').reduce((v, p) => v?.[p], o);
const isNewerVersion = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};
globalThis.foundry = new Proxy(
  {
    utils: {
      getProperty,
      hasProperty: (o, k) => getProperty(o, k) !== undefined,
      setProperty: (o, k, v) => { const ps = k.split('.'); const last = ps.pop(); ps.reduce((x, p) => (x[p] ??= {}), o)[last] = v; },
      isNewerVersion,
      deepClone: o => (o && typeof o === 'object' ? (Array.isArray(o) ? o.map(x => foundry.utils.deepClone(x)) : Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v instanceof Item || v instanceof ActiveEffect ? v : foundry.utils.deepClone(v)]))) : o),
      mergeObject: (a, b) => ({ ...a, ...b }),
      isEmpty: o => !o || Object.keys(o).length === 0,
      randomID: () => Math.random().toString(36).slice(2),
    },
  },
  { get: (t, k) => (k in t ? t[k] : stub()) }
);

class Item { constructor(d) { Object.assign(this, d); this.flags ??= {}; } get isEmbedded() { return !!this.parent; } }
class Actor { constructor(d) { Object.assign(this, d); } }
class ActiveEffect { constructor(d) { Object.assign(this, d); } }
Object.assign(globalThis, { Item, Actor, ActiveEffect, CONFIG: { Item: { documentClass: Item } } });
for (const name of ['Application', 'FormApplication', 'Dialog', 'Sequence', 'Sequencer', 'canvas', 'ui', 'Token', 'TokenDocument', 'ChatMessage', 'Roll', 'Macro', 'socketlib', 'TextEditor', 'Handlebars', 'loadTemplates'])
  globalThis[name] ??= stub();

const settings = new Map(Object.entries({
  'boss-loot-assets-premium.blfxAutoRecognition': true,
  'boss-loot-assets-premium.blfxConditionAnimation': true,
  'boss-loot-assets-premium.blfxCustomAutoRecognition': {},
  'niks-animation-dedupe.enabled': true,
  'niks-animation-dedupe.matchMode': 'activity',
  'niks-animation-dedupe.debug': false,
}));
const active = new Set(['boss-loot-assets-premium', 'autoanimations', 'sequencer', 'niks-animation-dedupe']);
const modules = new Map([...active].map(id => [id, { id, active: true }]));
globalThis.game = {
  system: { id: 'dnd5e', version: '5.1.0' },
  version: '14.370',
  user: { id: 'u1', isGM: true },
  i18n: { localize: s => s, format: s => s },
  settings: { get: (m, k) => settings.get(`${m}.${k}`), register: () => {}, set: async (m, k, v) => settings.set(`${m}.${k}`, v) },
  modules: { get: id => modules.get(id) },
};
const uuids = new Map();
globalThis.fromUuid = async u => uuids.get(u) ?? null;
globalThis.fromUuidSync = u => uuids.get(u) ?? null;

// Pretend the page loaded BLFX as Foundry does: <script type="module" src=".../bossLootFx.js">
globalThis.document = {
  baseURI: pathToFileURL(BLFX_DIR + '/').href,
  querySelectorAll: () => [{ src: BLFX_ENTRY }],
};

/* ---------------- load everything ---------------- */

await import(BLFX_ENTRY); // BLFX itself, as Foundry would
const { default: AAHandler } = await import(pathToFileURL(path.join(AA_DIR, 'src/system-handlers/workflow-data.js')).href);
await import('../scripts/main.js');
Hooks.callAll('init');
// Only run this module's ready hook (BLFX's needs a real Foundry)
for (const fn of hooks.ready ?? []) if (fn.toString().includes('loadBlfx')) await fn();

/* ---------------- fixtures ---------------- */

const actor = new Actor({ id: 'a1', name: 'Hero', items: { getName: () => null } });
const activity = (type, extra = {}) => ({ id: `act-${type}`, name: type, type, ...extra });
const item = (d, owned = true) => new Item({ ...d, system: { source: {}, identifier: '', ...d.system }, parent: owned ? actor : null });

const longsword = item({ name: 'Longsword +1', type: 'weapon', system: { type: { baseItem: 'longsword' } } });
const rifle = item({ name: 'Antimatter Rifle', type: 'weapon', system: { type: { baseItem: '' } } });
const fireball = item({ name: 'Fireball', type: 'spell', system: { identifier: 'fireball' } });
const meteor = item({ name: 'Meteor Swarm', type: 'spell', system: { identifier: 'meteor-swarm' } });
const bless = item({ name: 'Bless', type: 'spell', system: { identifier: 'bless', activities: { contents: [activity('utility', { effects: [{ effect: { name: 'Bless' } }] })] } } });
const agathys = item({ name: 'Armor of Agathys', type: 'spell', system: { identifier: 'armor-of-agathys' } });
const tornado = item({ name: 'Fire Tornado', type: 'feat', system: { identifier: 'blfx-fire-tornado' } });
const unowned = item({ name: 'Longsword', type: 'weapon', system: { type: { baseItem: 'longsword' } } }, false);
const arOff = item({
  name: 'Quiet Longsword', type: 'weapon', system: { type: { baseItem: 'longsword' } },
  flags: { 'boss-loot-assets-premium': { 'act-attack': { autoRec: { enabled: false } } } },
});
const customDamageOnly = item({
  name: 'Homebrew Blade', type: 'weapon', system: { type: { baseItem: 'longsword' } },
  flags: { 'boss-loot-assets-premium': { 'act-attack': { command: 'console.log(1)', eventType: 'After Damage Roll' } } },
});
uuids.set('Item.bless', bless).set('Item.agathys', agathys);
const effect = d => new ActiveEffect({ ...d, statuses: Object.assign(new Set(d.statuses ?? []), { first() { return [...this][0]; } }) });

/* ---------------- run through the real A-A workflow ---------------- */

const AA_HAS_ANIMATION = { menu: 'melee', primary: { video: {}, options: {} } };
async function aaPlays(data, animationData = AA_HAS_ANIMATION) {
  globalThis.__aaAnimationData = animationData;
  let stopped = false;
  const probe = d => { probe.data = d; };
  Hooks.on('AutomatedAnimations-WorkflowStart', probe);
  try {
    const result = await AAHandler.make({ token: {}, targets: [], ...data });
    stopped = result === undefined && probe.data?.stopWorkflow === true;
  } catch {
    stopped = probe.data?.stopWorkflow === true; // constructor needs a real token; we only care that it got past the veto
  } finally {
    hooks['AutomatedAnimations-WorkflowStart'].splice(hooks['AutomatedAnimations-WorkflowStart'].indexOf(probe), 1);
  }
  return !stopped;
}

const attack = (it, act = activity('attack')) => ({ item: it, activity: act, rollAttackHook: { item: it, roll: { options: {} } } });
const damage = (it, act = activity('attack')) => ({ item: it, activity: act, rollDamageHook: { item: it } });
const template = (it, act = activity('save')) => ({ item: it, activity: act, isTemplate: true, templateData: {} });
const use = (it, act = activity('utility')) => ({ item: it, activity: act, useItemHook: { item: it } });
const ae = eff => ({ item: eff, activeEffect: true });

const cases = [
  ['Longsword +1 attack (BLFX: weapon longsword)', attack(longsword), false],
  ['Homebrew rifle, no base item', attack(rifle), true],
  ['Fireball template (BLFX: spell fireball)', template(fireball), false],
  ['Meteor Swarm (not in BLFX)', template(meteor), true],
  ['Fireball cast (BLFX: afterItemUse)', use(fireball, activity('save')), false],
  ['BLFX custom item blfx-fire-tornado', template(tornado, activity('utility')), false],
  ['Unowned item (BLFX ignores)', attack(unowned), true],
  ['BLFX auto-rec turned off on the activity', attack(arOff), true],
  ['Custom BLFX animation on damage, A-A attack, mode=activity', attack(customDamageOnly), false],
  ['Bless effect from Bless spell', ae(effect({ name: 'Bless', origin: 'Item.bless', _source: { origin: 'Item.bless' } })), false],
  ['Armor of Agathys effect (BLFX animates cast, not effect)', ae(effect({ name: 'Armor of Agathys', _source: { origin: 'Item.agathys' } })), true],
  ['Poisoned condition', ae(effect({ name: 'Poisoned', statuses: ['poisoned'], parent: actor })), false],
  ['Prone condition (no BLFX condition animation)', ae(effect({ name: 'Prone', statuses: ['prone'], parent: actor })), true],
  ['A-A has no animation for it', attack(longsword), true, null],
];

const settingCases = [
  ['mode=trigger: custom BLFX animation on damage, A-A attack', () => settings.set('niks-animation-dedupe.matchMode', 'trigger'), attack(customDamageOnly), true],
  ['mode=trigger: same item, A-A damage', null, damage(customDamageOnly), false],
  ['mode=trigger: Longsword +1 damage (BLFX animates attack only)', null, damage(longsword), true],
  ['BLFX auto-recognition setting off: Longsword', () => { settings.set('niks-animation-dedupe.matchMode', 'activity'); settings.set('boss-loot-assets-premium.blfxAutoRecognition', false); }, attack(longsword), true],
  ['BLFX auto-recognition setting off: blfx- custom item still plays', null, template(tornado, activity('utility')), false],
  ['BLFX condition animations off: Poisoned', () => settings.set('boss-loot-assets-premium.blfxConditionAnimation', false), ae(effect({ name: 'Poisoned', statuses: ['poisoned'] })), true],
  ['Dedupe module disabled', () => { settings.set('boss-loot-assets-premium.blfxAutoRecognition', true); settings.set('niks-animation-dedupe.enabled', false); }, attack(longsword), true],
];

let fail = 0;
const report = (name, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: A-A ${got ? 'plays' : 'skipped'}${ok ? '' : ` (expected ${want ? 'plays' : 'skipped'})`}`);
};

console.log(`BLFX loaded ${blfxInitCount}x (must be 1), module api: ${!!game.modules.get('niks-animation-dedupe').api}\n`);
if (blfxInitCount !== 1 || !game.modules.get('niks-animation-dedupe').api) fail++;

for (const [name, data, want, anim] of cases) report(name, await aaPlays(data, anim === null ? null : AA_HAS_ANIMATION), want);
for (const [name, setup, data, want] of settingCases) { setup?.(); report(name, await aaPlays(data), want); }

console.log(`\n${fail ? `${fail} FAILED` : 'All passed'}`);
process.exit(fail ? 1 : 0);
