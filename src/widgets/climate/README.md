---
type: climate
label: Thermostat
entity: required
since: 1.0
---
# Thermostat

A `climate.*` entity as a minimal thermostat: a very large temperature, and along the bottom a down chevron,
the name with a "room • current temperature" line beneath it, and an up chevron. Nothing else is on the widget; power,
modes and fan are in Home Assistant's more-info dialog, which opens when you tap the number. The widget defaults to
size `large` and scales with its own size, from one cell to a large widget.

* **Temperature.** Shows the target. In `heat_cool` mode, or without a numeric target, it shows the room temperature
  instead, and the chevrons are disabled. The number is formatted for your language with at most one decimal, and is
  an em dash when unknown. Tapping it opens the more-info dialog.
* **Down / up.** Disabled unless the entity has a numeric target and advertises target-temperature support
  (`supported_features` bit 1), and disabled at `min_temp` / `max_temp`. A step is the entity's `target_temp_step`,
  else 1 for Fahrenheit and 0.5 otherwise, clamped to the limits. Each press calls `climate.set_temperature`.
* **Line under the name.** `room • 20.5°`: the `room` option, a bullet, and the current temperature. A part that is
  missing is left out, bullet included. While the entity is off the line starts with "Off •" and the number is dimmed;
  an unavailable entity shows "Unavailable" and a dash.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `climate.*` entity |
| name | string | friendly name | Label |
| size | normal/wide/tall/large | large | Widget size on carousel pages |
| room | string | none | Room name shown before the current temperature ("Living Room • 20°") |

```yaml
type: custom:houseview-climate-card
entity: climate.living_room
room: Living Room
```
