---
type: switch
label: Switch
entity: required
since: 1.0
---
# Switch

Shows a `switch.*` entity as an icon widget with its name and state. The widget is highlighted while the switch is
`on`. A tap flips it through `homeassistant.toggle`. An unavailable or unknown switch is shown disabled.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `switch.*` entity |
| name | string | friendly name | Label |
| size | normal/wide/tall/large | normal | Widget size on carousel pages |
| icon | icon | `mdi:power` | Override the icon. A name without a prefix is an `mdi:` icon |

```yaml
type: custom:houseview-switch-card
entity: switch.coffee_machine
```
