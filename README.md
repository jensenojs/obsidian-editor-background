# Obsidian Editor Background Plugin

This fork is maintained for personal BRAT installation across my Obsidian vaults.
It keeps the upstream editor background behavior and adds a workspace-level
background owner: one `body::before` image plane can show through the workspace,
sidebars, settings modal, and other Obsidian chrome.

The fork intentionally does not ship the temporary diagnostics that were used
while investigating Obsidian/OpenCode iframe rendering issues. The production
plugin should only own background image variables, the single workspace image
plane, and the minimal Obsidian container transparency needed to reveal that
plane.

This plugin is meant to provide an aesthetic background for the Editor view of Obsidian.
It currently only supports remote assets, so you'll need to host your own images.

As part of the settings, there's additional tweaking that's available, like modifying the
bluriness of the background, and the contrast of the input area.

I use animated gifs as my background, particularly ones by [waneella](https://waneella.com/).

## Settings Menu
![Settings](screenshots/SettingsMenu.jpg)

## Example 1
![Example 1](screenshots/Example1.jpg)

This example uses no bluriness and default input area contrast.

## Example 2
![Example 2](screenshots/Example2.jpg)

This example uses high degree of bluriness, with no input area contrast.
