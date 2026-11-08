# Line disruption alerts

Choose **Line disruption sensor** in the HouseView card editor to connect a London Underground line-status sensor.
An optional **Line alert name** gives it a short label; otherwise HouseView uses the sensor's friendly name.
Clear the sensor to disable the feature. Each dashboard may choose its own sensor.

The alert appears only for a recognised disruption reported by the sensor. Delays and reduced service use amber;
closures, suspensions, severe delays and no service use coral. Good Service, No Issues, Information, unknown,
unavailable, missing sensors and disconnected data show no chip. The description alone never triggers an alert.
States follow the [Home Assistant London Underground integration](https://www.home-assistant.io/integrations/london_underground/).
Other sensors must use the same status vocabulary. No additional network requests or polling are made.

Below 700px the alert sits in the header alongside playback. Below 480px it has a separate toolbar row to retain
room for the clock, house mode and playback. At 700px and wider it sits beside Dim in the footer. If the footer's
controls would overlap page navigation, the navigation gets its own row. All controls retain their full touch targets.
Tap the alert for Home Assistant's sensor details, including its `Description` attribute. Opening details never runs
an action. Live status updates preserve the button and focus; when the disruption clears, the chip disappears.

```yaml
type: custom:houseview-card
line_alert_entity: sensor.example_line_status
line_alert_name: City line
cards:
  - type: custom:houseview-clock-card
```
