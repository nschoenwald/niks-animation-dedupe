# Changelog

All notable changes to Nik's Animation Dedupe are documented in this file.

## [14.0.0] - 2026-11-17
### Added
- **No more double animations**: When Boss Loot FX is going to animate an item, effect or condition, Automated Animations doesn't play its own animation for it. Everything Boss Loot FX doesn't animate still gets its Automated Animations animation.
- **Covers all of Boss Loot FX**: Animations made in the BLFX Animation Editor, BLFX automatic animations (including your Custom Auto-Rec list), effect animations and condition animations. Boss Loot FX's own on/off switches are respected.
- **What counts as a duplicate**: Choose whether Automated Animations is skipped for the whole activity when Boss Loot FX animates it, or only at the exact same moment (for example only on the attack roll).
- **Debug logging**: See in the browser console which animations were skipped and which were allowed.
