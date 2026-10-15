---
type: calendar
label: Calendar
entity: required
since: 1.0
---
# Calendar

Shows today's weekday, month and day number together with the next event of a `calendar.*` entity: its title and a
short date, plus the time unless the event lasts all day. The event time follows the Home Assistant language; the
month and weekday names follow the browser, like the date widget. Without an event the widget reads "No upcoming
event"; without a usable start time it hints at connecting a calendar. An unavailable calendar is shown disabled.

A tap opens the full-screen [month calendar](../overviews/calendar_month.md). With `calendar_view: false` on the card
a tap opens the more-info dialog of the calendar instead. The widget never calls a service.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `calendar.*` entity |
| name | string | friendly name | Not displayed (kept for the editor and accessibility) |
| size | normal/wide/tall/large | normal | Widget size on carousel pages |

```yaml
type: custom:houseview-calendar-card
entity: calendar.family
```
