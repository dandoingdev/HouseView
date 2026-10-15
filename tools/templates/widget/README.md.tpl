---
type: {{type}}
label: {{Label}}
entity: required
since: 1.0
---
# {{Label}}

Describe what the widget does, which entity states and attributes it reads, and what a tap does.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `{{firstDomain}}.*` entity |
| name | string | friendly name | Label |
| size | normal/wide/tall/large | normal | Tile size on carousel pages |
| icon | icon | widget default | Override the icon |

```yaml
type: custom:houseview-{{type}}-card
entity: {{firstDomain}}.example
```
