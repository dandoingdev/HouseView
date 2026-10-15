---
type: action
label: Action
entity: custom
since: 1.0
---
# Action

Runs a `scene.*`, `script.*`, `button.*` or `input_button.*` entity from an icon widget. A tap calls `scene.turn_on`,
`script.turn_on` or `button.press` / `input_button.press`. The caption under the name reads `Scene`, `Run` or
`Press`. A script that is already running shows `Running`, is highlighted and cannot be started again until it is
`off`. Scenes, buttons and input buttons stay pressable while their state is `unknown` (they never report anything
else before first use). In a `widgets:` list the types `scene`, `script`, `button` and `input_button` are accepted as
aliases of `action`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `scene.*`, `script.*`, `button.*` or `input_button.*` entity |
| name | string | friendly name | Label |
| size | normal/wide/tall/large | normal | Widget size on carousel pages |
| icon | icon | entity icon, else a domain icon | Override the icon (`mdi:` icons; a name without a prefix is an `mdi:` icon) |
| note | string | none | Small caption shown inside the widget |

```yaml
type: custom:houseview-action-card
entity: script.goodnight
note: Lights off, doors locked
```
