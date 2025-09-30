# Changelog

## [1.0.2] - 2025-09-27
### Added
- **Actor Picker (Hub)**
  - New input field for pasting Actor ID/UUID.
  - “Pick” button opens a dialog with Actors, Scene Tokens, and Actor Compendiums.
  - Toggles to show/hide specific compendiums and scene tokens.
  - Displays the selected Actor’s name with a button to open its sheet.
  - Picker filter settings now persist per-user.

- **Ability Assigner**
  - New **Manual Input** mode for typing ability scores directly.
  - Point Buy now updates live with clearer remaining budget.
  - Ability assignment refactor: can clear and reassign values more flexibly.

- **Class Assigner**
  - Support for class categorization using `system.classType`.
    - Recognized: `base`, `prestige`, `minion`, `racial` (ignores `template`).
  - Expanded pack scanning:
    - `D35E.classes`
    - Any pack ending in `.classes`
    - Packs titled “Classes”, “Minion Classes”, “Racial HD”
  - Additional Classes rows now group options under Base / Prestige / Minion / Racial headings.

- **Settings**
  - World setting: *“AAM: Refactor attacks after stat/class changes”*.  
    - When enabled, automatically normalizes attack items after stat/class updates.

### Changed
- **Hub Window**
  - Resizable with working resize handle.
  - Improved layout/styling consistency.

- **Ability Assigner**
  - Custom Array input fixed (resizable, accepts proper input).
  - Manual Mapping toggle now works correctly in Roll mode.
  - Primary/Secondary & Manual Mapping controls hidden in Manual Input mode.

- **Class Assigner**
  - Dropdowns reliably populated after render.
  - Toggles enable/disable their associated select + level fields correctly.
  - Existing classes on the Actor are displayed again and count toward level cap.

### Fixed
- Players can no longer open/edit actors or compendium entries they don’t own.
- Locked (read-only) compendiums are marked with a padlock/tinted in the picker and are unchecked by default.

---

## [1.0.1] - 2025-09-20
-Added the ability to choose actors from multiple locations.
-Added visible indicators of locked compendiums that may not allow actors within to be edited and saved.
-Added permission checking to limit scope to allowed actors based on ownership/user level.

---
  
## [1.0.0] - 2025-09-15
Initial public beta release of **Axecleft’s Adventurers and Minions**.
