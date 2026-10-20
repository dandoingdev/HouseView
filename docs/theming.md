# Theming and appearance

HouseView draws its own glass look, so it does not need a Home Assistant theme. The look is chosen with card options:
a **surface** per page (or one **wallpaper** for every page), the **appearance** (light, dark, automatic), a colour
**palette**, **high contrast**, **bedtime** and the **performance** mode.

## Card options

| Option | Where | Values |
| --- | --- | --- |
| `surface` | each page | `glass` (default), `soft`, `teal`, `silver`, `champagne`, `sage`, `slate`, `dusk`, `blush` |
| `wallpaper` | the carousel | `teal`, `silver`, `champagne`, `sage`, `slate`, `dusk`, `blush`, or leave out to use each page's `surface` |
| `appearance` | the carousel (default `auto`) or a standalone card (default `light`) | `auto`, `light`, `dark` |
| `palette` | the carousel | `stone` (default), `forest` |
| `high_contrast` | the carousel | `true` for stronger fills and edges |
| `bedtime` | the carousel | `true` for night styling and a Dim button |
| `performance` | the carousel or a standalone card | `auto` (default), `full`, `lite`; see [performance](performance.md) |

```yaml
type: custom:houseview-card
appearance: auto
palette: stone
pages:
  - {name: Kitchen, surface: teal}
  - {name: Home, surface: soft}
```

## Surfaces

| Surface | Look |
| --- | --- |
| `glass` | Translucent widgets over a soft background drawn with CSS |
| `soft` | Pale grey panels with dark text and lavender controls |
| `teal` | Glass over an illustrated folded-ribbon background |
| `silver` | Glass over a silver ribbon background |
| `champagne` | Glass over a warm ribbon background |
| `sage` | The same ribbons in muted green |
| `slate` | The same ribbons in blue-grey |
| `dusk` | The same ribbons in plum |
| `blush` | The same ribbons in dusty rose |

The ribbon and fold backgrounds are built into the plugin as part of the one file: there are no files to host. The
backgrounds are original artwork shipped with HouseView.

* `wallpaper` forces one background behind every page. Use `surface` per page when pages should differ.
* `appearance: auto` follows Home Assistant's dark mode, which comes from the active theme or the user profile. `light` and
  `dark` ignore it. Dark mode never needs separate YAML.
* `palette: forest` changes the colour family of the faces to greens.
* `high_contrast: true` strengthens the widget fill and edge colours and removes a decorative overlay on the page.
* `bedtime: true` adds the night styling and the **Dim** button. Dim lowers the brightness of the whole card, including a
  running [overview](screensavers.md); an overview itself never toggles it.

Which combinations look good depends on the screen. Try them with `preview_time` set (see
[configuration](configuration.md)) so that screenshots are reproducible.

## Motion

Page glides, the overview fade and scene animation are switched off when the device asks for reduced motion
(`prefers-reduced-motion: reduce`) and in `performance: lite`.

## The Home Assistant theme

HouseView's cards do not read Home Assistant theme variables for their own colours: the look comes from the card options
above, and Home Assistant's light or dark mode decides `appearance: auto`. Two small parts follow the theme: the in-card
confirmation sheet (`confirm_mode: inline`) takes its text colour and corner radius from the theme, and the visual editors are
Home Assistant's own forms.

`themes/houseview.yaml` in the repository is an ordinary Home Assistant theme named **HouseView**, with a light and a dark
mode, whose colours match the cards (a muted green primary colour, a warm accent, rounded `ha-card`). It styles Home
Assistant's own cards and chrome around HouseView; the HouseView cards look the same with or without it. To install it, see
[Installation](installation.md#optional-the-houseview-theme).

## Custom colours

The card's shadow root defines three custom properties on its host: `--hv-glass` (the fill of widgets), `--hv-edge` (their
hairline border) and `--hv-text` (the text colour). They are internal: surfaces, dark mode and high contrast set them again
for their own variants, so overriding them from outside works only for some combinations and may change in a later
release. Prefer the options above.
