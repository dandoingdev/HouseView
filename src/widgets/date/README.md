---
type: date
label: Date
entity: none
since: 1.0
---
# Date

Shows today's date as a flat face: the short weekday and month on one line above a very large day number. It needs
no entity and is always available. The text follows the browser's locale and time zone. The widget is drawn when the
card renders, so it changes day with the next render.

A tap opens the full-screen [month calendar](../overviews/calendar_month.md). Set `calendar_view: false` on the card
to turn that off.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| size | normal/wide/tall/large | normal | Widget size on carousel pages |

The widget shows no name, so the editor does not offer one.

```yaml
type: custom:houseview-date-card
```
