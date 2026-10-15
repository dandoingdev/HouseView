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
  - {name: Home, surface: teal, layout: auto}
  - {name: Music, surface: glass, layout: auto}
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
| `bedtime` | `false` | Night styling plus a **Dim** button that lowers the brightness of the whole card until you press **Brighter** |
| `high_contrast` | `false` | Stronger fills and edges |
| `performance` | `auto` | How much decoration is painted: `full`, `lite` or `auto`. See [performance](performance.md) |
| `camera_gallery` | none | A grid of up to four cameras, opened by pressing the camera widget. See [cameras](cameras.md) |
| `screensaver` | none | One overview, or a list of them, shown after a while without a touch. See [overviews and screensavers](screensavers.md) |
| `timer_display` | `true` | The timer display appears while a timer runs: `true` (every `timer` widget), `false`, or a list of `timer.*` entities. See [automatic displays](screensavers.md#automatic-displays) |
| `music_screensaver` | `true` | The cover art appears at screensaver time while a speaker plays: `true` (every `media_player` widget), `false`, or a list of `media_player.*` entities |
| `calendar_view` | `true` | `false` stops the clock, date and calendar widgets from opening the month calendar (the calendar widget opens its dialog instead) |
| `confirm_mode` | `native` | `native` asks with the browser's confirm dialog; `inline` asks with a sheet inside the card, which is translated, follows the card's look and works in kiosk browsers that block dialogs |
| `localized_states` | `false` | Show entity states in your Home Assistant language instead of the raw state value |
| `state_compare` | `auto` | How state changes are detected: `reference` compares state objects by identity, `deep` compares their content, `auto` picks `reference` in Home Assistant. Leave it alone |
| `tablet_mode` | `false` | Same as adding `?tablet=1` to the address. See [tablet mode](tablet.md) |
| `preview_time` | now | An ISO date and time (`2026-10-15T10:10:00`) that the clock, date, calendar and overviews show instead of the real time. For screenshots and testing |

A wrong value in an option that is checked is reported when the card loads (see [errors](#errors)).

### Pages

A page is one screen. Swipe horizontally, press the page dots or arrows, or use the left and right arrow keys to
move between pages. There is no automatic rotation.

| Key | Default | Description |
| --- | --- | --- |
| `name` | required | A unique, non-empty name. Widgets refer to it with `page: <name>` |
| `surface` | `glass` | The background style: `glass`, `soft` (pale panels, dark text), `teal`, `silver` or `champagne` |
| `layout` | `auto` | How widgets are arranged, see below |
| `columns` | automatic | `controls` layout only, landscape only: 2 to 5 columns (default 3) |

The number of grid columns follows the shape of the screen: 2 on a narrow screen, 3 on a typical portrait tablet and 5
on a landscape one. Widgets that do not fit a page flow on to a numbered continuation page (`Home`, `Home · 2`, ...).
Pages that have no widgets are not shown.

| Layout | Behaviour |
| --- | --- |
| `auto`, `grid` | Pack widgets in order into a grid, honouring their `size` |
| `controls` | Broad, balanced widgets: three columns in landscape, two in portrait. Best for lights, switches and other icon widgets |
| `modular` | A thermostat-led arrangement. Needs a large `climate`, a `clock`, a `camera` and at least three other normal-sized widgets; otherwise the page falls back to `auto` |
| `kitchen` | Needs one each of `clock`, `date` (or `calendar`), `camera` and `timer`, which it arranges as one screen. Other widgets on the page flow on to following pages. Without all four it falls back to `auto` |

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

The other carousel options (`confirm_mode`, `localized_states`, `tablet_mode`, `preview_time`, ...) belong to the
carousel and are not read by a standalone card. Standalone cards appear in the Home Assistant card picker as
**HouseView · Light**, **HouseView · Thermostat** and so on, with a settings form instead of YAML. A standalone timer or
music widget never takes over the screen with an automatic display.

## The visual editor

The carousel and every widget card have a visual editor (**Edit dashboard**, then **Edit** on the card). The
carousel editor has an **Appearance** section (appearance, wallpaper, palette, bedtime, high contrast, performance), one
section per page with Home Assistant's own card editor for the widgets on it (add, reorder, delete, change a widget's
settings in a form), a **Screensaver** section, an **Automatic displays** section and a **Camera grid** section. Anything
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
| `Light action must be off or toggle.` | A light's `action` has another value |
| `Action widget needs a scene, script, button or input_button entity.` | An `action` widget has another kind of entity |
| `Widget size must be normal, wide, tall or large.` | A bad `size` |
| `Camera view needs one to four camera entities.` | `camera_gallery` is empty, longer than four, or lists a non-camera |
| `confirm_mode must be native or inline.` | A bad `confirm_mode` (`state_compare` is checked the same way) |
| `performance must be auto, full or lite.` | A bad `performance` |
| `timer_display must be true, false or a list of timer entities.` | A bad `timer_display` (`music_screensaver` likewise) |
| `Tap action must be one of more-info, toggle, ...` | A bad action in `tap_action` (`Hold action`, `Double tap action` likewise) |
| `Screensaver ...`, `<type> screensaver needs ...` | See [overviews and screensavers](screensavers.md#errors) |
