---
type: light
label: Light
entity: required
since: 1.0
---
# Light

Shows a `light.*` entity as an icon widget with its name and state. The widget is highlighted while the light is `on`.
Press the icon to open the full-screen light view: drag up or down to dim, or use its keyboard-accessible slider. Press the rest of the tile to toggle on/off. With `action: toggle` a tap toggles the light (`light.toggle`); with `action: off` a tap always calls `light.turn_off`, which suits
"everything off" and bedtime widgets. An unavailable or unknown light is shown disabled.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `light.*` entity |
| name | string | friendly name | Label |
| size | normal/wide/tall/large | normal | Widget size on carousel pages |
| icon | icon | `mdi:lightbulb-outline` | Override the icon. A name without a prefix is an `mdi:` icon |
| action | view/toggle/off | view | `view` opens brightness from the icon and toggles from the rest of the tile; `toggle` flips the light; `off` always turns it off. Unquoted YAML `off` is accepted |

```yaml
type: custom:houseview-light-card
entity: light.living_room
action: off
```
