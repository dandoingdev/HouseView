# HouseView

Glass-style dashboard widgets and full-screen views for [Home Assistant](https://www.home-assistant.io/), made for wall
tablets and kitchen displays.

[![HACS custom repository](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://hacs.xyz/docs/faq/custom_repositories)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/dandoingdev/HouseView/actions/workflows/ci.yml/badge.svg)](https://github.com/dandoingdev/HouseView/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/dandoingdev/HouseView)](https://github.com/dandoingdev/HouseView/releases/latest)

HouseView packs your lights, thermostat, camera, timer, music and more into screen-sized, swipeable pages with big touch
targets, and can show a full-screen weather scene, a photo frame, the month calendar, the album cover or a countdown when
nobody has touched the display for a while.

![HouseView kitchen dashboard: clock, date, front door camera and a kitchen timer](docs/images/hero.png)

A real dashboard, one swipeable page at a time (the three pages of [`examples/kitchen.yaml`](examples/kitchen.yaml)):

| Music page | Home controls page |
| --- | --- |
| ![Music page](docs/images/music.png) | ![Home controls page](docs/images/controls.png) |

| Bedtime dashboard | Kitchen page on a portrait tablet |
| --- | --- |
| ![Bedtime dashboard](docs/images/bedtime.png) | ![Kitchen page, portrait](docs/images/kitchen.png) |

The pictures are rendered from the dashboards in [`examples/`](examples/) with placeholder data and a stand-in for Home
Assistant's icons.

### Overviews

Full-screen views, shown here as a screensaver would show them (mock data, frozen clock):

| Weather | Timer display | Cover art |
| --- | --- | --- |
| ![Weather overview](docs/images/overview-weather.png) | ![Timer display](docs/images/overview-timer.png) | ![Cover art](docs/images/overview-cover-art.png) |

| Photo frame | Month calendar | Weather widget (tile) |
| --- | --- | --- |
| ![Photo frame](docs/images/overview-photo-frame.png) | ![Month calendar](docs/images/overview-calendar.png) | ![Weather widget tile](docs/images/widget-weather-tile.png) |

`npm run screenshots` regenerates every picture from placeholder data; nothing contacts a Home Assistant.

## Features

* **One card, many pages.** `custom:houseview-card` arranges widgets into bounded pages that fit the screen in any
  orientation. Swipe, press the page dots or use the arrow keys. Overflow continues on a numbered page, never in a
  scrolling column.
* **16 widgets**: clock, date, calendar, camera, thermostat, light, switch, fan, blinds, lock, sensor, weather, music
  player, timer, alarm panel and an action widget for scenes, scripts and buttons. Each is also a card of its own.
* **5 overviews**: weather scene, photo frame, month calendar, timer display and cover art. Use them as screensavers, as
  automatic displays, open them by pressing a widget, or place them as cards.
* **Page layouts and looks**: `auto`, `controls`, `modular` and `kitchen` layouts; `glass`, `soft`, `teal`, `silver` and
  `champagne` surfaces; light, dark and automatic appearance; a high-contrast option and a bedtime mode with a Dim button.
* **Home Assistant conventions**: native card picker and visual editor with entity selectors, `tap_action`, `hold_action`
  and `double_tap_action`, in-card confirmations, optional localised states.
* **A camera grid** for up to four cameras, a **timer** with presets and a completion alert, and a **tablet mode** that hides
  Home Assistant's sidebar and header.
* **Made for weak tablets.** A `performance` option (`auto` by default) switches to opaque glass and no decorative animation on
  a low-end device; a covering overview stops all work underneath.
* **No dependencies.** One JavaScript file, no external fonts, images or services.

## Terminology

| Term | Meaning |
| --- | --- |
| **Widget** | Any element on a page: clock, date, calendar, light, switch, fan, lock, blinds, thermostat, sensor, weather, music player, camera, timer, alarm panel, action |
| **Overview** | A full-screen view. It can be a screensaver, appear automatically (the running-timer display, the album cover while music plays), open when you press a widget (the month calendar from a clock, date or calendar widget; the weather scene; the photo frame), or be used as a card |
| **Page** | One swipeable screen of widgets |
| **Carousel** | The `custom:houseview-card` card that holds the pages |

In configuration the literal names are used: `type: custom:houseview-<kind>-card`, `custom:houseview-widget-card` with
`widget_type`, the `cards:` key (`widgets:` is accepted as an alias), `pages` and `screensaver`.

## Requirements

* Home Assistant **2024.8.0** or newer (`hacs.json`).
* A frontend browser based on **Chrome 105** or later. That includes current desktop browsers, the Home Assistant companion
  app and the Android WebView on wall tablets.
* For a wall tablet: a device that keeps its screen on, a panel view dashboard, and ideally a kiosk browser or the companion
  app. HouseView was tuned for 1280 x 800 landscape and 800 x 1280 portrait; it adapts to phones and larger screens. See
  [tablet mode](docs/tablet.md) and [performance](docs/performance.md).

## Installation

### With HACS

1. In HACS open the menu, choose **Custom repositories**, add `https://github.com/dandoingdev/HouseView` with category
   **Dashboard**.
2. Search for **HouseView** in HACS and press **Download**.
3. Check that **Settings > Dashboards > Resources** has `/hacsfiles/<repository name>/houseview.js` as a **JavaScript module** (HACS
   normally adds it), then hard-refresh your browser.

### Manually

1. Download `houseview.js` from the [latest release](https://github.com/dandoingdev/HouseView/releases/latest) and copy it to
   `/config/www/houseview/houseview.js`.
2. Under **Settings > Dashboards > Resources** (enable *Advanced mode* in your user profile to see it) add the resource
   `/local/houseview/houseview.js` as a **JavaScript module**.
3. Hard-refresh your browser.

**Caching.** Browsers and wall tablets keep the old file. After an update append a version to the resource URL
(`/local/houseview/houseview.js?v=1.0.0`), hard-refresh, and reset the frontend cache in the companion app or kiosk browser.

**Kiosk mode.** Add `?tablet=1` to the dashboard address (or set `tablet_mode: true`) and HouseView hides Home Assistant's
sidebar and header so the carousel uses the whole screen. This relies on Home Assistant internals that are not a public API,
so it can stop working after a Home Assistant update; see [tablet mode](docs/tablet.md) for kiosk alternatives.

Details and troubleshooting: [Installation](docs/installation.md).

## Quick start

Create a dashboard view of type **Panel (1 card)**, open the raw configuration editor and use a carousel with two pages and a
screensaver:

```yaml
title: Home
views:
  - title: Home
    path: home
    type: panel
    cards:
      - type: custom:houseview-card
        pages:
          - {name: Kitchen, surface: teal, layout: kitchen}
          - {name: Home, surface: glass, layout: controls}
        cards:
          - {type: custom:houseview-clock-card, page: Kitchen}
          - {type: custom:houseview-date-card, page: Kitchen}
          - {type: custom:houseview-camera-card, entity: camera.front_door, page: Kitchen}
          - {type: custom:houseview-timer-card, entity: timer.kitchen_timer, page: Kitchen}
          - {type: custom:houseview-light-card, entity: light.living_room, page: Home}
          - {type: custom:houseview-light-card, entity: light.hallway, page: Home}
          - {type: custom:houseview-climate-card, entity: climate.living_room, page: Home}
          - {type: custom:houseview-lock-card, entity: lock.front_door, page: Home}
        screensaver:
          type: weather
          entity: weather.home
          idle_timeout: 120 # seconds without a touch; the first tap only wakes it
```

Replace the entity ids with your own. The card has a visual editor (**Edit dashboard**, then **Edit** on the card). More
dashboards are in [`examples/`](examples/): [minimal](examples/minimal.yaml), [kitchen tablet](examples/kitchen.yaml),
[tablet kiosk](examples/tablet-kiosk.yaml), [bedtime](examples/bedtime.yaml), [single cards](examples/single-cards.yaml),
[camera grid](examples/camera-gallery.yaml), [native cards](examples/native-cards.yaml),
[weather screensavers](examples/screensaver-weather.yaml), [weather overview](examples/weather-overview-card.yaml),
[photo frame](examples/photo-frame.yaml), [month calendar](examples/month-calendar.yaml),
[timer and music displays](examples/timer-and-music.yaml) and the [`widgets:` alias](examples/widgets-key.yaml).

## Widgets

![Some of the widgets: lights, thermostat, weather, music player, sensor, lock and the weather overview as a widget](docs/images/widgets.png)

In the carousel write `type: custom:houseview-<type>-card`. On a dashboard of its own the same string is a card; it appears
in the picker as **HouseView · Light** and so on. Every widget accepts `size` (`normal`, `wide`, `tall`, `large`), `name` and
`page`; widgets whose whole face is one button also accept [`tap_action`, `hold_action` and
`double_tap_action`](docs/actions.md).

| Widget | `type` | Entity | Key options | A tap |
| --- | --- | --- | --- | --- |
| [Clock](docs/widgets/clock.md) | `clock` | none | `name` | Opens the month calendar |
| [Date](docs/widgets/date.md) | `date` | none | | Opens the month calendar |
| [Calendar](docs/widgets/calendar.md) | `calendar` | `calendar.*` | | Opens the month calendar (or the entity dialog with `calendar_view: false`) |
| [Camera](docs/widgets/camera.md) | `camera` | `camera.*` | card option `camera_gallery` | Opens the camera grid, or the entity dialog |
| [Thermostat](docs/widgets/climate.md) | `climate` | `climate.*` | `room` | Chevrons set the target temperature; the number opens the dialog |
| [Light](docs/widgets/light.md) | `light` | `light.*` | `action` (`toggle`, `off`), `icon` | Toggles, or turns off |
| [Switch](docs/widgets/switch.md) | `switch` | `switch.*` | `icon` | Toggles |
| [Fan](docs/widgets/fan.md) | `fan` | `fan.*` | `icon` | Toggles |
| [Blinds](docs/widgets/cover.md) | `cover` | `cover.*` | | Keys open, stop and close |
| [Lock](docs/widgets/lock.md) | `lock` | `lock.*` | `icon` | Locks or unlocks (asks before unlocking) |
| [Sensor](docs/widgets/sensor.md) | `sensor` | `sensor.*` | `icon` | Opens the entity dialog |
| [Weather](docs/widgets/weather.md) | `weather` | `weather.*` | | Opens the entity dialog |
| [Music](docs/widgets/media_player.md) | `media_player` | `media_player.*` | | Transport, volume, shuffle and repeat keys; the dots open the dialog |
| [Timer](docs/widgets/timer.md) | `timer` | `timer.*` | | Presets start the timer; pause, resume, cancel |
| [Alarm panel](docs/widgets/alarm_control_panel.md) | `alarm_control_panel` | `alarm_control_panel.*` | | Opens the arming dialog (never arms by itself). Works with any alarm entity, e.g. [Alarmo](#works-with-alarmo) |
| [Action](docs/widgets/action.md) | `action` | `scene.*`, `script.*`, `button.*`, `input_button.*` | `icon`, `note` | Runs the scene, script or button |

## Overviews

An overview is a full-screen view. See [overviews and screensavers](docs/screensavers.md) for how they start, what blocks
them and how to combine them.

| Overview | `type` | Activation | Entity | Options | Card type |
| --- | --- | --- | --- | --- | --- |
| [Weather overview](docs/overviews/weather.md) | `weather` | Idle screensaver; opened by pressing its small widget (`display: tile`) | `weather.*` | `sun_entity`, `details`, `show_time`, `show_unit`, `frosted`, `daylight` | `custom:houseview-weather-overview-card` |
| [Timer display](docs/overviews/timer.md) | `timer` | Event: while a timer runs (automatic) | `timer.*` | none | `custom:houseview-timer-overview-card` |
| [Cover art](docs/overviews/cover_art.md) | `cover_art` | Idle, wins over weather while a speaker plays (automatic) | `media_player.*` | none | `custom:houseview-cover-art-overview-card` |
| [Photo frame](docs/overviews/photo_frame.md) | `photo_frame` | Idle screensaver; opened by pressing the card | none | `folder`, `interval`, `shuffle`, `recursive`, `show_time` | `custom:houseview-photo-frame-overview-card` |
| [Month calendar](docs/overviews/calendar_month.md) | `calendar_month` | Idle screensaver; opened by pressing a clock, date or calendar widget | none | `week_start`, `show_time` | `custom:houseview-calendar-month-overview-card` |

```yaml
type: custom:houseview-card
cards:
  - type: custom:houseview-clock-card
screensaver:                      # one overview, or a list that takes turns
  - {type: weather, entity: weather.home, idle_timeout: 120}
  - {type: photo_frame, folder: media-source://media_source/local/Photos, idle_timeout: 120}
```

### Automatic displays

Two overviews need no `screensaver` entry. They follow the widgets on the carousel:

| Card option | Default | Behaviour |
| --- | --- | --- |
| `timer_display` | `true` | Every `timer` widget shows the timer display while its timer runs. A tap puts the dashboard back; it returns for the next timer |
| `music_screensaver` | `true` | When the screensaver would start and a speaker is playing, the album cover is shown instead of the usual screensaver |
| `calendar_view` | `true` | `false` stops the clock, date and calendar widgets from opening the month calendar |

Each can be `false`; `timer_display` and `music_screensaver` also take a list of entities. Overviews only read data: they
cannot call a service.

## Works with Alarmo

The alarm panel widget shows any `alarm_control_panel` entity and opens Home Assistant's own arming dialog when pressed.
It pairs naturally with **[Alarmo](https://github.com/nielsfaber/alarmo)**, a community alarm system for Home Assistant. Alarmo is a
separate project that you install and configure yourself; HouseView does not bundle it and never arms or disarms anything on
its own.

1. Install Alarmo through HACS (category Integration) and restart Home Assistant.
2. Add the **Alarmo** integration under **Settings > Devices & services**, then use the **Alarmo** sidebar panel to set up areas,
   sensors, modes and the users and codes that may arm and disarm.
3. Find the entity Alarmo created (by default `alarm_control_panel.alarmo`) under **Settings > Devices & services > Entities**.
4. Add it to a page:

```yaml
- {type: custom:houseview-alarm_control_panel-card, entity: alarm_control_panel.alarmo, name: Alarm, page: Home}
```

More detail is in the [alarm panel widget page](docs/widgets/alarm_control_panel.md).

## Looks and performance

| Option | Values |
| --- | --- |
| `surface` (per page) | `glass`, `soft`, `teal`, `silver`, `champagne` |
| `wallpaper` | `teal`, `silver`, `champagne`: one background behind every page |
| `appearance` | `auto` (follows Home Assistant), `light`, `dark` |
| `palette` | `stone`, `forest` |
| `high_contrast`, `bedtime` | `true` / `false`; bedtime adds night styling and a Dim button |
| `performance` | `auto`, `full`, `lite`: `lite` uses opaque glass and no decorative animation. `auto` picks it on a device with 2 GB of memory or less, 4 cores or fewer, or an old Android WebView |

See [theming](docs/theming.md) and [performance](docs/performance.md).

## Editor

Every card has a visual editor that uses Home Assistant's own forms: the carousel editor has Appearance, one section per page
(with Home Assistant's card editor for the widgets on it), Screensaver, Automatic displays and Camera grid sections; widget
cards have a settings form with entity selectors. YAML always works, and options the forms do not show (such as a list of
screensavers, `confirm_mode` or `tap_action`) are kept when you edit.

## Configuration reference

Card-level options of `custom:houseview-card` (details and defaults in [Configuration](docs/configuration.md)):

| Option | What it does |
| --- | --- |
| `cards` (alias `widgets`) | The widgets, in order |
| `pages` | `name`, `surface`, `layout` (`auto`, `grid`, `controls`, `modular`, `kitchen`) and `columns` per page |
| `appearance`, `palette`, `wallpaper`, `high_contrast`, `bedtime` | Look |
| `performance` | `auto`, `full`, `lite` |
| `camera_gallery` | A grid of one to four cameras |
| `screensaver` | An overview or a list of them: `type`, `entity`, `idle_timeout`, `enabled`, `preview`, `start_in_edit_mode`, plus the overview's own options |
| `timer_display`, `music_screensaver`, `calendar_view` | The automatic displays |
| `confirm_mode` | `native` (browser dialog) or `inline` (a sheet inside the card) |
| `localized_states` | Show entity states in your Home Assistant language |
| `state_compare` | `auto`, `reference` or `deep`: how state changes are detected (leave at `auto`) |
| `tablet_mode` | The same as `?tablet=1` |
| `preview_time` | Freeze the clock for screenshots and tests |

## Translations

All interface text is English today (widgets, the editor, error messages). Dates, times and numbers follow your Home Assistant
language and time zone; entity states can be shown in your language with `localized_states: true`; the weather overview also
ships German text. Strings live in `strings.js` next to each widget and overview, keyed by language, so adding a language is a
matter of adding a table beside `en`. Translations are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Troubleshooting and FAQ

| Question | Answer |
| --- | --- |
| "Custom element doesn't exist: houseview-card" | The resource is missing or not a JavaScript module. See [Installation](docs/installation.md#troubleshooting) |
| The card looks old after an update | Change the `?v=` of the resource URL, hard-refresh, reset the app or kiosk cache |
| The carousel does not fill the screen | Use a **panel view**. Single widget cards work in any view |
| `?tablet=1` does nothing | It depends on Home Assistant internals; use a kiosk browser. See [tablet mode](docs/tablet.md) |
| The screensaver never starts | `idle_timeout: 0`, `enabled: false`, the camera grid is open, a service call is running, or the dashboard is in edit mode. See [overviews and screensavers](docs/screensavers.md#troubleshooting) |
| The album cover does not appear | The speaker must be playing with a picture served by your Home Assistant, and the screensaver timeout must not be `0` |
| The wall tablet is slow | Set `performance: lite`. See [performance](docs/performance.md) |
| Can HouseView change my devices on its own? | No. A service is called only when you press a control or configure a `tap_action` that does |

## Development

```sh
git clone https://github.com/dandoingdev/HouseView.git
cd houseview
npm install
npm run build:dev    # dist/houseview.js, unminified
npm run dev          # watch build plus a local server on http://127.0.0.1:8765
```

Needs Node 24 or newer and Google Chrome for the browser tests. Useful commands:

| Command | What it does |
| --- | --- |
| `npm run build` | The production bundle `dist/houseview.js` |
| `npm run gen` | Regenerates the widget and overview index files after adding a folder |
| `npm run gen-docs` | Regenerates `docs/widgets` and `docs/overviews` from the READMEs next to the code |
| `npm run lint`, `npm run format:check` | ESLint and Prettier |
| `npm run check:widgets`, `npm run check:overviews` | The widget and overview contract linters |
| `npm test` | Unit, browser, widget and overview suites |
| `npm run new:widget`, `npm run new:overview` | Scaffold a new widget or overview |

To add a widget or an overview read [CONTRIBUTING.md](CONTRIBUTING.md), the [widget API](docs/widget-api.md) and the
[overview API](docs/overview-api.md); the [architecture](docs/architecture.md) explains the structure.

## Documentation

| | |
| --- | --- |
| [Installation](docs/installation.md) | HACS, manual, caching, kiosk, troubleshooting |
| [Configuration](docs/configuration.md) | Every option of the carousel, pages and widgets |
| [Widgets](docs/widgets/index.md) | One page per widget |
| [Overviews and screensavers](docs/screensavers.md) | Overviews, screensavers, automatic displays |
| [Actions](docs/actions.md) | What each widget does, `tap_action`, `hold_action`, `double_tap_action` |
| [Theming](docs/theming.md) | Surfaces, palettes, appearance, the Home Assistant theme |
| [Tablet mode](docs/tablet.md) | Wall displays, `?tablet=1`, kiosk setups |
| [Cameras](docs/cameras.md) | The snapshot widget and the camera grid |
| [Performance](docs/performance.md) | `performance`, weak tablets, measuring |
| [Architecture](docs/architecture.md), [Widget API](docs/widget-api.md), [Overview API](docs/overview-api.md) | For contributors |
| [Changelog](CHANGELOG.md) | What changed in each release |

## Contributing

Bug reports and ideas are welcome in the issue tracker; the templates ask for the HouseView and Home Assistant versions and the
card YAML with entity ids anonymised. To change code or add a widget, read [CONTRIBUTING.md](CONTRIBUTING.md). Everyone taking
part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).

## Support the project

HouseView is free and MIT licensed, built and maintained in spare time. If it is useful to you, these are the ways to help
keep it going:

* **Star the repository and tell other people** who run Home Assistant on a wall tablet.
* **Report bugs and share your setup** in the [issues](https://github.com/dandoingdev/HouseView/issues). Feedback from different
  devices is the most valuable contribution.
* **[Buy me a coffee](https://buymeacoffee.com/dandoingdev)** to support further development.
* **Take a look at [AmongFolk.com](https://amongfolk.com)**, my main venture, which is where most of my time goes.

## Security and privacy

* HouseView sends nothing anywhere except to your own Home Assistant. It loads no external scripts, fonts or images.
* Camera snapshots, album art and photos are loaded only from your Home Assistant's own address (the page origin or the
  configured base URL) and, for cameras and album art, only from Home Assistant's proxy paths. Anything else an entity names is
  ignored.
* Overviews are read-only: their code has no way to call a service. Widgets call a service only when you press a control or
  configure a `tap_action` that does; names and states from entities are escaped before they reach the page.
* The `url` action only opens `http`, `https`, `mailto` and `tel` links.
* Files in `/config/www` are public; put only `houseview.js` there.

To report a vulnerability see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE).

## Disclaimer

HouseView is an independent community project. It is **not affiliated with, endorsed by or sponsored by Apple Inc., Home
Assistant or Nabu Casa**. "Home Assistant" is a trademark of its owners. HouseView's visual style is original; it uses no
third-party fonts or images. Most icons come from the Material Design Icons set that Home Assistant itself provides, which
HouseView does not bundle; a few glyphs and the wallpapers are drawn by HouseView.

## Acknowledgements

Thanks to the [Home Assistant](https://www.home-assistant.io/) project for the frontend, the card and editor conventions and
the Material Design Icons it provides, to the [HACS](https://hacs.xyz/) maintainers, and to the authors of the development
tools: [esbuild](https://esbuild.github.io/), [ESLint](https://eslint.org/), [Prettier](https://prettier.io/) and
[Puppeteer](https://pptr.dev/). The code of conduct is the [Contributor
Covenant](https://www.contributor-covenant.org/), version 2.1.
