---
type: vacuum
label: Vacuum
entity: required
since: 1.4
---
# Vacuum

Shows a `vacuum.*` entity as an icon tile: the name, what it is doing, and the battery when the vacuum
reports one. The integration's `status` text is used when it has one (`Brush stuck`); otherwise the activity
is shown (`Cleaning`, `Docked`, `Paused`, `Returning`, `Idle`, `Error`, `Charging`). The tile is highlighted
while the vacuum is cleaning, returning or paused.

Tap the tile to open the [vacuum view](../overviews/vacuum.md): start or resume, pause, stop, return to the
dock, clean a spot, locate, and fan speed. Only commands the vacuum advertises are shown, and a command that
does not apply right now is disabled. Hold the tile for Home Assistant's own vacuum dialog. Nothing is sent
when the tile is opened.

`vacuum_view: false` on the carousel leaves the tile on Home Assistant's dialog, opened with a hold, the same way as the other widgets.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `vacuum.*` entity |
| name | string | friendly name | Label |
| size | normal/wide/tall/large | normal | Tile size on carousel pages |
| icon | icon | `mdi:robot-vacuum` | Override the icon. A name without a prefix is an `mdi:` icon |

```yaml
type: custom:houseview-vacuum-card
entity: vacuum.robot
name: Vacuum
```
