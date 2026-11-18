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
Object.assign(globalThis, { Item, Actor, ActiveEffect, CONFIG: { Item: { documentClass: Item }, DND5E: { areaTargetTypes: { cone: {}, cube: {}, cylinder: {}, line: {}, radius: {}, sphere: {}, square: {}, wall: {} } } } });

// A-A's global menus: the real Global Menu export, as AutomatedAnimations.AutorecManager returns them.
const AA_MENU = process.env.AA_MENU ?? path.join(os.homedir(), 'Downloads/fvtt-AutomatedAnimations-GlobalMenu-dnd5e-full.json');
const aaMenus = JSON.parse(fs.readFileSync(AA_MENU, 'utf8'));
globalThis.AutomatedAnimations = { AutorecManager: { getAutorecEntries: () => structuredClone(aaMenus) } };
for (const name of ['Application', 'FormApplication', 'Dialog', 'Sequence', 'Sequencer', 'canvas', 'ui', 'Token', 'TokenDocument', 'ChatMessage', 'Roll', 'Macro', 'socketlib', 'TextEditor', 'Handlebars', 'loadTemplates'])
  globalThis[name] ??= stub();

const settings = new Map(Object.entries({
  'boss-loot-assets-premium.blfxAutoRecognition': true,
  'boss-loot-assets-premium.blfxConditionAnimation': true,
  'boss-loot-assets-premium.blfxCustomAutoRecognition': {},
  'autoanimations.killAllAnim': 'on',
  'autoanimations.playonDamageCore': false,
  'autoanimations.disableAutoRec': false,
  'autoanimations.disableAEAnimations': false,
  'niks-animation-dedupe.priority': 'blfx',
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
// Replace BLFX's entry points with spies (same module instance this module wraps later).
const { BlfxMacroExecutor: X } = await import(new URL('./apps/BlfxMacroExecutor.js', BLFX_ENTRY).href);
const blfxCalls = [];
for (const name of ['callMacro', 'callAoeMacro', 'callConditionMacro']) X[name] = async args => { blfxCalls.push({ name, args }); };
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
// PHB Armor of Agathys: 'Cast' is a heal activity (temp HP); the effect stands for one added by the GM or another module.
const agathysCast = activity('heal', { name: 'Cast', effects: [{ effect: { name: 'Armor of Agathys' } }] });
const agathys = item({ name: 'Armor of Agathys', type: 'spell', system: { identifier: 'armor-of-agathys', activities: { contents: [agathysCast] } } });
// PHB Witch Bolt: attack activity applying "Sustained Lightning", plus a "Bonus Action Damage" activity of type damage.
const wbAttack = activity('attack', { id: 'wb-attack', name: '', damage: { parts: [{}] }, effects: [{ effect: { name: 'Sustained Lightning' } }] });
const wbDamage = activity('damage', { id: 'wb-damage', name: 'Bonus Action Damage', damage: { parts: [{}] } });
const witchBolt = item({ name: 'Witch Bolt', type: 'spell', system: { identifier: 'witch-bolt', activities: { contents: [wbAttack, wbDamage] } } });
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
uuids.set('Item.bless', bless).set('Item.agathys', agathys).set('Item.witchBolt', witchBolt);
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
  ['Armor of Agathys effect, mode=activity (BLFX animates the cast)', ae(effect({ name: 'Armor of Agathys', _source: { origin: 'Item.agathys' } })), false],
  ['Witch Bolt attack (BLFX animates it through its effect)', attack(witchBolt, wbAttack), false],
  ['Witch Bolt damage roll of the attack', damage(witchBolt, wbAttack), false],
  ['Witch Bolt Bonus Action Damage', damage(witchBolt, wbDamage), false],
  ['Poisoned condition', ae(effect({ name: 'Poisoned', statuses: ['poisoned'], parent: actor })), false],
  ['Prone condition (no BLFX condition animation)', ae(effect({ name: 'Prone', statuses: ['prone'], parent: actor })), true],
  ['A-A has no animation for it', attack(longsword), true, null],
];

const settingCases = [
  ['mode=trigger: custom BLFX animation on damage, A-A attack', () => settings.set('niks-animation-dedupe.matchMode', 'trigger'), attack(customDamageOnly), true],
  ['mode=trigger: same item, A-A damage', null, damage(customDamageOnly), false],
  ['mode=trigger: Longsword +1 damage (BLFX animates attack only)', null, damage(longsword), true],
  ['mode=trigger: Witch Bolt attack (effect is another moment)', null, attack(witchBolt, wbAttack), true],
  ['mode=trigger: Armor of Agathys effect (BLFX animates cast only)', null, ae(effect({ name: 'Armor of Agathys', _source: { origin: 'Item.agathys' } })), true],
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

/* ---------------- Automated Animations first ---------------- */

async function blfxPlays(name, args) {
  blfxCalls.length = 0;
  await X[name](args);
  return blfxCalls.length === 1;
}
const atk = (extra = {}) => activity('attack', { name: 'Attack', damage: { parts: [{}] }, ...extra });
const qwxyz = item({ name: 'Qwxyz', type: 'weapon', system: { type: { baseItem: 'longsword' } } });
const aaOffItem = item({ name: 'Longsword +1', type: 'weapon', system: { type: { baseItem: 'longsword' } }, flags: { autoanimations: { version: 5, isEnabled: false } } });
const fireballSave = activity('save', { name: 'Cast', target: { template: { type: 'sphere' } }, damage: { parts: [{}] } });

const aaFirstCases = [
  ['A-A first: Longsword +1 attack (A-A "Sword")', () => { settings.set('niks-animation-dedupe.enabled', true); settings.set('niks-animation-dedupe.priority', 'aa'); }, 'callMacro', { item: longsword, activity: atk(), trigger: 'afterAttack' }, false],
  ['A-A first: Longsword +1 damage, mode=activity', null, 'callMacro', { item: longsword, activity: atk(), trigger: 'afterDamage' }, false],
  ['A-A first: weapon A-A has nothing for', null, 'callMacro', { item: qwxyz, activity: atk(), trigger: 'afterAttack' }, true],
  ['A-A first: A-A turned off on the item', null, 'callMacro', { item: aaOffItem, activity: atk(), trigger: 'afterAttack' }, true],
  ['A-A first: Fireball template (A-A preset "Fireball")', null, 'callAoeMacro', { item: fireball, activity: fireballSave, trigger: 'createTemplate' }, false],
  ['A-A first: Witch Bolt effect beam (A-A animates the attack)', null, 'callMacro', { item: witchBolt, activity: wbAttack, effect: effect({ name: 'Sustained Lightning' }), trigger: 'afterActiveEffects' }, false],
  ['A-A first: Bless effect (A-A effect "Bless")', null, 'callMacro', { item: bless, effect: effect({ name: 'Bless' }), trigger: 'afterActiveEffects' }, false],
  ['A-A first: Poisoned condition (A-A effect "Poisoned")', null, 'callConditionMacro', { effect: effect({ name: 'Poisoned', statuses: ['poisoned'] }) }, false],
  ['A-A first: Deafened condition (not in A-A effects)', null, 'callConditionMacro', { effect: effect({ name: 'Deafened', statuses: ['deafened'] }) }, true],
  ['A-A first: saving throw (A-A never animates)', null, 'callMacro', { item: longsword, activity: atk(), trigger: 'afterRollSavingThrow' }, true],
  ['A-A first, mode=trigger: Longsword +1 damage (A-A plays on attack)', () => settings.set('niks-animation-dedupe.matchMode', 'trigger'), 'callMacro', { item: longsword, activity: atk(), trigger: 'afterDamage' }, true],
  ['A-A first, mode=trigger: Witch Bolt effect beam (effect not in A-A effects)', null, 'callMacro', { item: witchBolt, activity: wbAttack, effect: effect({ name: 'Sustained Lightning' }), trigger: 'afterActiveEffects' }, true],
  ['A-A first, mode=trigger: Longsword +1 attack', null, 'callMacro', { item: longsword, activity: atk(), trigger: 'afterAttack' }, false],
  ['A-A first, mode=trigger, A-A plays on damage: Longsword +1 damage', () => settings.set('autoanimations.playonDamageCore', true), 'callMacro', { item: longsword, activity: atk(), trigger: 'afterDamage' }, false],
  ['A-A first: all A-A animations off', () => { settings.set('autoanimations.playonDamageCore', false); settings.set('niks-animation-dedupe.matchMode', 'activity'); settings.set('autoanimations.killAllAnim', 'off'); }, 'callMacro', { item: longsword, activity: atk(), trigger: 'afterAttack' }, true],
  ['BLFX first: wrapper lets BLFX through', () => { settings.set('autoanimations.killAllAnim', 'on'); settings.set('niks-animation-dedupe.priority', 'blfx'); }, 'callMacro', { item: longsword, activity: atk(), trigger: 'afterAttack' }, true],
];

for (const [name, setup, entry, args, want] of aaFirstCases) {
  setup?.();
  const got = await blfxPlays(entry, args);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: BLFX ${got ? 'plays' : 'skipped'}${ok ? '' : ` (expected ${want ? 'plays' : 'skipped'})`}`);
}

settings.set('niks-animation-dedupe.priority', 'aa');
report('A-A first: A-A is not skipped for Longsword +1', await aaPlays(attack(longsword)), true);

/* ---------------- BLFX line length fix ---------------- */

// The line entries blfx-assets-pack01 3.6.1 registers (scripts/resources.js).
const assets = new Set([
  'blfx.spell.template.line.breath_weapon1.acid.color1.width-30ft',
  'blfx.spell.template.line.breath_weapon1.lightning.color1.width-30ft',
  'blfx.spell.template.line.breath_weapon1.lightning.color1.width-60ft',
  ...[10, 20, 30, 60, 90].map(n => `blfx.spell.template.line.lightning_bolt.color1.width-${n}ft`),
]);
globalThis.Sequencer = { Database: { getEntry: name => (assets.has(name) ? { file: name } : false) } };
const { helperData } = await import(new URL('./helperFunctions.js', BLFX_ENTRY).href);
const line = (anim, distance) => helperData.getAnimationForRayTemplate(`blfx.spell.template.line.${anim}`, { documentName: 'MeasuredTemplate', t: 'ray', distance });
const lineCases = [
  ['acid breath, 60 ft line (only 30 ft exists)', line('breath_weapon1.acid.color1.width-30ft', 60), 'breath_weapon1.acid.color1.width-30ft'],
  ['acid breath, 30 ft line', line('breath_weapon1.acid.color1.width-30ft', 30), 'breath_weapon1.acid.color1.width-30ft'],
  ['lightning breath, 60 ft line', line('breath_weapon1.lightning.color1.width-60ft', 60), 'breath_weapon1.lightning.color1.width-60ft'],
  ['lightning breath, 120 ft line (no 90 ft)', line('breath_weapon1.lightning.color1.width-60ft', 120), 'breath_weapon1.lightning.color1.width-60ft'],
  ['lightning breath, 20 ft line (no 20 ft, 30 ft closest)', line('breath_weapon1.lightning.color1.width-60ft', 20), 'breath_weapon1.lightning.color1.width-30ft'],
  ['lightning bolt, 100 ft line (BLFX pick exists)', line('lightning_bolt.color1.width-60ft', 100), 'lightning_bolt.color1.width-90ft'],
];
for (const [name, got, want] of lineCases) {
  const ok = got === `blfx.spell.template.line.${want}`;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  Line length: ${name}: ${got.replace('blfx.spell.template.line.', '')}${ok ? '' : ` (expected ${want})`}`);
}

console.log(`\n${fail ? `${fail} FAILED` : 'All passed'}`);
process.exit(fail ? 1 : 0);
