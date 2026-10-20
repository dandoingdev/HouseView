# Configuration reference

HouseView has two ways to put widgets on a dashboard:

* **`custom:houseview-card`**, the carousel. One card that holds a list of widgets as swipeable, screen-sized pages.
  Use it in a [panel view](installation.md#add-your-first-carousel).
* **Widget cards**, `custom:houseview-<type>-card` (for example `custom:houseview-light-card`) or the generic
  `custom:houseview-widget-card` with `widget_type: <type>`. One widget as an ordinary dashboard card. The
  [widget pages](widgets/index.md) list each widget's own options.

Terms used here: a **widget** is one element on a page (a light, a clock, a camera, ...); an **overview** is a full-screen
view (the weather scene, the photo frame, ...) that can be a screensaver, appear automatically, open when you press a
widget, or be used as a card; a **page** is one swipeable screen of widgets; the **carousel** is the
`custom:houseview-card` that holds the pages. See the [README](../README.md#terminology).

## The carousel: `custom:houseview-card`

```yaml
type: custom:houseview-card
appearance: auto
palette: stone
pages:
  - {name: Home, surface: teal}
  - {name: Music, surface: glass}
cards:
  - {type: custom:houseview-clock-card, page: Home}
  - {type: custom:houseview-media_player-card, entity: media_player.kitchen_speaker, page: Music}
screensaver:
  type: weather
  entity: weather.home
```

| Key | Default | Description |
| --- | --- | --- |
| `cards` | required | The widgets, in order. See [widgets in `cards`](#widgets-in-cards). The older key `widgets:` is accepted as an [alias](#the-widgets-key) |
| `pages` | one page called `Home` | A list of [pages](#pages). Widgets name the page they belong to |
| `appearance` | `auto` | `auto` follows the Home Assistant light/dark mode; `light` and `dark` force it |
| `palette` | `stone` | `stone` or `forest`: the colour family of the faces |
| `wallpaper` | the page's `surface` | `teal`, `silver` or `champagne` puts that background behind **every** page, overriding each page's `surface`. Leave it out (editor: "page") to let pages choose |
| `show_header` | `false` | Show a compact header above every swipe page: date on the left, time centred. Uses your Home Assistant language, 12/24-hour preference and time zone. Updates every minute, including the date at midnight. Available as **Show time and date header** in the visual editor |
| `bedtime` | `false` | Night styling plus a **Dim** button that lowers the brightness of the whole card until you press **Brighter** |
| `high_contrast` | `false` | Stronger fills and edges |
| `performance` | `auto` | How much decoration is painted: `full`, `lite` or `auto`. See [performance](performance.md) |
| `home_overview` | `false` | `true` adds the [home summary](overviews/home.md) (a scrollable home screen built from this dashboard's widgets). A home button at the bottom left opens it full screen, and so does a downward swipe from the top of the display. On a short panel that top band is taller. It adds no page. Also a switch in the card editor's Home summary section |
| `home_bins` | none | A [waste_collection_schedule](overviews/home.md) sensor (`sensor.bins`): the home summary shows an icon chip for the bins going out in the next 7 days |
| `home_transport` | none | A list of departure sensors (`sensor.id` or `{entity, label, icon}`): the home summary shows a chip per entry with the next departure time, amber when nothing is running |
| `home_title` | `Home` | The title shown on the home summary when `home_overview` is on |
| `editor_preview` | `landscape` | How the live preview in Home Assistant's card editor is drawn: as a `landscape` tablet (1280 x 800), a `portrait` tablet (800 x 1280), or `auto` (the narrow box as it is). The card is laid out at that size and scaled to fit the preview, so the preview shows the real page arrangement. It has no effect anywhere else |
| `camera_gallery` | none | A grid of up to four cameras, opened by pressing the camera widget. See [cameras](cameras.md) |
| `screensaver` | none | One overview, or a list of them, shown after a while without a touch. See [overviews and screensavers](screensavers.md) |
| `timer_display` | `true` | The timer display appears while a timer runs: `true` (every `timer` widget), `false`, or a list of `timer.*` entities. See [automatic displays](screensavers.md#automatic-displays) |
| `music_screensaver` | `true` | The cover art appears at screensaver time while a speaker plays: `true` (every `media_player` widget), `false`, or a list of `media_player.*` entities |
| `weather_view` | `true` | `false` makes a press on the weather widget open more-info instead of the full-screen weather |
| `climate_view` | `true` | `false` makes a press on the thermostat widget's number open more-info instead of the full-screen thermostat view |
| `vacuum_view` | `true` | `false` makes a hold on the vacuum widget open more-info instead of the full-screen cleaning panel |
| `world_clock_view` | `true` | `false` disables the clock widget’s World Clock overlay |
| `calendar_view` | `true` | `false` stops the date and calendar widgets from opening the month calendar (the calendar widget opens its dialog instead) |
| `confirm_mode` | `native` | `native` asks with the browser's confirm dialog; `inline` asks with a sheet inside the card, which is translated, follows the card's look and works in kiosk browsers that block dialogs |
| `localized_states` | `false` | Show entity states in your Home Assistant language instead of the raw state value |
| `state_compare` | `auto` | How state changes are detected: `reference` compares state objects by identity, `deep` compares their content, `auto` picks `reference` in Home Assistant. Leave it alone |
| `tablet_mode` | `false` | Fill touch displays; keep Home Assistant navigation/editing controls on mouse desktops. `?tablet=1` explicitly forces full-screen outside editing. Available as **Tablet mode** in the visual editor. See [tablet mode](tablet.md) |
| `preview_time` | now | An ISO date and time (`2026-10-15T10:10:00`) that the clock, date, calendar and overviews show instead of the real time. For screenshots and testing |

A wrong value in an option that is checked is reported when the card loads (see [errors](#errors)).

### Pages

A page is one screen. Swipe horizontally, press the page dots or arrows, or use the left and right arrow keys to
move between pages. There is no automatic rotation.

| Key | Default | Description |
| --- | --- | --- |
| `name` | required | A unique, non-empty name. Widgets refer to it with `page: <name>` |
| `surface` | `glass` | The background style: `glass`, `soft` (pale panels, dark text), `teal`, `silver` or `champagne` |
| `columns` | 3 | Landscape only: the most columns a wide landscape screen may use, a whole number from 2 to 5. Phones and portrait tablets always use 2 |

Older configurations may still contain a `layout:` key on a page. It is ignored: there is one layout.

### Page layout

Every page is laid out the same way. Widgets flow in the order they are listed onto a page that fits the screen, so a
page is never a long scrolling column.

* **Columns.** A phone, a portrait tablet or a square panel such as an NSPanel Pro (480 × 480) uses 2 columns. On that
  panel, with the header and the page navigation, two rows fit, so four normal widgets fill the page. See
  [NSPanel Pro](nspanel.md). A wide landscape screen uses 3, or the page's `columns` (2 to 5). The number of rows comes
  from the height of the screen.
* **One cell each.** A widget takes one cell. When no widget on the page sets a `size`, the page is balanced into rows
  and the last row is stretched across the page width, so there are no holes.
* **Sizes.** Once a widget on the page sets a `size` (`wide`: two cells across, `tall`: two cells down, `large`: both),
  widgets are placed in reading order into the first free spot that fits, and then grow into any free neighbouring
  cells. A widget without a `size` then uses its default (`large` for `climate`). Put the big widget first to anchor it in
  the top left; the order of the `cards` list is the order of placement.
* **Overflow.** Widgets that do not fit flow on to a numbered continuation page (`Home`, `Home · 2`, ...). Pages that
  have no widgets are not shown.

For a screen of clock, date, camera and timer on a 1280 x 800 tablet, see the Kitchen page of
[`kitchen.yaml`](../examples/kitchen.yaml): the camera is `large`, the date `tall` and the timer `wide`, with `columns: 4`.

### Widgets in `cards`

Each entry in `cards` is a HouseView widget card, written the same way as a standalone card plus `page`.

| Key | Default | Description |
| --- | --- | --- |
| `type` | required | `custom:houseview-<widget>-card`, or `custom:houseview-widget-card` with `widget_type: <widget>`; for an overview `custom:houseview-<overview>-overview-card` |
| `entity` | by widget | The entity. It must belong to the widget's domain (`light.` for a light). `clock` and `date` take no entity |
| `name` | friendly name | The label of the widget |
| `size` | `normal` (`large` for `climate` and overview cards) | `normal` is one cell, `wide` two cells across, `tall` two cells down, `large` both. Free cells beside a widget are used by it, so a lone `large` widget fills its page |
| `page` | first page | The name of the page the widget appears on. A name that is not in `pages` creates that page |
| `icon` | by widget | Icon override for `action`, `light`, `switch`, `fan`, `lock` and `sensor`. `mdi:` icons; a name without a prefix is an `mdi:` icon |
| `tap_action`, `hold_action`, `double_tap_action` | built-in behaviour | Home Assistant style actions for a widget's main button. See [actions](actions.md) |

Widget-specific keys (for example `action: off` on a light, `note` on an action widget) are on the
[widget pages](widgets/index.md).

#### Native Home Assistant cards

A card whose type is not a HouseView card (`entities`, `markdown`, `button`, ...) is created through Home Assistant and
placed on a page with `view_layout`:

```yaml
- type: entities
  entities: [climate.living_room]
  view_layout:
    houseview_page: Details
    houseview_size: wide
```

It looks like a Home Assistant card, not like HouseView. See [`native-cards.yaml`](../examples/native-cards.yaml).

#### The `widgets` key

`widgets:` is accepted instead of `cards:`. Each entry then uses `type: <widget>` (without `custom:houseview-` and
`-card`), and the types `scene`, `script`, `button` and `input_button` mean the `action` widget. The visual editor
converts such a list to `cards` when you save. See [`widgets-key.yaml`](../examples/widgets-key.yaml).

## Widget cards on their own

A widget card needs only what the widget needs:

```yaml
type: custom:houseview-light-card
entity: light.living_room
```

In addition to the widget's options, standalone cards accept:

| Key | Default | Description |
| --- | --- | --- |
| `appearance` | `light` | `auto`, `light` or `dark`. Note that the default differs from the carousel's |
| `wallpaper` | `teal` | `teal`, `silver` or `champagne` |
| `height` | by widget | Card height in pixels (240 for most widgets, 280 for `climate`, 380 for `media_player` and the overview cards). The editor allows 220 to 800 |
| `camera_gallery` | none | As in the carousel, for a standalone camera card |
| `performance` | `auto` | As in the carousel (YAML only: the settings form does not show it) |
| `tap_action`, `hold_action`, `double_tap_action` | built-in behaviour | As above |

The other carousel options (`confirm_mode`, `localized_states`, `preview_time`, ...) belong to the
carousel and are not read by a standalone card. Standalone cards appear in the Home Assistant card picker as
**HouseView · Light**, **HouseView · Thermostat** and so on, with a settings form instead of YAML. A standalone timer or
music widget never takes over the screen with an automatic display.

## The visual editor

The carousel and every widget card have a visual editor (**Edit dashboard**, then **Edit** on the card). The
carousel editor has an **Appearance** section (the date and time header, tablet mode, appearance, wallpaper,
palette, bedtime, high contrast, performance) and one section per page. A page section uses Home Assistant's own
card editor for the widgets on it (add, reorder, delete, change a widget's settings in a form) and shows
**Remove page** when more than one page exists. Removing a page deletes the cards on it; the last page stays.
The editor also has a **Screensaver** section, an **Automatic displays** section and a **Camera grid** section. Anything
the forms do not cover (a list of screensavers, `confirm_mode`, `tap_action`, `preview_time`) is edited in the YAML
editor; the forms keep keys they do not know.

## Errors

A broken configuration shows a red error card with one of these messages:

| Message | Cause |
| --- | --- |
| `HouseView needs a configuration.` | The card has no configuration object |
| `HouseView needs a list of cards.` | Neither `cards` nor `widgets` is present |
| `Cards must be a list.` | `cards` is not a YAML list |
| `Card 3 must be an object with a type.` | An entry in `cards` is empty or not a mapping |
| `Add at least one HouseView widget.` | `widgets` is empty |
| `Pages need unique names.` | A page has no name or two pages share one |
| `Unsupported widget: foo` | The `type` is not a HouseView widget |
| `light widget needs a light entity.` | `entity` is missing or from the wrong domain |
| `Light action must be view, off or toggle.` | A light's `action` has another value |
| `Action widget needs a scene, script, button or input_button entity.` | An `action` widget has another kind of entity |
| `Widget size must be normal, wide, tall or large.` | A bad `size` |
| `Camera view needs one to four camera entities.` | `camera_gallery` is empty, longer than four, or lists a non-camera |
| `confirm_mode must be native or inline.` | A bad `confirm_mode` (`state_compare` is checked the same way) |
| `performance must be auto, full or lite.` | A bad `performance` |
| `timer_display must be true, false or a list of timer entities.` | A bad `timer_display` (`music_screensaver` likewise) |
| `Tap action must be one of more-info, toggle, ...` | A bad action in `tap_action` (`Hold action`, `Double tap action` likewise) |
| `Screensaver ...`, `<type> screensaver needs ...` | See [overviews and screensavers](screensavers.md#errors) |

### Holding widgets

Tap a widget for its everyday action. Hold it for half a second to open its controls or settings:
lights open the dimmer, thermostats open their full-screen control, and other entity widgets open Home Assistant’s
entity dialog. On a small panel tile, tap the track title to open the music player full screen. Holding the track
information or options dots opens speaker settings. Operational keys such as
volume, playback, Browse and temperature arrows still work with a tap. Moving your finger cancels a hold so swiping
continues to turn pages. A configured `hold_action` takes precedence, including `action: none`.
Keyboard users can focus a widget or settings key and press Shift+F10 or the context-menu key.
