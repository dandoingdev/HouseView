---
type: calendar_month
label: Month calendar
entity: none
domains: []
since: 1.0
---

# Month calendar

The current month on a light face: the month and year top left, the time top right, the weekdays in blue and the days of
the month in a six-row grid, with today in a blue circle and a very large translucent day number laid over the grid. It
needs no entity.

* **Opened by pressing a widget.** A tap on a **clock**, **date** or **calendar** widget opens it full screen; a tap on
  it returns. Set `calendar_view: false` on the carousel card to turn this off.
* **As a screensaver** (`type: calendar_month`): it starts after `idle_timeout` seconds without a touch, like any idle
  overview.
* **As a card**: `custom:houseview-calendar-month-overview-card`. A tap on the card does nothing.

The options of an explicit `screensaver` entry with `type: calendar_month` also apply when the month calendar is opened
from a widget.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| week_start | enum | auto | `auto` (the first weekday of your Home Assistant profile, else Monday), `monday`, `sunday`, `saturday` |
| show_time | boolean | true | Show the time, top right (screensaver view) |

```yaml
type: custom:houseview-card
cards:
  - type: custom:houseview-clock-card
  - type: custom:houseview-date-card
screensaver:
  type: calendar_month
  idle_timeout: 120
  week_start: monday
```

## Notes

* The month rolls over at midnight without a reload.
* It is painted with CSS only and calls no service.
