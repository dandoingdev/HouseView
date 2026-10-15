# Changelog

All notable changes to HouseView are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).
The release workflow publishes the section of the tagged version as the release notes.

## [Unreleased]

### Fixed

* The date, calendar, music, sensor and weather widgets are now sized from their own tile (container queries) instead of the
  screen, so they fit any cell: a wide short strip no longer clips the big day number, the music widget switches to a
  compact strip in short tiles, and sensor and weather values no longer overflow in small tiles.

### Added

* `home_overview: true` (a switch in the card editor) adds the home overview as the first page of the carousel without placing a
  card; `home_title` sets its title. Off by default.

* **Home overview** (`custom:houseview-home-overview-card`, `type: home`): a scrollable home screen that builds itself from the
  widgets on the carousel: a large title with the time, chips for climate (the temperature range), lights (how many are on),
  locks (how many are locked, amber when one is open) and media, up to three rounded camera snapshots with a "2m ago" label,
  and a tile for every scene. Chips and headings jump to the page of the first widget of their kind, a camera opens the camera
  gallery (or more-info) and a scene runs. See `examples/home-overview.yaml`.
* Framework: an overview can be `interactive` (buttons in card mode, from an allow-list of actions), `watch(options, config)`
  receives the card config, and the new core action `goto-widget` (`widget:<index>`) jumps to the page that holds a widget.
* The live preview in Home Assistant's card editor now shows the dashboard as a wall tablet (landscape by default) scaled to fit
  the preview box, instead of a narrow phone-shaped column. `editor_preview: portrait` or `auto` changes that.

### Changed

* The page `layout` option is gone. There is one layout, configured by each widget's `size` and the page's `columns`
  (2 to 5, landscape only; phones and portrait tablets use 2). Old `layout:` keys are ignored, with no error. The tile
  look that only `layout: controls` pages had now applies to every page, and the `modular` and `kitchen` arrangements are
  replaced by sizes: see the Kitchen page of `examples/kitchen.yaml`. `columns` must now be a whole number from 2 to 5.

## [1.0.0] - 2026-10-15

First public release.

### Added

* **The carousel**, `custom:houseview-card`: swipeable, screen-sized pages of widgets with `auto`, `grid`, `controls`,
  `modular` and `kitchen` layouts, numbered continuation pages, page dots and arrows, arrow-key navigation, and Home
  Assistant cards (`entities`, `markdown`, ...) placed on a page with `view_layout`.
* **16 widgets**, each usable in the carousel and as a card of its own (`custom:houseview-<type>-card`, or
  `custom:houseview-widget-card` with `widget_type`): clock, date, calendar, camera, thermostat, light, switch, fan, blinds,
  lock, sensor, weather, music player, timer, alarm panel and action.
* **5 overviews**: the weather scene (CSS sky, forecast range, up to six details, a small widget form), the photo frame
  (photos from a Home Assistant media folder), the month calendar, the timer display and the album cover art. Overviews can
  be screensavers (after `idle_timeout` seconds; the first tap only wakes the dashboard), automatic displays, opened by
  pressing a widget, or used as cards. A `screensaver` list takes turns; some overviews rank above others; edit mode, the
  camera grid, the timer alarm and pending service calls hold a screensaver back.
* **Automatic displays**: `timer_display` shows the timer display while a timer runs; `music_screensaver` shows the album
  cover when the screensaver would start and a speaker is playing; `calendar_view` lets the clock, date and calendar widgets
  open the month calendar.
* **Camera grid** (`camera_gallery`) for up to four cameras, with snapshots or streams.
* **Looks**: `glass`, `soft`, `teal`, `silver` and `champagne` surfaces, one `wallpaper` for every page, `stone` and
  `forest` palettes, light, dark and automatic appearance, `high_contrast`, and `bedtime` with a Dim button.
* **Performance**: `performance: auto | full | lite`. `auto` picks the lite look (opaque glass, no decorative animation, a still
  weather scene) on devices with 2 GB of memory or less, 4 cores or fewer, or an old Android WebView. A covering overview
  stops all other work. A benchmark page measures a real tablet.
* **Tablet mode**: `?tablet=1` or `tablet_mode: true` hides Home Assistant's sidebar and header.
* **Home Assistant conventions**: card picker entries and a visual editor for the carousel and every widget,
  `tap_action`, `hold_action` and `double_tap_action` (`more-info`, `toggle`, `perform-action`, `navigate`, `url`, `none`)
  with optional confirmation, `confirm_mode: inline`, `localized_states`, and an optional Home Assistant theme.
* **Developer tooling**: a widget and an overview contract with linters, scaffolding (`npm run new:widget`,
  `npm run new:overview`), generated documentation pages, unit, browser and real-input test suites, and a production build
  into a single file.

### Notes

* Requires Home Assistant 2024.8.0 or newer and a browser based on Chrome 105 or later.
* Interface text is English. Dates, times and numbers follow your Home Assistant language; the weather overview also ships
  German text.
* Tablet mode and the edit-mode detection of screensavers reach into Home Assistant frontend internals that are not a public
  API. They are feature-detected and fail safe, but a Home Assistant update can stop them from working.
* HouseView is an independent project, not affiliated with Apple, Home Assistant or Nabu Casa.

[1.0.0]: https://github.com/dandoingdev/HouseView/releases/tag/v1.0.0
