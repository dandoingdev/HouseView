# Tablet mode and wall displays

HouseView is made for a screen that stays on a wall or a counter: one card per screen, large touch targets, swipeable
pages. This page collects what to set up for that.

## A panel view

Put the carousel in a **panel view** (`type: panel` on the view). HouseView sizes itself from the browser window, so it needs
a view that gives its one card the whole width. In a masonry or sections view the carousel cannot fill the screen. (Single
widget cards work in any view type.) See [`tablet-kiosk.yaml`](../examples/tablet-kiosk.yaml) for a complete page.

## `?tablet=1`

Home Assistant keeps its sidebar and header around every dashboard. For a wall display, add `tablet=1` to the address:

```
http://homeassistant.example:8123/dashboard-wall/home?tablet=1
```

With that parameter HouseView hides the sidebar and the header and uses the whole window. Remove the parameter, or navigate
away, and Home Assistant looks normal again; HouseView puts back everything it hid. You can also set `tablet_mode: true` in
the card configuration to fill touch displays without the parameter. On a desktop with a mouse, this saved setting
leaves Home Assistant’s header and sidebar visible, so its dashboard menu and **Edit dashboard** remain available.
This uses the primary input type, not the window size: a small desktop window is still editable and a large touch
display can still fill its screen. The explicit `?tablet=1` parameter remains available for a desktop kiosk.

Dashboard editing and card editor previews always restore normal positioning and Home Assistant’s controls, even
with `?tablet=1`. The preview stays inside the editor dialog.

> **Unsupported Home Assistant internals.** Hiding the sidebar and header means reaching into elements of the Home Assistant
> frontend that are not a public API. HouseView detects what it needs, does nothing if something is not where it expects,
> and undoes its changes on failure, but a future Home Assistant release may stop tablet mode from working. Nothing else in
> HouseView depends on this. If it breaks, use a kiosk approach instead: a browser in kiosk or fullscreen mode (for
> example Fully Kiosk Browser), or the Kiosk Mode HACS plugin, pointed at a panel view. Please report it with your Home
> Assistant version.

Use the address of the tablet's own Home Assistant session (for example the same host name you logged in with) so that it
keeps its login.

## Orientation and size

The layout follows the window: a landscape screen uses 3 columns (a page's `columns` option sets 2 to 5), a portrait
tablet or phone-sized window uses 2. 1280 x 800 landscape and 800 x 1280 portrait are the sizes it is tuned for.
Wallpapers cover every edge. See [page layout](configuration.md#page-layout).

## Navigation

* Swipe left and right between pages, press the page dots or the arrows, or press the left and right arrow keys.
* There is no automatic rotation between pages. Use a [screensaver](screensavers.md) for an idle display: the photo frame,
  the weather scene or the month calendar.
* A running timer keeps counting on the Home Assistant server when you change pages, and the [timer
  display](overviews/timer.md) takes the whole screen while it runs.

## Bedtime dimming

Set `bedtime: true` for night styling and a **Dim** button on every page. Dim lowers the brightness of the card until you press
**Brighter**. See [theming](theming.md).

## Timers and sound

The `timer` widget's presets start a Home Assistant timer helper (create one under Settings > Devices & services > Helpers,
and turn on **Restore** so that it survives restarts). When a timer finishes while the dashboard is open and connected, a
banner appears and a short chime plays. Browsers only allow sound after the first touch on the page, so touch the tablet once
after loading. A sleeping or backgrounded tablet gets no chime: for that, build a Home Assistant automation that sends a
notification. The tablet's time zone should match yours, because the clock and date use the device clock.

## Cameras and snapshots

A camera widget shows a snapshot that refreshes every 30 seconds while its page is visible. The camera grid refreshes about
every five seconds while open and releases its connections when closed. See [cameras](cameras.md).

## Performance on old tablets

HouseView renders one page at a time, uses CSS and Home Assistant's own icons, and loads no external fonts or images.
Overview scenes are painted with CSS only and stay within a small layer budget; while one is up, the card underneath is hidden
and does no work.

On a weak tablet (about 2 GB of RAM or less, a 4-core SoC, an old Android WebView) HouseView switches to the **lite** look by
itself: opaque tinted glass instead of blurred glass, no page glide and no decorative animation. Force it with
`performance: lite` (or keep the full look with `performance: full`). See [performance](performance.md).

To temporarily show Home Assistant’s dashboard editing controls on a dashboard configured with `tablet_mode: true`, open its address with `?tablet=0`. The saved full-screen setting stays enabled for the wall panel.
