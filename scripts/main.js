/**
 * Nik's Animation Dedupe
 *
 * Makes sure Automated Animations (A-A) and Boss Loot FX (BLFX) never both animate the same thing.
 * The "priority" setting decides which one plays:
 *
 * - BLFX first: A-A's "AutomatedAnimations-WorkflowStart" hook is vetoed (clonedData.stopWorkflow)
 *   whenever BLFX will play its own animation. BLFX is asked through its own BlfxMacroExecutor class,
 *   loaded from the exact URL BLFX already loaded, so the browser hands back the same module instance.
 * - A-A first: BlfxMacroExecutor's entry points (callMacro, callAoeMacro, callConditionMacro) are
 *   wrapped and return early whenever A-A will play. A-A has no lookup API, so its lookup
 *   (findAnimation.js handleItem + autorec/search.js) and its dnd5e hook rules are mirrored, reading
 *   A-A's live menus through AutomatedAnimations.AutorecManager.getAutorecEntries().
 */

const ID = 'niks-animation-dedupe';
const BLFX = 'boss-loot-assets-premium';
const AA = 'autoanimations';

// BLFX trigger names an Automated Animations workflow can collide with, per A-A entry point.
const ITEM_TRIGGERS = ['afterItemUse', 'postUseActivity', 'afterAttack', 'afterThrown', 'afterDamage', 'createTemplate', 'afterSummon'];

// Mirrors CONDITION_ANIMATIONS in BLFX macros/spell/spellMacro.js (addConditionAnimation).
const BLFX_CONDITIONS = new Set([
  'blinded', 'charmed', 'confused', 'deafened', 'frightened', 'grappled', 'incapacitated',
  'restrained', 'paralyzed', 'petrified', 'poisoned', 'silenced', 'stunned', 'unconscious',
]);

let blfx = null; // { BlfxMacroExecutor, TRIGGER_MAP, helpers }

const log = (...args) => {
  if (game.settings.get(ID, 'debug')) console.log(`${ID} |`, ...args);
};

/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

Hooks.once('init', () => {
  game.settings.register(ID, 'enabled', {
    name: 'NAD.Settings.Enabled.Name',
    hint: 'NAD.Settings.Enabled.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(ID, 'priority', {
    name: 'NAD.Settings.Priority.Name',
    hint: 'NAD.Settings.Priority.Hint',
    scope: 'world',
    config: true,
    type: String,
    choices: { blfx: 'NAD.Settings.Priority.Blfx', aa: 'NAD.Settings.Priority.AA' },
    default: 'blfx',
  });
  game.settings.register(ID, 'matchMode', {
    name: 'NAD.Settings.MatchMode.Name',
    hint: 'NAD.Settings.MatchMode.Hint',
    scope: 'world',
    config: true,
    type: String,
    choices: { activity: 'NAD.Settings.MatchMode.Activity', trigger: 'NAD.Settings.MatchMode.Trigger' },
    default: 'activity',
  });
  game.settings.register(ID, 'debug', {
    name: 'NAD.Settings.Debug.Name',
    hint: 'NAD.Settings.Debug.Hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
  });
});

Hooks.once('ready', async () => {
  if (!game.modules.get(BLFX)?.active || !game.modules.get(AA)?.active) return;

  blfx = await loadBlfx();
  if (!blfx) return;

  Hooks.on('AutomatedAnimations-WorkflowStart', onWorkflowStart);
  wrapBlfx(blfx.BlfxMacroExecutor);
  fixLineLength(blfx.helpers);
  game.modules.get(ID).api = { blfxWillAnimate, blfxWillAnimateEffect, aaWillAnimate, aaWillAnimateEffect };
  console.log(`${ID} | Ready.`);
});

const blfxFirst = () => game.settings.get(ID, 'priority') !== 'aa';

/**
 * Import BLFX's executor from the URL BLFX's own module graph used.
 * helperFunctions.js imports bossLootFx.js, so importing from a *different* URL would run BLFX a
 * second time and register its hooks twice. To rule that out, only an already-loaded URL is used.
 */
async function loadBlfx() {
  const suffix = `/modules/${BLFX}/scripts/apps/BlfxMacroExecutor.js`;
  const candidates = [];

  const entry = [...document.querySelectorAll('script[type="module"][src]')]
    .find(s => new URL(s.src, document.baseURI).pathname.endsWith(`/modules/${BLFX}/scripts/bossLootFx.js`));
  if (entry) candidates.push(new URL('./apps/BlfxMacroExecutor.js', new URL(entry.src, document.baseURI)).href);

  for (const r of performance.getEntriesByType('resource')) {
    const url = new URL(r.name);
    if (url.pathname.endsWith(suffix)) candidates.push(url.href);
  }

  const url = candidates[0];
  if (!url) {
    console.warn(`${ID} | Could not find where BLFX was loaded from; doing nothing, so Automated Animations is unaffected.`);
    return null;
  }

  try {
    const [executor, constants] = await Promise.all([
      import(url),
      import(new URL('../constants.js', url).href),
    ]);
    if (typeof executor.BlfxMacroExecutor?.getAutoRecognitionAnimation !== 'function' || !constants.TRIGGER_MAP) {
      throw new Error('BLFX internals have changed (BlfxMacroExecutor / TRIGGER_MAP not found)');
    }
    // Only needed for fixLineLength; a failure here mustn't turn off the dedupe.
    const helpers = await import(new URL('../helperFunctions.js', url).href).then(m => m.helperData, () => null);
    return { BlfxMacroExecutor: executor.BlfxMacroExecutor, TRIGGER_MAP: constants.TRIGGER_MAP, helpers };
  } catch (err) {
    console.warn(`${ID} | Could not read BLFX's animation logic; doing nothing, so Automated Animations is unaffected.`, err);
    return null;
  }
}

/* -------------------------------------------- */
/*  A-A hook                                    */
/* -------------------------------------------- */

function onWorkflowStart(data, animationData) {
  if (!animationData) return; // A-A has nothing to play anyway
  if (!game.settings.get(ID, 'enabled') || !blfxFirst()) return;

  // A-A awaits these before checking stopWorkflow, which lets the check be async.
  (data.deferrals ??= []).push(
    decide(data)
      .then(skip => {
        if (skip) data.stopWorkflow = true;
        log(skip ? 'Skipping A-A (BLFX animates this):' : 'Allowing A-A:', data.item?.name, data);
      })
      .catch(err => console.warn(`${ID} | Check failed, letting Automated Animations play.`, err))
  );
}

async function decide(data) {
  if (data.activeEffect) return blfxWillAnimateEffect(data.item);

  const item = data.item;
  const activity = data.activity ?? null;
  const roll = data.rollAttackHook?.roll;

  let triggers;
  if (game.settings.get(ID, 'matchMode') === 'trigger') {
    if (data.rollAttackHook) triggers = ['afterAttack', 'afterThrown'];
    else if (data.rollDamageHook) triggers = ['afterDamage'];
    else if (data.isTemplate) triggers = ['createTemplate'];
    else if (data.useItemHook) triggers = ['afterItemUse', 'postUseActivity'];
    else if (activity?.type === 'summon') triggers = ['afterSummon'];
    else triggers = ITEM_TRIGGERS;
  } else {
    // An effect the activity applies counts as part of the activity (e.g. Witch Bolt: BLFX animates
    // the bolt through its "Sustained Lightning" effect, not on the attack roll).
    triggers = activity?.effects?.length ? [...ITEM_TRIGGERS, 'afterActiveEffects'] : ITEM_TRIGGERS;
  }

  return blfxWillAnimate(item, activity, triggers, roll);
}

const sameActivityMode = () => game.settings.get(ID, 'matchMode') !== 'trigger';

/* -------------------------------------------- */
/*  BLFX prediction                             */
/* -------------------------------------------- */

/**
 * Would BLFX play something for this item/activity on any of the given triggers?
 * Follows BlfxMacroExecutor.callMacro → executeAutomaticRecognition step by step.
 */
export async function blfxWillAnimate(item, activity, triggers, roll) {
  const X = blfx.BlfxMacroExecutor;
  if (!(item instanceof Item) || !item.isEmbedded) return false; // BLFX ignores unowned items
  if (!game.modules.get('sequencer')?.active) return false;
  if (X.isDnDVersion4() && !activity) return false;

  for (const trigger of triggers) {
    // 1) A custom animation made in the BLFX Animation Editor.
    //    If one exists for the activity, BLFX never falls back to auto-recognition for it.
    const script = X.getMacroScript(item, trigger, activity);
    if (script) {
      if (!activity) return true;
      const flags = foundry.utils.getProperty(item, `flags.${BLFX}`) ?? {};
      const eventType = flags[activity.id]?.eventType ?? flags[activity.name]?.eventType;
      if (blfx.TRIGGER_MAP[eventType] === trigger) return true;
      continue;
    }

    // 2) BLFX auto-recognition.
    if (!X.isAutoRecognitionEnabled(item, trigger, activity)) continue;
    const ar = await X.getAutoRecognitionAnimation({ item, roll, activity, trigger });
    if (!(ar?.macro instanceof Function)) continue; // includes Custom Auto-Rec "blocker" entries
    const only = ar.defaultParams?.playOnlyForActivityType;
    if (only && activity && only !== activity.type) continue;
    return true;
  }
  return false;
}

/**
 * Would BLFX play something for this active effect? (BLFX hooks.js _afterActiveEffect)
 * In "same activity" mode, BLFX animating the effect's activity at any moment counts too.
 */
export async function blfxWillAnimateEffect(effect, { withActivity = sameActivityMode() } = {}) {
  if (!effect) return false;
  const item = await originItem(effect);

  if (!(item instanceof Item)) {
    // Status conditions: BLFX plays its own condition animations if enabled.
    if (!game.settings.get(BLFX, 'blfxConditionAnimation')) return false;
    if (!game.modules.get('sequencer')?.active) return false;
    const condition = effect.statuses?.first?.() ?? slugify(effect.name);
    return BLFX_CONDITIONS.has(condition);
  }

  const activity = await originActivity(item, effect);
  return blfxWillAnimate(item, activity, withActivity ? ['afterActiveEffects', ...ITEM_TRIGGERS] : ['afterActiveEffects']);
}

// Same resolution order as BLFX hooks.js getItem()
async function originItem(effect) {
  if (effect.statuses?.has?.('concentrating')) return null;
  const uuid = effect.system?.origin?.activity ?? effect.system?.origin?.item ?? effect._source?.origin;
  const origin = uuid ? await fromUuid(uuid) : null;
  const source = origin?.parent;
  if (origin?.item instanceof Item) return origin.item;
  if (source instanceof Item) return source;
  if (origin instanceof Item) return origin;
  if (source instanceof Actor) {
    const sourceItem = origin._source?.origin ? await fromUuid(origin._source.origin) : null;
    if (sourceItem instanceof Item) return sourceItem;
    return source.items?.getName(effect.name) ?? null;
  }
  if (source instanceof ActiveEffect) return source.getSource();
  const itemUuid = foundry.utils.getProperty(effect, `flags.${BLFX}.blfxCustom.originItem`);
  const item = itemUuid ? await fromUuid(itemUuid) : null;
  return item instanceof Item ? item : null;
}

// Same resolution order as BLFX hooks.js getActivity()
async function originActivity(item, effect) {
  if (foundry.utils.isNewerVersion(game.system.version, '6.0')) {
    const uuid = effect.system?.origin?.activity;
    if (uuid) return fromUuid(uuid);
  }
  for (const activity of item.system.activities?.contents ?? []) {
    if (activity.effects?.some(e => e.effect?.name === effect.name)) return activity;
  }
  const uuid = foundry.utils.getProperty(effect, `flags.${BLFX}.blfxCustom.originActivity`);
  return uuid ? fromUuid(uuid) : null;
}

// Same as BLFX helperFunctions.slugify
function slugify(input) {
  if (!input) return '';
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).join('-');
}

/* -------------------------------------------- */
/*  A-A first: wrap BLFX                        */
/* -------------------------------------------- */

// BLFX trigger → the A-A moment that would collide with it.
const MOMENT_OF_TRIGGER = {
  afterAttack: 'attack', afterThrown: 'attack', afterDamage: 'damage',
  afterItemUse: 'use', postUseActivity: 'use',
  createTemplate: 'template', destroyTemplate: 'template', afterSummon: 'summon',
};

/**
 * Wrap BLFX's three entry points. hooks.js calls them as BlfxMacroExecutor.callMacro(...), so
 * replacing the static methods on the shared class reaches every BLFX trigger.
 */
function wrapBlfx(X) {
  for (const name of ['callMacro', 'callAoeMacro', 'callConditionMacro']) {
    const original = X[name];
    if (typeof original !== 'function') {
      console.warn(`${ID} | BLFX ${name} not found; "Automated Animations first" can't skip it.`);
      continue;
    }
    X[name] = async function (args = {}) {
      if (game.settings.get(ID, 'enabled') && !blfxFirst()) {
        try {
          if (aaWillAnimateForBlfx(name, args)) {
            log('Skipping BLFX (A-A animates this):', args.item?.name ?? args.effect?.name, args.trigger ?? name, args);
            return;
          }
        } catch (err) {
          console.warn(`${ID} | Check failed, letting BLFX play.`, err);
        }
      }
      return original.call(this, args);
    };
  }
}

/* -------------------------------------------- */
/*  BLFX line length fix                        */
/* -------------------------------------------- */

/**
 * Workaround for a BLFX bug (3.6.1): helperData.getAnimationForRayTemplate swaps "width-XXft" in a
 * line animation for the template's length (10/20/30/60/90) without checking the file exists, e.g.
 * acid breath only has width-30ft, so a 60 ft line asks for a missing asset and nothing plays.
 * If BLFX's pick doesn't exist, use the closest length that does (the line macro stretches the
 * animation to the template anyway), else BLFX's original name. Does nothing once BLFX checks itself.
 */
function fixLineLength(helpers) {
  const original = helpers?.getAnimationForRayTemplate;
  if (typeof original !== 'function') {
    console.warn(`${ID} | BLFX getAnimationForRayTemplate not found; line length fix not applied.`);
    return;
  }
  helpers.getAnimationForRayTemplate = function (animation, templateDocument) {
    const picked = original.call(this, animation, templateDocument);
    try {
      if (typeof picked !== 'string' || picked === animation || hasAsset(picked)) return picked;
      const fallback = closestLength(picked) ?? animation;
      log('BLFX line animation not found, using', fallback, 'instead of', picked);
      return fallback;
    } catch (err) {
      console.warn(`${ID} | Line length check failed, keeping BLFX's pick.`, err);
      return picked;
    }
  };
}

const LINE_LENGTHS = [10, 20, 30, 60, 90];
const hasAsset = name => Boolean(globalThis.Sequencer?.Database?.getEntry(name, { softFail: true }));

function closestLength(name) {
  const wanted = Number(name.match(/width-(\d+)ft/)?.[1]);
  if (!wanted) return null;
  const best = LINE_LENGTHS
    .filter(n => n !== wanted)
    .sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || b - a) // tie: the longer file
    .map(n => name.replace(/width-\d+ft/, `width-${n}ft`))
    .find(hasAsset);
  return best ?? null;
}

function aaWillAnimateForBlfx(entryPoint, { item, activity, effect, trigger }) {
  if (entryPoint === 'callConditionMacro') return aaWillAnimateEffect(effect);
  // In "same activity" mode an effect counts as part of the activity that applies it, both ways.
  if (trigger === 'afterActiveEffects' || trigger === 'deleteActiveEffects') {
    return aaWillAnimateEffect(effect) || (sameActivityMode() && aaMoments(item, activity).size > 0);
  }

  const moment = MOMENT_OF_TRIGGER[trigger];
  if (!moment) return false; // saving throws, skills, formulas, combat, damage taken: A-A doesn't animate these
  const moments = aaMoments(item, activity);
  if (!sameActivityMode()) return moments.has(moment);
  return moments.size > 0 || (activity?.effects ?? []).some(e => e.effect && aaWillAnimateEffect(e.effect));
}

/* -------------------------------------------- */
/*  A-A prediction                              */
/* -------------------------------------------- */

const aaSetting = key => {
  try { return game.settings.get(AA, key); } catch { return undefined; }
};
const aaOff = () => aaSetting('killAllAnim') === 'off';

/** Would A-A play something for this activity at any moment? */
export function aaWillAnimate(item, activity) {
  return aaMoments(item, activity).size > 0;
}

/**
 * The moments (attack, damage, use, template, summon) at which A-A animates this activity.
 * Mirrors the dnd5e hooks in A-A src/system-support/aa-dnd5e.js and the extra menu checks in its
 * useItem() / summon() handlers.
 */
function aaMoments(item, activity) {
  const moments = new Set();
  if (!(item instanceof Item) || !activity || aaOff()) return moments;
  if (activity.description?.chatFlavor?.includes('[noaa]')) return moments;

  const areaTypes = Object.keys(CONFIG.DND5E?.areaTargetTypes ?? {});
  if (areaTypes.includes(activity.target?.template?.type)) {
    if (aaLookup(item, activity, { isTemplate: true })) moments.add('template');
    return moments;
  }

  const anim = aaLookup(item, activity);
  if (!anim) return moments;
  const playOnDamage = !!aaSetting('playonDamageCore');
  const hasDamage = !!activity.damage?.parts?.length;
  const type = activity.type;

  if (type === 'attack' && !(hasDamage && playOnDamage)) moments.add('attack');
  if ((hasDamage || type === 'heal') && (type !== 'attack' || playOnDamage)) moments.add('damage');
  if (!hasDamage && type !== 'heal' && !(type === 'summon' && anim.menu === 'range')) moments.add('use');
  if (type === 'summon' && anim.menu === 'range') moments.add('summon');
  return moments;
}

/** Would A-A play an effect animation for this active effect? (A-A active-effects/handleActiveEffects.js) */
export function aaWillAnimateEffect(effect) {
  if (!effect || effect.disabled || aaOff() || aaSetting('disableAEAnimations')) return false;
  // On creation A-A copies the flags of the item the effect sits on onto the effect.
  const flags = effect.parent instanceof Item && effect.parent.flags?.[AA] ? aaFlags(effect.parent) : aaFlags(effect);
  return !!aaLookup(effect, null, { activeEffect: true, flags });
}

/** Mirrors A-A src/system-handlers/findAnimation.js handleItem() (without ammo and PF2e variants). */
function aaLookup(doc, activity, { isTemplate = false, activeEffect = false, flags } = {}) {
  const name = doc.name ?? doc.label;
  const rinsedName = name ? rinse(name) : 'noitem';
  const docFlags = (flags !== undefined ? flags : aaFlags(doc)) ?? {};
  const activityFlags = activity ? aaFlags(activity) ?? {} : null;
  const autorecDisabled = !!aaSetting('disableAutoRec');

  const entries = { ...(globalThis.AutomatedAnimations?.AutorecManager?.getAutorecEntries?.() ?? {}) };
  delete entries.version;
  if (!activeEffect) entries.aefx = [];
  const menus = sortAndFilterMenus(entries);

  if (activityFlags && (activityFlags.killAnim || activityFlags.isEnabled === false)) return false;
  if (docFlags.killAnim || docFlags.isEnabled === false) return false;

  if (activeEffect) {
    if (docFlags.isCustomized) return docFlags;
    return autorecDisabled ? false : singleMenuSearch(entries.aefx ?? [], rinsedName, name);
  }

  if (activityFlags?.isCustomized) return activityFlags;
  if (docFlags.isCustomized) return docFlags;
  if (autorecDisabled) return false;

  const overrideNames = activity?.name && !['heal', 'summon'].includes(activity.name.trim()) ? [activity.name] : [];
  let found = false;
  for (const n of [...overrideNames, name]) {
    found = allMenuSearch(menus, rinse(n), n);
    if (found) break;
  }
  if (found && isTemplate && ['range', 'melee', 'ontoken'].includes(found.menu)) {
    found = singleMenuSearch(entries.templatefx ?? [], rinsedName, name);
  }
  return found;
}

// Mirrors A-A src/autorec/flags.js getFlags() (SCHEMA_VERSION 5 in src/data/entries.js)
const AA_SCHEMA_VERSION = 5;
function aaFlags(doc) {
  if (!doc) return undefined;
  const source = { document: doc, path: 'flags', key: doc.uuid ?? doc.id };
  Hooks.callAll('aa.flagSource', doc, source);
  const flags = foundry.utils.getProperty(source.document, source.path)?.[AA] ?? doc.flags?.[AA];
  if (!flags || !(Number(flags.version) >= AA_SCHEMA_VERSION)) return undefined;
  return flags;
}

// Mirrors A-A src/autorec/search.js AAAutorecFunctions
const rinse = name => name?.replace(/\s+/g, '').toLowerCase();
function sortAndFilterMenus(menus) {
  const entries = Object.values(menus).flat().filter(e => e?.label);
  entries.sort((a, b) => rinse(b.label).length - rinse(a.label).length);
  return {
    exactMatchMenus: entries.filter(x => x.advanced?.exactMatch),
    bestMatchMenus: entries.filter(x => !x.advanced?.exactMatch),
  };
}
function allMenuSearch(menus, rinsedName, trueName) {
  if (!rinsedName) return false;
  return menus.exactMatchMenus.find(x => x.label === trueName)
    || menus.bestMatchMenus.find(x => rinsedName.includes(rinse(x.label))
      && !x.advanced?.excludedTerms?.some(term => term && rinsedName.includes(rinse(term))))
    || false;
}
function singleMenuSearch(menu, rinsedName, trueName) {
  if (!rinsedName) return false;
  const entries = Array.isArray(menu) ? menu : Object.values(menu).flat();
  return allMenuSearch(sortAndFilterMenus({ menu: entries }), rinsedName, trueName);
}
