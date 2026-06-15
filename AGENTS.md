# Agent Notes

This fork is used together with `opencode-obsidian` in a real Obsidian vault. Do not treat it as a generic cosmetic plugin while debugging the current background issue.

## Current Decision

The background image owner is `body::before`.

Reason:

- `body::before` covers the whole Obsidian document, including the workspace, sidebars, settings modal, and other modal surfaces.
- The user wants one background image to remain visually meaningful across Obsidian, not one independently cropped image per pane.
- `.workspace::before` was tested as an experiment and made the visual model harder to reason about. It also does not naturally cover settings/modal surfaces.
- Keeping both `body::before` and `.workspace::before` would create two background owners. That can double opacity, create different crop geometry, and make later artifacts impossible to attribute.

Do not reintroduce `.workspace::before` unless the goal is explicitly a short-lived experiment, and record diagnostics before deciding whether to keep or remove it.

## Why This Change Exists

The older model let each editor surface draw its own copy of the background image. That worked for a narrow editor-only goal, but it breaks the current local goal: the image should remain meaningful when the user opens sidebars, settings, and `opencode-obsidian`.

The current fork treats the background as an app-level visual plane:

1. `Plugin.ts` writes the image, opacity, blur/filter, position, repeat, size, and blend mode to `document.body`.
2. `styles.css` draws that single plane with `body.obsidian-editor-background-workspace::before`.
3. Obsidian workspace containers become transparent enough to reveal the plane.
4. Chrome-like surfaces such as ribbons and tab headers keep a light material layer so the UI is still readable.

This is reasonable only while there is one background owner. If another rule starts painting the same image on `.workspace`, `.cm-editor`, `.markdown-reading-view`, or an OpenCode iframe host layer, the model becomes ambiguous again.

## What Reasonable Means Here

A reasonable change keeps these properties true:

- One image owner in the parent Obsidian document.
- One crop geometry for the parent Obsidian document.
- CSS variables describe the owner; they do not create another owner.
- Material layers can tint the image, but they should be broad UI surfaces, not one-off fixes for a screenshot.
- Diagnostics may observe CodeMirror, focus, iframe, and workspace state, but diagnostics must not silently repair them.

The expected tradeoff is that Obsidian panes can have different material density. That is acceptable when the difference comes from intentional UI surface treatment. It is not acceptable when the difference comes from two background images, two crops, or hidden selector patches.

Active tab headers belong to the broad chrome material layer. If an active tab becomes a large opaque black rectangle, fix the active tab chrome material together with the rest of the tab header system. Do not treat the file title or one tab as a special case.

## CSS Boundary

The plugin owns these layers:

- `body.obsidian-editor-background-workspace::before`: the single background image plane.
- Obsidian workspace and pane container transparency needed to reveal that plane.
- Settings modal container transparency needed to avoid a large black settings panel hiding the image.
- Broad chrome material for tab headers, active tab headers, ribbon, and status bar.

The plugin does not own these layers:

- CodeMirror active line styling.
- Selection styling.
- Table row hover or active row styling.
- Resize handles.
- OpenCode Web UI internals.
- OpenCode iframe internal document styling.

Do not hide individual editor selectors to chase one screenshot. That creates compensation code and hides the actual rendering state.

## Variables

The plugin writes a workspace background contract to `document.body`:

- `--obsidian-workspace-background-contract`
- `--obsidian-workspace-background-image`
- `--obsidian-workspace-background-opacity`
- `--obsidian-workspace-background-filter`
- `--obsidian-workspace-background-position`
- `--obsidian-workspace-background-size`
- `--obsidian-workspace-background-repeat`
- `--obsidian-workspace-background-blend-mode`

It also keeps the legacy `--obsidian-editor-background-*` variables for compatibility with older CSS and dependent integrations.

The workspace variables are the stable surface that other local plugins may read. They do not give other plugins ownership of the parent-window background image.

`--obsidian-workspace-background-filter` is part of the owner contract and must be consumed by the single `body::before` image plane. If the setting is written but CSS ignores it, the contract is lying.

`--obsidian-editor-background-*` variables are compatibility output. Do not use them to restore editor-local image pseudo-elements unless the product goal explicitly changes back to editor-only backgrounds.

## Diagnostics

Diagnostics are part of this fork because the real issue has crossed plugin boundaries.

Keep diagnostic output compact by default:

- `Copy background point diagnostics` may include deeper local detail because it is a single point capture.
- Trace and click-capture diagnostics must use compact point stacks and compact visible dark layers.
- Do not dump repeated full computed styles across every frame.
- Prefer stable labels such as `main-markdown:left-rail-upper` over ad hoc screenshot descriptions.

The diagnostics should explain what layer owns what. They should not become a repair mechanism.

## Experiments

A rendering experiment must be reversible and named by the exact owner being tested.

Acceptable experiment examples:

- Disable OpenCode iframe internal background plane for one run.
- Move the parent background owner from `body::before` to `.workspace::before` for one run.
- Make iframe root opaque for one run.

Before keeping an experiment:

- Capture diagnostics in the experiment state.
- Explain what changed and what did not change.
- Remove the experiment if it only adds another layer or another owner.

The `.workspace::before` experiment was a weak hypothesis about the lowest fixed layer interacting with iframe focus and Electron composition. It did not become a stronger model. The retained architecture is `body::before` because it matches the product goal better and keeps one owner.

Do not keep an experiment because it makes one screenshot look better. Keep it only if it reduces the number of owners, reduces ambiguous crop geometry, or gives diagnostics that explain a previously invisible state.

## Commit Hygiene

Keep unrelated visual experiments out of the same commit.

Good commit shapes:

- "Use body-level workspace background contract"
- "Add compact background diagnostics"
- "Make settings modal containers transparent"

Bad commit shapes:

- Mixing diagnostics, owner changes, OpenCode iframe CSS, and selector-specific editor patches.
- Keeping failed experiments as dead CSS.
- Reintroducing both `body::before` and `.workspace::before`.
