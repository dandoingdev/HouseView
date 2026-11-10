# House modes

Home, Away, Guests, Evening and Sleeping share one Home Assistant selector. A dedicated screen shows the reported mode,
the five choices, and **Return to Home** when another mode is active. Explanations stay in the confirmation and in this guide.
A small mode indicator remains
in the dashboard header on every page; press it to open House modes. Swipe right from anywhere along the leftmost 64 pixels (48 pixels on a narrow 240px card) to open it from any dashboard page, and swipe left across the screen to dismiss. Vertical swipes scroll longer mode lists. Escape closes the screen. From Leaving home or Good night, Escape returns to the mode list unless the routine is running or being verified, in which case it closes the screen. Alt+Right opens House modes when the dashboard has focus. When modes are enabled the indicator takes
the date's place, while the time and playback shortcut keep their positions.

In **Edit card → House modes · Swipe from left**, use **Create house mode helper** as a Home Assistant administrator. This explicitly
creates a dropdown with the five standard options and connects it to the card. A matching HouseView helper is reused
on retries. You can also select an existing `input_select` or `select`; option names must match exactly. The setup
links to Helpers and Scripts in Home Assistant, and needs no YAML.

For each mode, choose an existing script and write a short explanation of its actual changes. For example, Guests
might keep the hallway lit and pause bedroom motion routines. Configure Home too: its script should restore everyday
behaviour, including anything the other routines changed. The helper alone does not change devices. If you already
have automations that react to the selector, leave the scripts empty to avoid running routines twice.

The mode list itself does not repeat those explanations. Home, Guests and Evening open an in-card confirmation that shows the explanation, even when ordinary confirmations use native dialogs. Away and Sleeping still need an explanation before they can run, and they open the guided review described below instead of that confirmation. The review shows the checklist, not the explanation.
A configured script runs first; if it fails, HouseView shows the error without selecting the new mode. After a successful
request, the display waits for Home Assistant to report the mode. The indicator represents the selector's state; it does
not certify the resulting state of every device. Changes from another dashboard or an automation update this view too.

Modes without descriptions, missing selector options, unavailable or running scripts, and unavailable selectors cannot
be activated. Away and Sleeping can still be opened to review their checks. Home must have a description and a supported option before any other mode can be activated. Nothing is
created or run by merely opening the editor or its preview.

```yaml
house_mode_entity: input_select.houseview_house_mode
house_modes:
  - mode: home
    option: Home
    description: Restore everyday lighting and motion routines.
    script: script.home_routine
  - mode: away
    option: Away
    description: Turn off shared-room lights and use the away heating schedule.
    script: script.away_routine
  - mode: guests
    option: Guests
    description: Keep the hallway lit and pause bedroom motion routines.
    script: script.guest_routine
  - mode: evening
    option: Evening
    description: Lower the living room lights and set the evening heating schedule.
    script: script.evening_routine
  - mode: sleeping
    option: Sleeping
    description: Turn off shared-room lights and pause overnight announcements.
    script: script.sleep_routine
```

The five mode IDs are fixed; `option` maps each one to the selector's exact option text. `description` is plain text,
and `script` is optional. Returning Home requests the Home option and its configured script; it does not infer an undo
for arbitrary automations. Removing `house_mode_entity` hides the feature without deleting your Home Assistant helper.

## Leaving home and Good night

Choosing **Away** or **Sleeping** opens a guided review instead of immediately changing the mode. The screen shows the currently reported mode and a checklist with exceptions first. **Leave home**
or **Good night** stays visible while the checks scroll. Opening either flow, including from Quick actions, never
runs a device service. Back returns to House modes; a leftward swipe dismisses the whole screen.

In **Edit card → House modes · Swipe from left**, expand the Away or Sleeping entry and add **checks**. The
**Use dashboard devices for readiness checks** button can populate empty lists from your configured lights, locks,
heating and alarm widgets, plus the door/window rules in Home Summary. Suggestions never send commands or replace
an existing non-empty list. Review each expected state before saving.

Each routine can check up to 24 entities, once each:

| Kind | Entity domain | Default expected state | In-screen action when appropriate |
| --- | --- | --- | --- |
| `opening` | `binary_sensor` | `off` (closed) | Details; contacts cannot close a physical window |
| `light` | `light` | `off` | Turn off that light |
| `lock` | `lock` | `locked` | Lock an unlocked door; other states open Details |
| `climate` | `climate` | `off` | Turn off if the device supports Off; otherwise Details |
| `alarm` | `alarm_control_panel` | `armed_away` for Away, `armed_home` for Sleeping | Details, where Home Assistant handles codes and arming controls |

Set `name` for a friendly label and `expected_state` to override the climate or alarm target. Climate checks compare
the reported HVAC mode, rather than room temperature or a target-temperature attribute. For example, Sleeping can
expect `armed_night`. Unknown, unavailable, missing and disconnected reports remain **Couldn’t check**, never Ready.
Details uses Home Assistant's normal entity dialog. Fixes run only after an explicit press and target just that entity.

The final action runs the configured script and then requests the selector option. This review replaces the ordinary
mode confirmation for Away and Sleeping. A script failure leaves the selector alone, reports the error and displays
whatever device states are actually reported; some script steps may have completed before a failure. If you use
selector-triggered automations instead, leave `script` empty.

After a successful request, HouseView waits up to 15 seconds for the selector and all configured checks to match.
A successful service response alone does not count as verification. Results distinguish verified checks, remaining
exceptions, and checks that could not be made. The mode is confirmed separately. Results stay live, so an alarm
with a longer exit delay can become verified later. A routine without checks can confirm its mode but explicitly
states that no devices were checked. Verification covers only the entities you configured and their reported states.

Reviewing an already-active Away or Sleeping mode still shows live checks and useful fixes; the activation button
indicates that the mode is already active. Dismissing or reconfiguring the screen cancels pending verification work.
A script already started can have changed devices; a dismissed flow does not queue a subsequent selector change.

```yaml
house_modes:
  - mode: home
    description: Restore everyday lighting and motion routines.
    script: script.home_routine
  - mode: away
    description: Turn off the shared-room lights, lock the front door and arm the alarm.
    script: script.away_routine
    checks:
      - entity: binary_sensor.kitchen_window
        kind: opening
        name: Kitchen window
      - entity: light.living_room
        kind: light
        name: Living room lights
      - entity: lock.front_door
        kind: lock
      - entity: climate.heating
        kind: climate
        expected_state: heat
      - entity: alarm_control_panel.home
        kind: alarm
  - mode: sleeping
    description: Turn off shared-room lights and arm the night alarm.
    script: script.sleep_routine
    checks:
      - entity: alarm_control_panel.home
        kind: alarm
        expected_state: armed_night
```

### Quick action shortcuts

In **Quick actions · Swipe up**, add an entry and choose **Leaving home · guided routine** or **Good night · guided
routine** in its Flow field. Device entity and device-action fields are not used for these shortcuts. Both open the
same review screens, including their checks, script and verification; neither bypasses review.

```yaml
quick_actions:
  - flow: away
    name: Leaving home
  - flow: sleeping
    name: Good night
```
