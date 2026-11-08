# Actions

This page covers what each widget does when you touch it, and the optional Home Assistant style `tap_action`,
`hold_action` and `double_tap_action` keys that change what a widget's main button does.

## What widgets do by default

A short press runs the action on the control you touched. A half-second hold opens a different next screen only when
there is one (brightness, other scenes, Home Assistant's dialog, and so on). Where that second screen matters every day,
a visible key does the same thing without holding. Nested keys such as temperature steps, blinds, timer presets and
transport stay immediate and never start a hold. Configured `tap_action`, `hold_action` and `double_tap_action` still
override the defaults below.

Every control that calls a Home Assistant service uses the entity of the widget you pressed, and nothing else.
HouseView never calls a service when a page loads, when you open the editor, or when you swipe. While a call is running
the widget is disabled; if it fails, the reason appears in a line at the bottom of the card ("Could not complete
action: ..."). Unavailable entities are shown disabled and cannot be pressed. The same holds for entities whose state is
`unknown`, except scenes, buttons, input buttons and blinds, which stay usable (they report `unknown` until first used),
and information widgets, which still open the entity dialog.

| Widget | Control | Service called |
| --- | --- | --- |
| `light` | tap the tile | `light.toggle`, or `light.turn_off` when `action: off` |
| `light` | icon key / hold (default `action: view`) | opens the brightness view |
| `switch`, `fan` | tap the tile | `homeassistant.toggle` on the entity |
| `switch`, `fan`, `lock` | icon key / hold | opens the entity dialog |
| `lock` | tap the tile | `lock.lock` or `lock.unlock`. Unlocking asks "Unlock this door?" first. A lock that is moving or jammed opens its dialog |
| `cover` | Open, Stop, Close | `cover.open_cover`, `cover.stop_cover`, `cover.close_cover`. A key is disabled when the cover does not support it |
| `cover` | heading | opens the entity dialog |
| `climate` | down and up chevrons | `climate.set_temperature`, in steps of the thermostat's `target_temp_step` (0.5, or 1 for Fahrenheit), clamped to its minimum and maximum. A thermostat in `heat_cool` mode has the chevrons disabled |
| `climate` | temperature number | opens the thermostat view (entity dialog with `climate_view: false`); hold opens the entity dialog when the tap opened the view |
| `media_player` | play/pause, previous, next | `media_player.media_play_pause`, `media_previous_track`, `media_next_track`. Play/pause on a stopped speaker opens its dialog |
| `media_player` | shuffle, repeat | `media_player.shuffle_set`, `media_player.repeat_set` (off, all, one) |
| `media_player` | volume + and - | `media_player.volume_set` in steps of 5% |
| `media_player` | track title | opens speaker settings, or the full player on a small tile |
| `timer` | 5, 10, 15, 30 minute presets | `timer.start` with a `duration`. Replacing a running timer asks first |
| `timer` | pause, resume, cancel | `timer.pause`, `timer.start`, `timer.cancel` |
| `timer` | countdown face | opens the entity dialog |
| `action` | tap | `scene.turn_on`, `script.turn_on`, `button.press` or `input_button.press` |
| `action` (scene) | Scenes key / hold | other scenes on the dashboard, or the entity dialog when alone |
| `camera` | tap | opens the [camera grid](cameras.md) when `camera_gallery` is set, otherwise the entity dialog |
| `clock`, `date` | tap | opens the [month calendar](overviews/calendar_month.md) (off with `calendar_view: false`) |
| `calendar` | tap | opens the month calendar, or the entity dialog with `calendar_view: false` |
| `sensor` | tap | opens the entity dialog |
| `weather`, `alarm_control_panel`, `vacuum` | tap | opens that widget's full-screen view (entity dialog when the matching `*_view: false` option is set); hold opens the entity dialog |
| `plants` | plant pod | opens that plant's humidity sensor dialog |
| `plants` | heading / hold | opens the plants view |

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
holding for half a second runs `hold_action` when configured, otherwise the default next screen from the table above.
A press that moves more than 10 pixels is a swipe, not a tap.

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

## Swipe-up quick actions

Open **Quick actions · Swipe up** in the HouseView card editor to choose and order up to six shortcuts. Each has an entity, optional name, icon and note, a behaviour and an optional confirmation. The editor previews this screen without enabling its action buttons. The same screen is available from every carousel page; it adds no pages or scrolling.

Swipe up from anywhere across the bottom toolbar, including its buttons and gaps, to open it, then swipe down anywhere on the screen to return. Toolbar buttons still respond to ordinary taps. The down key and Escape also close it; **Alt+↑** opens it when the dashboard has keyboard focus. Opening, dismissing and editing never call a device service. Horizontal drags and cancelled gestures cannot press a shortcut. Sliders and covering views retain their own gestures, and the home summary’s downward pull from the top stays independent.

**Automatic** runs scenes, scripts and buttons; it toggles lights, switches, fans, automations and input booleans. **Turn off** always sends an off command. For “all lights off”, choose a Home Assistant light group with **Turn off**, or a script containing the routine. Guest mode can use an input boolean, scene or script. The screen shows current on/off and running states, disables unavailable or busy entities, and stays open after an action. Failures appear on the screen. Confirmations use the dashboard’s existing `confirm_mode`.

```yaml
type: custom:houseview-card
quick_actions_title: House shortcuts
quick_actions:
  - entity: light.demo_group
    name: All lights off
    icon: mdi:lightbulb-group-outline
    action: turn_off
    note: Every room
  - entity: input_boolean.demo_guest_mode
    name: Guest mode
    icon: mdi:account-group-outline
  - entity: script.demo_goodnight
    name: Good night
    icon: mdi:weather-night
    confirm: true
cards:
  - type: custom:houseview-clock-card
```

For advanced actions, an item may include the same `tap_action` object described above, including explicit service data, targets and confirmation text. It overrides the automatic behaviour; `confirm: true` adds a confirmation when the tap action has none. Native settings preserve advanced action data. No action is inferred from a display name, and the list is saved only in this card’s configuration.

Quick actions can also open the [Leaving home and Good night guided flows](house-modes.md#quick-action-shortcuts) with `flow: away` or `flow: sleeping`. These entries open review and never execute a routine immediately.
