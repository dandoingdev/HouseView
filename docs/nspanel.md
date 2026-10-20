# NSPanel Pro

HouseView runs on a SONOFF NSPanel Pro the same way it runs on a wall tablet: the panel's browser opens a panel-view
dashboard, and the carousel fills the screen.

HouseView is the dashboard in that browser. Zigbee pairing, relays and the eWeLink account stay with the panel's own
software. HouseView is not affiliated with Shenzhen Sonoff Technologies. NSPanel Pro is their product, and the frames in
the [README](../README.md#nspanel-pro) are a mock of the panel's proportions.

## The 86-type panel

NSPanel86PB and NSPanel86PW, and later 86 models with the same screen, are a 3.95-inch **480 × 480** touchscreen in an
86 × 86 mm wall plate. A window that narrow uses two columns. With the date and time header and the page dots, two rows
fit, so a page holds four normal controls. A `large` widget, such as the music player, fills the page.

The pictures in the README are this resolution. [`examples/nspanel.yaml`](../examples/nspanel.yaml) is the dashboard
they show.

## The 120-type panel

The 120-type panel is a 4.7-inch **750 × 1334** screen and can turn between portrait and landscape. HouseView uses its
ordinary portrait and landscape layouts for that shape. The rest of this page is the square 86-type panel.

## What to put on a page

* Four normal widgets, or one `large` widget.
* Set a thermostat's `size` to `normal` when it shares the page. Its default size is `large`, which takes the page on
  its own.
* `show_header: true` puts the date on the left and the time in the centre. The four tiles still fit.
* Swipe left and right, or use the page dots. Pages do not advance on their own.
* Hold a light to open brightness. Press the thermostat's number to open the heating view. On a small music tile, tap
  the track title to open the player at full size.
* A screensaver covers the screen after it has been idle. The example uses the clock. The first tap wakes the dashboard.

`performance: auto` chooses the lighter look on an 86-type panel, which reports 2 GB of memory and 4 cores. The example
sets `performance: lite` so a preview on a desktop matches the panel. See [performance](performance.md).

## On the panel

The panel needs a browser based on Chrome 105 or newer, the same requirement as every other HouseView screen. Two
setups that meet it:

* The Home Assistant companion app. Current NSPanel Pro firmware can install it from F-Droid; Sonoff describes that on
  the product page.
* A kiosk browser such as Fully Kiosk Browser, fullscreen, opened on the dashboard address.

The panel's Webpages shortcut can open the dashboard when its browser is new enough. A WebView older than Chrome 105
cannot load the card; see [troubleshooting](installation.md#troubleshooting).

Use a **panel view** and the address of the panel's own Home Assistant session, so it keeps its login:

```
http://homeassistant.local:8123/dashboard-panel/panel?tablet=1
```

`tablet_mode: true` on the card fills a touch display without that parameter. `?tablet=1` still forces the full screen.
Tablet mode reaches into Home Assistant internals that are not a public API; see [tablet mode](tablet.md).
`confirm_mode: inline` keeps confirmation questions inside the card when the browser blocks its own dialogs.

Edit the dashboard from a computer. Open it without `?tablet=1`, or add `?tablet=0`, to show Home Assistant's header
and sidebar. The saved full-screen setting stays on for the panel. The card editor's preview is a landscape or portrait
tablet, so check the square arrangement in a 480 × 480 window or on the panel itself.

After an update the panel keeps the previous file. Change the `?v=` on the resource URL and clear the app or kiosk
cache. See [installation](installation.md#caching).

## Example

[`nspanel.yaml`](../examples/nspanel.yaml) has three pages:

* **Room** — two lights, a thermostat and a lock.
* **Scenes** — four actions.
* **Music** — the player, full page.

Replace the entity ids with your own. The clock screensaver starts after 60 seconds without a touch.
