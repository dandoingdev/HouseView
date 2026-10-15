# Actions

This page covers what each widget does when you touch it, and the optional Home Assistant style `tap_action`,
`hold_action` and `double_tap_action` keys that change what a widget's main button does.

## What widgets do by default

Every control calls a Home Assistant service on the entity of the widget you pressed, and nothing else. HouseView never
calls a service when a page loads, when you open the editor, or when you swipe. While a call is running the widget is
disabled; if it fails, the reason appears in a line at the bottom of the card ("Could not complete action: ..."). Unavailable
entities are shown disabled and cannot be pressed. The same holds for entities whose state is `unknown`, except scenes,
buttons, input buttons and blinds, which stay usable (they report `unknown` until first used), and information widgets,
which still open the entity dialog.

| Widget | Control | Service called |
| --- | --- | --- |
| `light` | tap | `light.toggle`, or `light.turn_off` when `action: off` |
| `switch`, `fan` | tap | `homeassistant.toggle` on the entity |
| `lock` | tap | `lock.lock` or `lock.unlock`. Unlocking asks "Unlock this door?" first. A lock that is moving or jammed opens its dialog |
| `cover` | Open, Stop, Close | `cover.open_cover`, `cover.stop_cover`, `cover.close_cover`. A key is disabled when the cover does not support it |
| `climate` | down and up chevrons | `climate.set_temperature`, in steps of the thermostat's `target_temp_step` (0.5, or 1 for Fahrenheit), clamped to its minimum and maximum. A thermostat in `heat_cool` mode has the chevrons disabled |
| `media_player` | play/pause, previous, next | `media_player.media_play_pause`, `media_previous_track`, `media_next_track`. Play/pause on a stopped speaker opens its dialog |
| `media_player` | shuffle, repeat | `media_player.shuffle_set`, `media_player.repeat_set` (off, all, one) |
| `media_player` | volume + and - | `media_player.volume_set` in steps of 5% |
| `timer` | 5, 10, 15, 30 minute presets | `timer.start` with a `duration`. Replacing a running timer asks first |
| `timer` | pause, resume, cancel | `timer.pause`, `timer.start`, `timer.cancel` |
| `action` | tap | `scene.turn_on`, `script.turn_on`, `button.press` or `input_button.press` |
| `camera` | tap | opens the [camera grid](cameras.md) when `camera_gallery` is set, otherwise the entity dialog |
| `clock`, `date` | tap | opens the [month calendar](overviews/calendar_month.md) (off with `calendar_view: false`) |
| `calendar` | tap | opens the month calendar, or the entity dialog with `calendar_view: false` |
| `sensor`, `weather`, `alarm_control_panel`, the thermostat temperature | tap | opens the entity's dialog. HouseView never arms or disarms an alarm |

Scenes and scripts cannot take variables from a widget. For a parameterised routine, create a script in Home Assistant and
point an `action` widget at it.

## Choosing what a widget does: `tap_action`, `hold_action`, `double_tap_action`

Add any of these three keys to a widget and its main button follows them, using the same format as Home Assistant's
own cards. Without the keys, the table above applies and nothing changes. The keys work on widgets whose whole face is one
button (`light`, `switch`, `fan`, `lock`, `sensor`, `weather`, `calendar`, `alarm_control_panel`, `action`, `camera`),
in the carousel and on standalone cards. The inner buttons of panel widgets (blinds keys, timer presets, music transport,
thermostat chevrons) and the clock and date widgets always keep their built-in behaviour.

```yaml
type: custom:houseview-light-card
entity: light.living_room
tap_action:
  action: toggle
hold_action:
  action: more-info
double_tap_action:
  action: perform-action
  perform_action: light.turn_on
  data:
    brightness_pct: 100
  target:
    entity_id: light.living_room
```

A tap runs after a short wait only when `double_tap_action` is set (to tell a tap from the first half of a double tap);
holding for half a second runs `hold_action`. A press that moves more than 10 pixels is a swipe, not a tap.

### Action types

| `action` | Keys | What it does |
| --- | --- | --- |
| `more-info` | `entity` | Opens the entity's dialog. |
| `toggle` | `entity` | Calls `homeassistant.toggle` on the entity. |
| `perform-action` | `perform_action` (`domain.service`), `data`, `target`, `entity` | Calls any Home Assistant action. `target` ids (`entity_id`, `device_id`, `area_id`) are merged into the data. The older name `call-service` with `service` is accepted. |
| `navigate` | `navigation_path`, `navigation_replace` | Changes the dashboard address, for example `/lovelace/lights`. |
| `url` | `url_path` | Opens a link in a new tab. Only `http`, `https`, `mailto` and `tel` links and relative paths are opened. |
| `none` | | Does nothing. |

`entity` defaults to the widget's own entity. If a gesture has no `action`, it defaults to `more-info` for tap and
hold and `none` for a double tap. `assist` is not supported.

### Confirmation

```yaml
tap_action:
  action: perform-action
  perform_action: script.turn_on
  target:
    entity_id: script.reboot_router
  confirmation:
    text: Restart the router?
    exemptions:
      - user: 0123456789abcdef0123456789abcdef   # a Home Assistant user id
```

`confirmation: true` asks "Are you sure?". With `text` you choose the question. Users listed in `exemptions` are not
asked. The question is a browser dialog unless the card has `confirm_mode: inline`, which shows a sheet inside the
card instead (see [configuration](configuration.md)).

## The action widget

The `action` widget runs scenes, scripts, buttons and input buttons:

```yaml
- type: custom:houseview-action-card
  entity: script.goodnight
  name: Good night
  icon: mdi:weather-night
  note: Lights off, doors locked
```

A script that is already running shows "Running" and cannot be started again until it is off. A scene or button that has
never been used, so its state is `unknown`, is still pressable. In the visual editor the entity picker offers all four
domains and the standard icon picker supplies the optional icon.

For "everything off" and bedtime widgets, a `light` with `action: off` always calls `light.turn_off`, never toggle.
See the [bedtime example](../examples/bedtime.yaml).
