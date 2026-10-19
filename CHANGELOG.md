# Changelog

All notable changes to HouseView are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).
The release workflow publishes the section of the tagged version as the release notes.

## [Unreleased]

### Added

* **Vacuum widget and cleaning panel.** A `vacuum.*` tile shows activity, the integration's status and battery. Tap it to open a full-screen panel for start, pause, stop, dock, spot, locate and fan speed. Commands follow the vacuum's supported features and current activity. `vacuum_view: false` keeps Home Assistant's own dialog on hold.
* **Full-screen music player** on small panel tiles. Tap the track title to open the same controls at a comfortable size. Hold still opens speaker settings. Close with X or Escape.
* **Tablet mode** is a switch in the carousel card editor. It still fills touch displays and leaves Home Assistant’s header and sidebar available on a mouse desktop.
* **Remove page** in the carousel card editor deletes that page and the cards on it. The last page stays.

## [1.3.3] - 2026-10-19

### Fixed

* A device command in flight disables that tile again. State updates were skipping tiles whose entity had not changed, so the pressed control stayed enabled until Home Assistant reported a new state.

### Updating

Install the release through HACS or replace the manual installation files, then refresh the Home Assistant frontend and any kiosk or companion-app cache. If the browser retains an older bundle, update the resource cache-busting version to `/local/houseview/houseview.js?v=1.3.3`.

## [1.3.2] - 2026-10-19

### Fixed

* Dashboard pages no longer jump up between swipes on slow devices. The header keeps its height while a page renders, instead of being removed and measured again on every screen.
* Pages follow the finger when Android or the browser enables reduced motion; release still settles immediately to respect the accessibility preference.
* Horizontal swipes can start with a small diagonal movement without being discarded as scrolling; clearly vertical gestures still scroll normally.

### Performance

* Analogue screensaver seconds sweep on the compositor instead of a one-second main-thread write. Hour, minute and date still update from the shared ticker; reduced motion keeps the JavaScript write. Lite leaves the sweep on because it is wall time, not decoration.
* Neighbour dashboard pages are built after layout settles, so a finger drag only translates. Commit still promotes the prepared face and applies state received during the gesture.
* A Home Assistant state update repaints only the tiles whose watched entities changed. Locale, units, time zone and dark mode still refresh every tile.
* Automatic battery discovery caches until the entity or device registry object is replaced. The home overview patches its clock, camera snapshots and attention rows in place instead of rebuilding the scene each minute.

### Updating

Install the release through HACS or replace the manual installation files, then refresh the Home Assistant frontend and any kiosk or companion-app cache. If the browser retains an older bundle, update the resource cache-busting version to `/local/houseview/houseview.js?v=1.3.2`.

## [1.3.1] - 2026-10-17

### Changed

* Clock screensavers fade their background to black after one visible minute and use soft grey text and hands. Selected colours return on the next activation; standalone clock cards stay unchanged.
* Dashboard pages follow horizontal drags, reveal the neighbouring page and slide into place on release, including in lite mode. Short or cancelled drags return to the current page, with resistance at either end and reduced-motion support.

### Fixed

* Stabilise render-purity checks across clock-second boundaries and wait for screensaver removal instead of a fixed sleep. CI and release validation now include real touch dashboard swipes.
* Page transitions keep the outgoing and incoming content aligned below the dashboard header, eliminating the upward jump between screens.
* Horizontal touch swipes now turn dashboard pages from the header and navigation bar as well as widgets, including on wall panels. Vertical scrolling and slider gestures remain available; secondary touches cannot turn a page.

## [1.3.0] - 2026-10-16

HouseView 1.3 improves everyday touch controls, adds configurable clock faces and speaker volume controls, and makes editing and updates more reliable on wall panels and tablets.

### Added

* **Clock overview and screensaver** with four faces: Bold and Sculpted analogue clocks, Digital · Classic, and Digital · Stacked. Works as a screensaver or a standalone `custom:houseview-clock-overview-card`, with optional seconds and date, Home Assistant time-zone support, localised dates and digital digits, and 12/24-hour digital time. No additional integration or entity is needed.
* **Clock appearance controls**: inherit the dashboard background by default or choose custom background and seconds colours with Home Assistant's native colour picker. Text and hands adapt to background brightness; RGB triplets and existing three- or six-digit hex YAML colours are supported. Returning to the dashboard background preserves the custom colour for later.
* **Full-screen speaker volume view** from the music widget's volume button, also available as `custom:houseview-volume-overview-card`. Drag vertically for immediate fill and percentage feedback; release sends one final volume command. Supports native keyboard controls and mute/unmute on compatible speakers. Opening the view never starts playback; zero volume does not stop playback.
* **Light colour controls** within the dimmer: a draggable colour field and white-temperature mode for supported lights. Actual colour changes apply directly; closing the view keeps the chosen colour. Brightness and colour controls follow Home Assistant updates without interrupting an active gesture.
* **Media seeking** by touch, mouse or keyboard on seek-capable tracks, including a separate 44px seek target in compact wall-panel tiles. Track changes cancel stale gestures and queued commands; unsupported players, live streams and tracks without a known duration do not seek.
* **Optional dashboard header** (`show_header`): the date on the left and the time centred above every page, following Home Assistant language, time format and time zone. Updates in place through the shared ticker and is available in the visual editor.

### Changed

* **Hold a widget to open its controls or settings**, while everyday taps retain their normal actions. Light dimmers open on hold; thermostat controls and native entity settings follow the same interaction pattern. Custom hold actions and double taps remain supported, swipes cancel pending holds, and releasing a completed hold does not trigger an extra tap. Right-click, the context-menu key and Shift+F10 provide keyboard/mouse access to the same widget controls or settings.
* **Larger round buttons and centred icons**: overview controls are at least 64 × 64 CSS pixels and scale up to 88px; shared dashboard navigation and transport controls are 56px. Shared icon-only button rules remove inherited spacing, while compact widget controls retain at least 44px touch targets.
* **Compact music layouts** keep volume, Browse, track information, seeking and playback controls within their tiles. Narrow tiles retain visible volume icons; playable idle speakers resume with the play button, and active players retain normal play/pause behaviour.

### Fixed

* **Editor previews follow the selected settings**: pages, continuation screens, newly added or empty pages, screensavers, automatic displays and the camera grid. Changes echoed back by Home Assistant do not steal focus or switch the preview unexpectedly; closing a section clears its overlay. Selected clock faces and preview selections survive detached replacement cards and reconnection.
* **Desktop dashboard editing remains reachable** with `tablet_mode: true`: mouse desktops retain Home Assistant's header and sidebar, while touch panels keep the full-screen layout. Dashboard editing and editor previews restore normal positioning even with `?tablet=1`.
* **Panel resizing and rotation** preserve the header, bottom navigation, overlays and touch controls across square, portrait and landscape displays, including older panel WebViews without container-unit support.
* **Seeking remains visible on 480px panels** after the navigation controls grow, with separate seek and playback targets that do not overlap.
* **Slow or changing device state** no longer causes intermediate volume/seek values to overtake the latest gesture. Cancelled drags restore local feedback; unavailable devices and invalid values send no command.

### Performance and development

* Share a bounded cache of 128 Intl formatters across clocks, calendars, photo dates, number labels and the header, retaining each caller's locale, time-zone and fallback behaviour.
* Cache registry-derived lists and availability lookups; traverse DOM siblings without temporary child arrays while preserving live controls, keyboard focus and loaded images. Light and volume views share their common level-control CSS and gesture handling.
* Correct the performance fixture so automatic timer/music overlays cannot hide the measured dashboard, and measure state updates against visible entities.
* Restore exact browser-suite check counts, reject unterminated CSS comments during build validation, and expand real touch, keyboard, resize, preview, clock, colour, volume, seeking and lifecycle regression coverage. CI and releases run the new panel, clock, volume, seeking and touch-target checks.
* Add `AGENTS.md` with touch-target, icon-alignment, compatibility, cache-lifetime and performance-verification rules for future AI-assisted changes. Update widget, overview, configuration and tablet documentation for the new behaviour.

### Updating

Install the release through HACS or replace the manual installation files, then refresh the Home Assistant frontend and any kiosk or companion-app cache. If the browser retains an older bundle, update the resource cache-busting version to `/local/houseview/houseview.js?v=1.3.0`.

Existing dashboard configurations remain supported. Note the interaction change for lights: tap for the everyday on/off action; hold to open brightness and colour controls. The new header is off by default. Select Clock in the screensaver editor to use the new faces.

## [1.2.0] - 2026-10-16

### Added

* A full-screen music favourites browser with artwork, six large tiles per page, Refresh, keyboard navigation and left/right swipes that match the dashboard.
* Media-card settings to select and reorder favourites for each speaker. Browsing and editing never starts playback.
* A **House needs attention** section in the home summary for open doors and windows, low batteries, lights left on and unavailable devices, with settings in the visual editor.
* Automatic battery discovery through `home_battery_auto`, using Home Assistant battery device classes and entity visibility rather than a saved list. Charging devices are excluded from percentage warnings; battery problem sensors are supported too.

### Changed

* The home summary has a close button and supports Escape, keeping scenes and other controls usable while it is open.
* Playlist artwork fills the tile width above its name. Accepted playback closes Browse and returns to the player; failed playback keeps the error visible.
* The README now explains HouseView's focus on making everyday home controls easy for everyone else.

### Fixed

* Waking the dashboard keeps its layout ready behind the screensaver, avoiding the flash and apparent reload on the first touch, including on tablets using reduced motion or lighter rendering.
* Swiping the music browser does not accidentally select a playlist when the gesture ends.
* Home summary scene taps run the scene without dismissing the view.
* Playlist covers use the original media-browser thumbnails instead of an unsupported Sonos favourite-image proxy; missing or broken images keep the centred playlist icon.
* Automatically discovered battery warnings refresh when batteries, charging states or entity visibility change.

## [1.1.0] - 2026-10-16

### Fixed

* The date, calendar, music, sensor and weather widgets are now sized from their own tile (container queries) instead of the
  screen, so they fit any cell: a wide short strip no longer clips the big day number, the music widget switches to a
  compact strip in short tiles, and sensor and weather values no longer overflow in small tiles.

### Added

* **Light view**: full-screen brightness controls with touch and keyboard input, live colour feedback and a power button.
* **World clock view**: open the clock widget to see the time across configured cities.
* **Thermostat view** (`climate` overview): pressing the number on a thermostat widget now opens a full-screen thermostat
  instead of the entity dialog: "Cooling to" / "Heating to" over the target in large figures, down and up keys, the room
  temperature and humidity, the time, a close key top left and, bottom right, a key that opens Home Assistant's own
  thermostat dialog. Blue while cooling, orange while heating, slate at rest, grey when off. `climate_view: false` on the
  carousel keeps the old behaviour. Also a page card and a standalone card (`custom:houseview-climate-overview-card`).
* Overview API: `controls: true` (with `interactive`) makes an overview's full-page layer a control panel whose buttons
  stay live, closed by an `overview-close` button or Escape; `actions` lists the widget actions its buttons may run.
* The home summary can be a screensaver (choose it in the editor's screensaver list), read-only, instead of the weather.
* A page that holds only the home summary now takes the overview's colour across the whole page, and the page dots change
  colour to stay visible.

* `home_overview: true` (a switch in the card editor) adds a small home button at the bottom left, opposite the Dim button;
  it opens the home summary full screen. `home_title` sets its title. Off by default.
* Card editor: every section starts collapsed, and opening the Home summary section shows the home summary in the preview.
* Card editor: a **Home summary** section holds the home switch, the title, the bins sensor and the transport chips (entity, label, icon), moved out of "Automatic displays".
* Home summary: optional bins chip (`home_bins`, icons for the bins going out this week) and transport chips (`home_transport`,
  a custom label, a selectable icon and the next departure time, amber when a line is not running).
* The weather widget opens the full-screen weather overview when pressed (`weather_view: false` keeps more-info). The month
  calendar overview covers the whole screen.
* The timer widget now follows the quiet style of the blinds and thermostat widgets.

* **Home summary** (`custom:houseview-home-overview-card`, `type: home`): a scrollable home screen that builds itself from the
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

[1.1.0]: https://github.com/dandoingdev/HouseView/releases/tag/v1.1.0

[1.2.0]: https://github.com/dandoingdev/HouseView/releases/tag/v1.2.0
[1.3.0]: https://github.com/dandoingdev/HouseView/releases/tag/v1.3.0
