---
type: vacuum
label: Vacuum view
entity: required
domains: [vacuum]
since: 1.4
---

# Vacuum view

A full-screen cleaning panel for a Home Assistant `vacuum.*` entity. The name sits at the top, the activity
in large type (`Cleaning`, `Docked`, `Paused`, `Returning`, `Idle`, `Error`, `Charging`), then the battery
and the current fan speed when the vacuum reports them. A battery at or below 20% is marked. The integration's
own `status` text is shown under the activity when it says something more specific.

Under that are the commands the vacuum advertises: start or resume, pause, stop, return to the dock, clean a
spot, and locate. A command that does not apply to the current activity is shown disabled. Up to six fan
speeds are keys; the one in use is highlighted. Top right opens Home Assistant's own vacuum dialog.

The view takes one flat colour: teal while cleaning, blue while returning, slate while paused, deep teal on
the dock, and a dark red when the vacuum reports an error.

It opens when you tap a [vacuum widget](../widgets/vacuum.md) and closes with the key top left or Escape.
It is a control panel: its keys stay live, a press on the background does nothing, and the view follows the
vacuum while it is up. `vacuum_view: false` on the carousel leaves a hold on the tile opening the entity dialog.
The same keys work on a page card or a standalone card (`custom:houseview-vacuum-overview-card`), without a
close key.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `vacuum.*` entity |
| name | text | friendly name | The title |

```yaml
type: custom:houseview-card
cards:
  - type: custom:houseview-vacuum-card
    entity: vacuum.robot
    name: Vacuum
```

A `screensaver` entry of `type: vacuum` can be written in YAML. The view is not offered in the editor's
screensaver list, since an idle screensaver that only wakes on a press is not what a control panel is for.

## Commands

| Vacuum | Start | Pause | Stop | Dock | Spot |
| --- | --- | --- | --- | --- | --- |
| Cleaning | disabled | enabled | enabled | enabled | disabled |
| Returning | disabled | enabled | enabled | disabled | disabled |
| Paused | Resume | disabled | enabled | enabled | enabled |
| Docked, idle, error, charging | enabled | disabled | disabled | disabled | enabled |

Locate is enabled whenever the vacuum supports it. Older vacuums that only advertise turn on and turn off
get Start and Off. Fan speed is sent with `vacuum.set_fan_speed`. No command runs when the panel opens.
