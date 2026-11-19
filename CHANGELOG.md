# Changelog

All notable changes to Nik's Animation Dedupe are documented in this file.

## [14.3.0] - 2026-11-19
### Added
- **Priority by name**: Pick the module that plays for specific items, effects or conditions, overriding *Priority* for them. Open the list from the module settings and enter a name (for example *Witch Bolt*) or an identifier (*witch-bolt*). Effects and conditions also match by their status or by the item they come from.

## [14.2.0] - 2026-11-18
### Fixed
- **Boss Loot FX line animations not playing on some lengths**: Boss Loot FX picks a line animation by the length of the line, even when it has no version for that length. A 60 ft Acid Breath line then played nothing and showed an "Invalid Asset" error in the console. The closest length that exists now plays, stretched to the line. This is a workaround until Boss Loot FX fixes it, and stops doing anything once it does.

## [14.1.0] - 2026-11-17
### Added
- **Choose which module has priority**: New setting *Priority*. Keep Boss Loot FX first (the default, as before), or let Automated Animations go first: then Boss Loot FX is skipped wherever Automated Animations plays an animation, including effect and condition animations. Automated Animations' own switches and its *play on damage* setting are respected.

### Fixed
- **Witch Bolt played both animations**: Boss Loot FX animates Witch Bolt through its lingering lightning effect rather than on the attack roll, so Automated Animations' Witch Bolt animation played as well. With *Same activity*, an effect now counts as part of the activity that applies it, in both directions. This also affects other spells whose effect one module animates while the other animates the cast.

### Changed
- **Settings**: *Skip Automated Animations when BLFX animates* is now called *Prevent double animations*, and *What counts as a duplicate* applies to both directions.

## [14.0.0] - 2026-11-17
### Added
- **No more double animations**: When Boss Loot FX is going to animate an item, effect or condition, Automated Animations doesn't play its own animation for it. Everything Boss Loot FX doesn't animate still gets its Automated Animations animation.
- **Covers all of Boss Loot FX**: Animations made in the BLFX Animation Editor, BLFX automatic animations (including your Custom Auto-Rec list), effect animations and condition animations. Boss Loot FX's own on/off switches are respected.
- **What counts as a duplicate**: Choose whether Automated Animations is skipped for the whole activity when Boss Loot FX animates it, or only at the exact same moment (for example only on the attack roll).
- **Debug logging**: See in the browser console which animations were skipped and which were allowed.
