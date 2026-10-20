---
type: alarm_control_panel
label: Alarm view
entity: required
domains: [alarm_control_panel]
since: 1.6
---

# Alarm view

A full-screen panel for a Home Assistant `alarm_control_panel.*` entity. The name sits at the top and the state in
large type (`Disarmed`, `Armed home`, `Armed away`, `Armed night`, `Armed holiday`, `Arming`, `Pending`,
`Triggered`). Under that is a key for each arming mode the panel advertises (Home, Away, Night, Holiday) and a Disarm
key. The mode that is armed is highlighted. Top right opens Home Assistant's own alarm dialog.

Arming starts from disarmed. Disarm works once the alarm is armed, counting down (`arming`, `pending`) or triggered.
A key that does not apply to the current state is shown disabled. Disarming asks to confirm first.

HouseView has no keypad. When the panel reports a `code_format` (Alarmo with a code, a keypad panel), the keys that
would need the code stay disabled, a note says so, and a Code key opens Home Assistant's dialog where the code is
entered. A panel with `code_arm_required: false` can still be armed here and is disarmed in the dialog.

The view takes one flat colour: green while disarmed, a different colour for each armed mode, amber while arming or
pending, red when triggered.

It opens when you tap an [alarm panel widget](../widgets/alarm_control_panel.md) and closes with the key top left or
Escape. It is a control panel: its keys stay live, a press on the background does nothing, and the view follows the
alarm while it is up. `alarm_view: false` on the carousel leaves a hold on the tile opening the entity dialog. The same
keys work on a page card or a standalone card (`custom:houseview-alarm-control-panel-overview-card`), without a close
key.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | An `alarm_control_panel.*` entity |
| name | text | friendly name | The title |

```yaml
type: custom:houseview-card
cards:
  - type: custom:houseview-alarm_control_panel-card
    entity: alarm_control_panel.home
    name: Alarm
```

A `screensaver` entry of `type: alarm_control_panel` can be written in YAML. The view is not offered in the editor's
screensaver list, since an idle screensaver that only wakes on a press is not what a control panel is for.

## Keys

| Alarm | Home / Away / Night / Holiday | Disarm |
| --- | --- | --- |
| Disarmed | enabled (modes the panel supports) | disabled |
| Armed (any mode) | disabled, the armed mode highlighted | enabled |
| Arming, pending, triggered | disabled | enabled |
| Unavailable or unknown | disabled | disabled |

Modes are sent with `alarm_control_panel.alarm_arm_home`, `alarm_arm_away`, `alarm_arm_night` and
`alarm_arm_vacation`; disarm with `alarm_disarm`. No command runs when the view opens.
