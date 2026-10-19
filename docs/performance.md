# Performance on old wall tablets

HouseView is built for a screen that stays on all day. The reference device is a low-end Android tablet: about a Snapdragon
429 class SoC, 2 GB of RAM, a 1280 x 800 panel, Android WebView and a weak GPU. This page explains what HouseView does to
stay light there, how to switch the glass blur and animation off (`performance`), and how to measure the result on your
own tablet.

## The `performance` option

```yaml
type: custom:houseview-card
performance: auto # auto (default), full or lite
```

| Value | Result |
| --- | --- |
| `full` | Blurred glass widgets, the page glide and the weather scene's animation |
| `lite` | **No `backdrop-filter`**: the glass widgets are opaque, tinted to match the blurred glass they replace. **No decorative animation**: no page glide, no press or fade transitions, a still weather scene (sky, sun or moon, stars and clouds; no rain, snow or fog layer, no sun rays), and the bedtime dimmer is a plain dark layer instead of a filter. Sizes, layout and behaviour are the same |
| `auto` | `lite` on a device that looks low-end, `full` everywhere else (see below) |

`auto` picks `lite` when the browser reports any of:

* `navigator.deviceMemory` of 2 (GB) or less;
* `navigator.hardwareConcurrency` of 4 logical cores or fewer;
* an Android **WebView** whose user agent says Android 9 or older, or a "Go" edition (the 1 to 2 GB tablets).

Nothing else decides: browsers do not report GPU strength. Desktop browsers and recent phones report more than that, so they
keep `full`. If `auto` guesses wrong for your tablet, set `performance: lite` or `performance: full`. The visual editor has
the same choice under **Appearance > Performance**.

`lite` changes paint only. It is the same page, so a screenshot of a `lite` card is the `full` card with flat glass.

## What HouseView does on every device

These apply whatever `performance` says.

* **A second that changes nothing writes nothing.** The clock widget ticks every second but moves its hands and its label once
  a minute. The `Intl` formatters it needs are built once.
* **Formatting is shared and bounded.** Clocks, calendars, photo dates, number labels and the dashboard header share
  `core/intl.js`, retaining at most 128 recently used formatters. Locale, time zone, options and fallback policy are part
  of the key, so switching profile preferences does not reuse the wrong formatter.
* **Registry lookups reuse derived data.** The sorted widget list, extension definitions and unknown-state domain set are
  rebuilt only when a widget is registered or the registry resets. Entity availability checks use set membership without
  rebuilding an array for each widget.
* **One layout pass reads, then writes.** Resizing, a stylesheet arriving or the resize observer do not rewrite the grid, the
  page navigation and the dial sizes when their inputs have not changed.
* **Changes are patched, not rebuilt.** A state change updates only the widgets it touches, in place, so images, focus and
  animations survive. The patcher traverses siblings directly rather than allocating child arrays for every element.
  A state change of an entity the card does not show costs a signature comparison.
* **An overview is cheap.** Once its fade-in has finished the layer is opaque and HouseView hides the carousel under it
  (`visibility: hidden`, retaining layout), so the widgets, their blur and the camera picture are not painted. While it covers
  the card nothing underneath is updated: no widget repaint, no countdown, no clock hands, **no camera snapshot request**, no
  hass for native cards. Wake catches the tiles up behind the opaque overview and waits two animation frames before revealing
  them. This avoids exposing a cold paint on Android WebView, including in lite and reduced-motion modes.
* **The weather scene is gradients only.** The clouds are soft radial-gradient puffs (no mask, no blur) that share one layer
  which drifts slowly; at most three animations run at once, they move `transform` or `opacity` only, are promoted to layers
  only while they run, and none runs under `prefers-reduced-motion`.
* **Timers that cannot be seen do not run.** The one shared one-second ticker stops while the page is hidden; the page
  listeners and the resize observer are removed when a card is disconnected.
* **Camera pictures decode off the main thread** (`decoding="async"`).
* **Analogue screensaver seconds sweep on the compositor** (a 60 s CSS animation). Hour, minute and date still
  update from the shared ticker; reduced motion keeps the one-second JavaScript write. Lite leaves that sweep on
  (it is wall time, not decoration).
* **Neighbour pages are built after layout settles**, so a finger drag only translates. Commit still promotes the
  prepared face and applies state received during the gesture.
* **A hass update repaints only the tiles whose watched entities changed.** Locale, units, time zone and dark mode
  still refresh every tile.
* **Automatic battery discovery caches** until the entity or device registry object is replaced, and the home
  overview patches its clock, camera snapshots and attention rows in place instead of rebuilding the scene each
  minute.
* **The production bundle is fully minified** (local names too; the source map is a separate file).

## Tips for a slow tablet

* Keep pages small: one page is rendered at a time, so fewer widgets per page means less work per update.
* Set `performance: lite` explicitly if `auto` chose `full`.
* Keep the camera grid small, and leave `stream` off (the default) unless you need it.
* For the photo frame use resized photos (about 1600 px wide).

## Measuring: `npm run perf`

`tools/perf-bench.mjs` drives Chrome through the DevTools protocol. It emulates 1280 x 800 and 800 x 1280 touch tablets,
throttles the CPU (4x and 6x) and the network, loads the real card with a mock `hass` and a realistic dashboard (12 widgets
on three pages, a two-camera grid, the weather screensaver; automatic timer/music overlays disabled during dashboard phases) and measures bundle fetch and parse time, time to first render,
the JavaScript time per `hass` update, main-thread busy time and dropped frames while idle, on swipe and under a
screensaver, and memory.

```sh
npm run build            # the production bundle, dist/houseview.js
npm run perf             # both viewports at 4x and 6x
node tools/perf-bench.mjs --throttle=6 --viewports=1280x800 --runs=3   # one cell, median of three
node tools/perf-bench.mjs --performance=lite --device=tablet           # the lite look; tablet user agent and 4 cores
node tools/perf-bench.mjs --json=after.json --compare=before.json      # before / after columns
```

Chrome's throttling slows JavaScript, style and layout, not the GPU, so frame numbers on a computer under-report what a weak
tablet does.

### Measuring the real tablet

The same page runs on the tablet. Build the bundle and start the bench server on a computer on the same network, then open
the printed address in the tablet's browser (or the companion app's WebView, which is what a wall display uses):

```sh
npm run build
node tools/serve.mjs 8765 --lan
# on the tablet:  http://<the computer's address>:8765/tools/perf-bench.html?src=/dist/houseview.js&auto=1
```

`--lan` listens on the network, so it serves **only** the bench page, the bundle and two placeholder images; the rest of the
repository is not reachable. Stop it with Ctrl-C when you are done.

`auto=1` loads the bundle, mounts the dashboard, and prints the bundle fetch and parse times, the first render time, the cost
of 500 hass updates, the dropped frames over 3 s idle and 3 s of screensaver, and the number of long tasks into the page.
Compare shapes, not absolute numbers: if the tablet is several times slower than your computer in every row it behaves as
expected; a row that is far worse (frames dropped while the computer drops none) is a GPU cost the computer cannot show, and
the place to try `performance: lite`.

### What a computer cannot show

* **GPU and raster cost.** Backdrop blur, masks, large animated layers and tile memory are reported as counts and megabytes,
  not as milliseconds on a Mali or Adreno part.
* **Memory pressure.** 2 GB shared with Android, the WebView and Home Assistant's frontend.
* **Home Assistant's own elements.** The bench uses stand-ins for `ha-icon` and `ha-card`; the real ones are heavier.
* **Thermal throttling, storage speed and the WebView version** of the device.
* **The `auto` guess** for that device: check `navigator.deviceMemory`, `navigator.hardwareConcurrency` and the user agent in
  the bench page's first lines.
