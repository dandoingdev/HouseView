---
type: fan
label: Fan
entity: required
since: 1.0
---
# Fan

Shows a `fan.*` entity as an icon widget with its name and state. The widget is highlighted while the fan is `on`.
A tap calls `homeassistant.toggle`. An unavailable or unknown fan is shown disabled.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `fan.*` entity |
| name | string | friendly name | Label |
| size | normal/wide/tall/large | normal | Widget size on carousel pages |
| icon | icon | `mdi:fan` | Override the icon. A name without a prefix is an `mdi:` icon |

```yaml
type: custom:houseview-fan-card
entity: fan.bedroom
```
