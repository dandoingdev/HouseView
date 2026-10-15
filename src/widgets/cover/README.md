---
type: cover
label: Blinds
entity: required
since: 1.0
---
# Blinds

Open, stop and close a `cover.*` entity. Keys are disabled when the entity does not advertise the matching
`supported_features` bit (open 1, close 2, stop 8). A cover whose state is `unknown` stays controllable, because
blinds without position feedback never report anything else. The heading shows an icon, the name and the position (`40% open`), or
`Position unknown`, or the raw state, and opens the more-info dialog. The keys call `cover.open_cover`,
`cover.stop_cover` and `cover.close_cover`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `cover.*` entity |
| name | string | friendly name | Label |
| icon | icon | `mdi:blinds-horizontal` | The icon above the name (an `mdi:` name, or any icon Home Assistant knows). Hidden when the widget is very short |
| size | normal/wide/tall/large | normal | Widget size on carousel pages |

```yaml
type: custom:houseview-cover-card
entity: cover.living_room_blinds
```
