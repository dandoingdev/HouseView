# Overviews, screensavers and automatic displays

An **overview** is a full-screen view that HouseView paints from one entity, a folder or the clock. The same overview can
be used four ways:

| Use | How it starts |
| --- | --- |
| **Screensaver** | After a while without a touch, from the carousel's `screensaver` option |
| **Automatic display** | By itself: the [timer display](overviews/timer.md) while a timer runs, the [cover art](overviews/cover_art.md) while music plays |
| **Opened by pressing a widget** | The month calendar opens from a clock, date or calendar widget; the full weather scene opens from the weather overview's small widget; the photo frame card opens full screen |
| **Card** | Placed on a page or on a dashboard like any widget. The [home overview](overviews/home.md) is only a card: a page that builds itself from the carousel's widgets |

## The overviews

| Overview | `type` | Activation | Entity | Key options | Pressing |
| --- | --- | --- | --- | --- | --- |
| [Weather overview](overviews/weather.md) | `weather` | idle (screensaver), opened by pressing its small widget (`display: tile`), card | `weather.*` | `sun_entity`, `details`, `show_time`, `show_unit`, `frosted`, `daylight`, `display` | Card: more-info of the entity. Small widget: opens the full scene |
| [Timer display](overviews/timer.md) | `timer` | event (while the timer is `active`), automatic with `timer_display`, card | `timer.*` | none | Screensaver: closes it. Card: more-info |
| [Cover art](overviews/cover_art.md) | `cover_art` | idle with priority 10 and an eligibility rule (a speaker is playing with a cover), automatic with `music_screensaver`, card | `media_player.*` | none | Screensaver: closes it. Card: more-info |
| [Photo frame](overviews/photo_frame.md) | `photo_frame` | idle (screensaver), card | none | `folder`, `interval`, `shuffle`, `recursive`, `show_time` | Card: opens it full screen |
| [Month calendar](overviews/calendar_month.md) | `calendar_month` | idle (screensaver), opened by pressing a clock, date or calendar widget, card | none | `week_start`, `show_time` | Card: nothing |
| [Home overview](overviews/home.md) | `home` | card (a page of the dashboard; not offered as a screensaver) | none, built from the carousel's widgets | `title`, `show_time` | Chips and headings go to the page of a widget, a camera opens the camera gallery (or more-info), a scene runs |

Card types are `custom:houseview-<name>-overview-card` with the name in the table's `type` column, underscores written as
hyphens: `custom:houseview-weather-overview-card`, `custom:houseview-timer-overview-card`,
`custom:houseview-cover-art-overview-card`, `custom:houseview-photo-frame-overview-card`,
`custom:houseview-calendar-month-overview-card`, `custom:houseview-home-overview-card`; or `custom:houseview-widget-card` with `widget_type: <type>_overview`.
They appear in the card picker as **HouseView · Weather overview**, **HouseView · Photo frame** and so on.

Overviews only **read** Home Assistant: they have no way to call a service, so a screensaver or an overview card cannot
switch anything. The one exception in spirit is the [home overview](overviews/home.md): its buttons ask the card to run an action
that already exists (jump to a page, open the camera gallery, run a scene that has a widget on the dashboard), and the card runs it
under its usual guards. The overview itself never calls a service.

Nothing changes for a dashboard that does not use the feature: without a `screensaver` key and without a timer, music,
clock, date or calendar widget, HouseView adds no element, no listener and no timer for it.

## Screensavers

A screensaver is an overview that HouseView shows over the carousel after a while without a touch. The first tap only
wakes it: the dashboard underneath is exactly as you left it, and nothing is pressed by the tap that dismissed it.

```yaml
type: custom:houseview-card
cards:
  - type: custom:houseview-clock-card
screensaver:
  type: weather # an overview, see the list above
  entity: weather.home # most overviews need an entity
  idle_timeout: 120 # seconds without a touch before it starts
```

The carousel editor has a **Screensaver** section with the same fields. It edits the first entry; a list is edited in YAML.

| Key | Default | What it does |
| --- | --- | --- |
| `type` | required | The overview to show |
| `entity` | by overview | The overview's entity (the weather overview needs a `weather.*` entity) |
| `enabled` | `true` | `false` keeps the entry in the file but does nothing: no state, no DOM, no subscription |
| `idle_timeout` | `120` | Seconds without a touch. `0` never starts by itself; otherwise 5 to 86400. Ignored by event overviews |
| `start_in_edit_mode` | `false` | Also run while the dashboard is being edited |
| `preview` | `false` | Show it at once, and again 5 seconds after every dismissal. For choosing options in the editor |
| ... | | Then the overview's own options, flat beside these (`details`, `sun_entity`, ... for weather) |

A wrong value is reported when the card loads, for example `Screensaver idle_timeout must be 0 or a number of seconds from
5 to 86400.` or `weather screensaver needs a weather entity.`

Only the carousel (`custom:houseview-card`) has a screensaver; a standalone widget card does not read the key.

### Several screensavers

```yaml
screensaver:
  - {type: weather, entity: weather.home, idle_timeout: 90}
  - {type: photo_frame, folder: media-source://media_source/local/Photos, idle_timeout: 90}
  - {type: calendar_month, idle_timeout: 90}
```

Each time the screensaver starts it shows the next **enabled** entry, round robin. The timeout is the one of the entry
that will be shown next. The position survives dismissals but not a configuration change. Event entries (below) are not
part of the rotation. Some overviews rank above others (cover art over weather): then the highest ranking one that can be
shown right now goes first, and only entries of the same rank take turns.

### When it starts, and when it does not

HouseView counts a touch, a key press, a mouse wheel or a screen touch on the card as activity. The screensaver starts when
`idle_timeout` seconds have passed since the last one. Time is measured by the clock, so a tablet that slept is treated as
having been touched when it wakes: you see the page first, then the screensaver after a full timeout.

It does **not** start, and the timeout starts again after the reason is gone, while:

* the camera grid is open, the timer alarm is showing, or a service call is still running;
* the dashboard is in **edit mode** (unless `start_in_edit_mode: true` or `preview: true`);
* the browser tab is hidden. A running screensaver goes away at once when the tab is hidden.

A running screensaver is dismissed by a tap or swipe on it, by Escape, Enter or Space, and by anything above it (the alarm
rings, the grid opens, edit mode is switched on). The arrow keys and swipes never reach the carousel underneath.

Edit-mode detection relies on how Home Assistant wraps a card that is being edited. It is a best effort: if it misses, the
screensaver can start while you edit, and the first tap just wakes it. `enabled: false` switches the feature off whatever
Home Assistant does.

## Event overviews

An event overview is shown **because something happened** instead of after a quiet spell. The timer display is the one that
ships. Configure it like any other entry, alone or in a list beside idle entries:

```yaml
screensaver:
  - {type: weather, entity: weather.home, idle_timeout: 120} # after two quiet minutes
  - {type: timer, entity: timer.kitchen_timer} # while the kitchen timer is running
```

* **When it appears.** The moment its condition turns true (for the timer display: the timer starts, whether from HouseView,
  from Home Assistant or from a voice assistant), and also when the page loads while the condition already holds. It appears
  over the dashboard, and over a weather screensaver that is already showing (the event replaces it).
* **What holds it back.** The same things that hold back any screensaver (the camera grid, the timer alarm, edit mode, a
  hidden tab), with one difference: a service call still in progress does **not** hold it back, so a timer you start from a
  HouseView widget brings its display up straight away. If it is held back, it appears as soon as the reason is gone, as long
  as the condition still holds.
* **Dismissing it.** A tap, swipe, Escape, Enter or Space puts the dashboard back, exactly as left, and presses nothing. The
  event itself carries on (the timer keeps running). It then **stays away until the condition has gone false and true
  again**, so a timer you dismissed does not pop back up every second; the next timer does bring it up.
* **It goes by itself** when it is no longer wanted: the timer finishes or is cancelled. A timer that Home Assistant still
  reports as running but whose end time has already passed (a tablet waking from sleep, a late update) is treated as over.
* **Two timers.** With two timer displays configured, the newer timer's display replaces the older one. When the newer timer
  ends or is cancelled, the older one, still running, comes back. A tap puts the dashboard back for both.
* **`idle_timeout` is ignored** for an event overview. A configuration of event entries only never starts by itself at all.
* **`preview: true`** shows it at once whether or not the condition holds, and again 5 seconds after each dismissal.

## Automatic displays

Two displays are built in. You do not choose them in the `screensaver` block, and they work on a dashboard that has no
`screensaver` block at all. They follow the widgets on the carousel.

| Card option | Default | What it does |
| --- | --- | --- |
| `timer_display` | `true` | Every **timer** widget shows the [timer display](overviews/timer.md) while its timer runs |
| `music_screensaver` | `true` | Every **media player** widget shows its album cover when the screensaver would start and that speaker is playing |

```yaml
type: custom:houseview-card
cards:
  - {type: custom:houseview-timer-card, entity: timer.kitchen_timer}
  - {type: custom:houseview-media_player-card, entity: media_player.living_room}
screensaver: {type: weather, entity: weather.home} # optional, stays the default
# timer_display: false                              # no timer display at all
# music_screensaver: [media_player.kitchen]         # only this speaker, whatever the widgets are
```

* **`false`** switches the display off. **A list** of entities replaces the widgets: only those timers or speakers (they
  do not need a widget on the dashboard). `true`, or leaving the key out, means every widget of that kind. A wrong value is
  reported when the card loads: `timer_display must be true, false or a list of timer entities.` and
  `music_screensaver must be true, false or a list of media_player entities.`
* **The timer display is an override.** It behaves like an event overview: it appears over the dashboard and over whatever
  screensaver is showing, a tap puts the dashboard back, it goes by itself when the timer ends, and control returns
  afterwards: the idle timer starts again and the screensaver (or the album cover) comes back as usual.
* **Album art only wins while music plays.** Your own screensaver (weather) stays the default. When the screensaver starts,
  HouseView asks each media player whether it is playing with a picture it can show; if one is, its cover is shown,
  otherwise the screensaver you configured. If nothing can be shown (no screensaver configured, nothing playing) nothing
  starts, and the idle timeout begins again. A paused speaker keeps the cover on screen; it goes when the speaker stops,
  turns off or goes away. The cover and the track text follow track changes. Album art does not replace a screensaver that is
  already showing; only a running timer does. While the music widget is on the page that is showing and its speaker is
  playing, the idle time is 5 seconds, so the cover appears soon after you stop touching the music page.
* **How long until it starts?** The timeout of your first screensaver entry (`idle_timeout`, 120 seconds if the entry has
  none); 120 seconds when you have no screensaver entry. `idle_timeout: 0` on your entry means nothing starts by idle time,
  album art included. The timer display ignores all of this.
* **One timer or speaker only.** Write an explicit entry: `{type: timer, entity: timer.kitchen_timer, enabled: false}`
  switches that one timer's display off and leaves the others. An explicit entry for the same timer or speaker wins over the
  automatic one, so it can also carry `start_in_edit_mode`. You can also add `{type: cover_art, entity: ...}` yourself.
* **Only on the carousel.** A standalone timer or music card (one card on a Home Assistant dashboard, not inside
  `custom:houseview-card`) never starts these displays.
* **Cost.** A dashboard without a timer or music widget, or with both keys `false`, adds nothing.

The visual editor has an **Automatic displays** section with the two switches. A list written in YAML is kept as it is until
you flip that switch.

## Opened by pressing a widget

* **Month calendar.** Pressing a clock, date or calendar widget opens the [month calendar](overviews/calendar_month.md) full
  screen; a tap closes it. Turn this off with `calendar_view: false` on the carousel. An explicit
  `screensaver` entry with `type: calendar_month` (for example with `week_start: sunday`) supplies the options.
* **Weather scene.** A weather overview card with `display: tile` is a small widget; pressing it opens the full scene.
* **Photo frame.** The photo frame card opens full screen when pressed.

These layers are one-off: they never start by themselves, they run even in edit mode, and the first tap on them only closes
them.

## Tablet, bedtime and motion

* **Wall tablet (`?tablet=1`)**: the overview fills the screen like the carousel does.
* **Bedtime dimming**: the layer sits inside the card, so the dimming dims it too. An overview never toggles the dim and a
  wake does not undo it.
* **Reduced motion**: with `prefers-reduced-motion: reduce` the fade and the scene's animation are off. The layer still stays
  for a moment after the tap so that the tap cannot press a control underneath.
* **Weak tablets**: the card's `performance` option applies to overviews too. `lite`, which `auto` chooses on a low-end
  device, shows a still weather scene (no rain, snow, fog, hail, lightning, sun rays or drift) and no fade. See
  [performance](performance.md).
* **Native cards** on a page keep working under the layer and still count as activity.

## Data and cost

Overviews that need more than the entity's state (the weather forecast, the photo folder) read through Home Assistant's
websocket. Subscriptions are shared between cards and released two seconds after the last user is gone; nothing is polled.
If the integration offers no forecast, or the connection refuses the subscription, the weather scene falls back to what the
entity's attributes carry and leaves out what it cannot know.

The scenes are painted with CSS only (no images other than the album, camera and photo pictures, no filters, no per-frame
JavaScript) and stay within a small layer budget, so they run on an old wall tablet. Once the fade-in is over the layer is
opaque, and HouseView hides the carousel under it and pauses everything it was doing: no widget repaint, no countdown, no
camera snapshot request. The first thing a wake does is catch all of that up.

## Errors

| Message | Cause |
| --- | --- |
| `Screensaver list needs at least one entry.` | `screensaver: []` |
| `Screensaver must be an object or a list of objects.` | An entry is not a mapping |
| `Screensaver needs a type.` | An entry has no `type` |
| `Unsupported screensaver: x` | `type` is not an overview (the editor lists the ones that are) |
| `Screensaver enabled must be true or false.` | A bad `enabled` (`start_in_edit_mode` and `preview` likewise) |
| `Screensaver idle_timeout must be 0 or a number of seconds from 5 to 86400.` | A bad `idle_timeout` |
| `weather screensaver needs a weather entity.` | A missing or wrong `entity` (`<type> screensaver needs a <domain> entity.`) |
| `Weather overview details must be a list of: ...` | An option with a bad value (`<Label> <option> must be ...`) |

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| It never starts | `idle_timeout: 0`, `enabled: false`, a blocker (camera grid, timer alarm, pending call), or the dashboard is in edit mode |
| Album art does not appear | The speaker is not playing, or its picture is not one HouseView can show (it must come from your Home Assistant). Check `music_screensaver`, and that the first screensaver's `idle_timeout` is not `0`. It only starts when the screensaver would |
| The timer display does not appear | `timer_display: false`, an explicit `enabled: false` entry for that timer, a list in `timer_display` that does not name it, or the card is not on the carousel |
| An event display does not appear | Its condition is false (is the timer running?), a blocker, or you dismissed it and the condition has not gone false and true again. `preview: true` shows it regardless |
| It starts while editing | Edit-mode detection missed (a Home Assistant update changed its wrappers). Set `enabled: false` |
| The photo frame is empty | The `folder` is not a media folder Home Assistant offers, it holds no photos (try `recursive: true`), or the files are not JPEG, PNG or WebP |
| No high/low or rain information | The weather entity offers no forecast of the needed kind; the scene shows what it can |
