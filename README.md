# Nik's Animation Dedupe

Use Automated Animations and Boss Loot FX together without seeing two animations for one action. When both would
animate the same item, effect or condition, only the module you give priority plays (Boss Loot FX by default).
Everything it doesn't animate still gets the other module's animation, so you can keep both setups complete.

- Foundry VTT 14
- D&D 5e
- Requires [Automated Animations](https://github.com/theripper93/autoanimations) and Boss Loot FX
  (BLFX Animation Editor Premium)

## Installation

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://github.com/nschoenwald/niks-animation-dedupe/releases/latest/download/module.json
```

## Boss Loot FX first (default)

Automated Animations is skipped when Boss Loot FX will play:

- an animation you made for the item in the BLFX Animation Editor,
- a BLFX automatic animation: weapons by their base weapon (so a *Flame Tongue Longsword* counts as a longsword),
  spells and features by name, Boss Loot items, and your entries in the BLFX Custom Auto-Rec list,
- a BLFX animation for an effect, such as the glow of *Bless*, matched to the spell or feature it comes from,
- a BLFX condition animation (Blinded, Charmed, Poisoned and the other conditions BLFX animates).

Boss Loot FX's own switches are respected: if its automatic animations or condition animations are turned off, or
automatic animations are turned off for an activity, Automated Animations plays as usual.

## Automated Animations first

Boss Loot FX is skipped when Automated Animations will play:

- an animation set on the item or activity in its Automated Animations menu,
- an animation from the Automated Animations Global Menu that matches the activity or item name, the same way
  Automated Animations finds it (including exact matches and excluded terms),
- an Automated Animations effect animation for the effect or condition, matched by its name.

Automated Animations' own switches are respected: animations turned off on an item or activity, the Global Menu or
effect animations turned off in its settings, or all animations turned off. Its *play on damage* setting decides
whether it animates the attack or the damage roll.

Boss Loot FX animations that Automated Animations never plays, such as on saving throws or when damage is taken,
always play.

## How it works

The module reads both modules' own animation lists and settings while you play, so new animations and changes to
your menus are picked up without an update. If an update of either module ever changes how it works inside, this
module stops interfering and both play as usual.

## Settings

- **Prevent double animations**: turns the module on and off.
- **Priority**: which module plays when both would animate the same thing: *Boss Loot FX* (default) or
  *Automated Animations*.
- **What counts as a duplicate**:
  - *Same activity* (default): the other module is skipped if the module with priority animates the activity at any
    moment: attack, damage, use, template or summon. This also covers one module playing on the attack roll and the
    other on the damage roll. An effect counts as part of the activity that applies it: Boss Loot FX animates *Witch
    Bolt* through its lingering *Sustained Lightning* effect, so Automated Animations' Witch Bolt animation on the
    attack is skipped too.
  - *Same moment only*: the other module is skipped only if both would animate that exact moment, and effects are
    only compared with effects.

  Conditions such as Poisoned are always compared with each other only.
- **Debug logging**: writes every skipped and allowed animation to the browser console.

## Modules by Nik

### 🧩 Nik's Tweaks
* **[Nik's Foundry Tweaks](https://github.com/nschoenwald/niks-foundry-tweaks)** – System-independent quality-of-life tweaks and the shared settings dashboard of Nik's Tweaks modules.

### 🎲 D&D 5e Specific
* **[Nik's DnD5e Tweaks](https://github.com/nschoenwald/niks-dnd5e-tweaks)** – Consolidated collection of quality-of-life enhancements and combat automation tweaks for DnD5e.
* **[Nik's Give & Take](https://github.com/nschoenwald/niks-give-and-take)** – Players hand items and money to other characters and the party, and take them from the party's stash.
* **[Nik's Animation Dedupe](https://github.com/nschoenwald/niks-animation-dedupe)** – Automated Animations and Boss Loot FX never both animate the same thing; you choose which one has priority.

### ⚔️ Combat & Token Tools
* **[Nik's Action HUD](https://github.com/nschoenwald/niks-action-hud)** – Sleek, modern canvas-docked Action HUD for quick access to attacks, spells, inventory, and utility rolls.
* **[Nik's Effects Panel](https://github.com/nschoenwald/niks-effects-panel)** – Floating panel next to the sidebar that shows the selected token's active effects, to check, disable or remove them without opening the character sheet.
* **[Nik's Token Tags](https://github.com/nschoenwald/niks-token-tags)** – Automatically numbers duplicate combatant NPCs (A, B, C…) with color-coded letter overlays.
* **[Nik's Shared NPC Initiative](https://github.com/nschoenwald/niks-shared-npc-initiative)** – Groups NPCs of the same type in combat so they share a single initiative roll.
* **[Nik's Movement Control](https://github.com/nschoenwald/niks-movement-control)** – GM controls to toggle player movement and automatically restrict/allow movement on combat start and end.
* **[Nik's Token Motion](https://github.com/nschoenwald/niks-token-motion)** – Tokens hop square by square like miniatures, lift and set down like chess pieces, or glide smoothly, and long moves no longer crawl across the map.
* **[Nik's Tiny Change Logs](https://github.com/nschoenwald/niks-tiny-changelogs)** – Compact, single-line chat messages logging token HP and Temp HP changes.

### 🎨 Visuals & Display
* **[Nik's Dynamic Roll Area](https://github.com/nschoenwald/niks-dynamic-roll-area)** – Dynamically restricts Dice So Nice 3D dice rolling area to exclude the sidebar / chat log across all screen resolutions and window sizes.

### ⚙️ Utilities & System Management
* **[Nik's Settings Locks](https://github.com/nschoenwald/niks-settings-locks)** – Soft-lock and hard-lock client settings and keybindings across all connected players.
* **[Nik's Compendium Search Tweaks](https://github.com/nschoenwald/niks-compendium-search-tweaks)** – Configure which compendium packs are included or excluded from native sidebar search.
* **[Nik's Copy Environment](https://github.com/nschoenwald/niks-copy-environment)** – Copy the list of systems, modules, and versions, and export/import game and player settings.
* **[Nik's Show & Tell](https://github.com/nschoenwald/niks-show-and-tell)** – Share popout images to chat and paste image files directly into chat messages.
* **[Nik's Zoom / Pan Options](https://github.com/nschoenwald/niks-zoom-pan-options)** – Touchpad and scroll wheel pan/zoom controls and canvas navigation enhancements.
* **[Nik's Scene Transformations](https://github.com/nschoenwald/niks-scene-transformations)** – Rotate scenes or add playable space around them, with tokens, walls, lights, tiles and regions moved along so everything stays in place.
* **[Nik's Wall Height](https://github.com/nschoenwald/niks-wall-height)** – Give walls a bottom and top elevation, so tokens, lights and sounds above or below a wall ignore it.
* **[Nik's Scene Defaults](https://github.com/nschoenwald/niks-scene-defaults)** – Set your own defaults for new scenes (grid, vision, fog, lighting, background and more), so you don't have to change them on every scene.

## License

MIT
