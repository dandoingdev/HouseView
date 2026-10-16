---
type: clock
label: Clock
entity: none
domains: []
since: 1.3
---

# Clock

A full-screen clock for a wall panel or tablet, with two analogue and two digital faces. **Bold numerals** places a large 12, 3, 6 and 9 behind
rounded hands. **Sculpted numerals** uses a full ring of subtly embossed numbers and shaded hands.
**Digital · Classic** shows a large horizontal time with smaller seconds and an AM/PM indicator when needed.
**Digital · Stacked** places oversized hours above minutes for an easy-to-read square-panel face.
The background fills the screen and the square dial stays centred when the display is wider or taller.

Choose Clock in the dashboard's screensaver settings. Set the face, background colour, seconds colour and
whether to show seconds and the date. The clock follows the dashboard background colour by default. Turn off
**Use dashboard background** to select an override; turning it back on keeps your custom colour for later.
Both colour controls use Home Assistant’s standard picker. Existing three- or six-digit hex colours remain
supported in YAML alongside RGB triplets. Numerals, hands and digital time adapt
to the background brightness. No Home Assistant entity or extra integration is needed.

All faces use Home Assistant's time-zone preference, including daylight-saving changes; the weekday and date
use its language. Digital faces follow its 12/24-hour preference, including localised digits and the AM/PM period. Updates reuse the existing hands or digit elements through the shared ticker, once per second. Hiding
seconds keeps the minute and hour hands still between minutes. A tap or Escape wakes the dashboard.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| face | enum | bold | `bold`, `sculpted`, `digital` or `digital_stacked` |
| use_dashboard_background | boolean | Automatic | Use the dashboard surface base colour; existing custom colours remain overrides |
| background_color | colour | Dashboard colour | Optional custom colour, selected with Home Assistant’s colour picker; RGB triplets and existing hex YAML accepted |
| second_color | colour | #b9edc7 | Seconds colour; analogue centre colour |
| show_seconds | boolean | true | Show the analogue seconds hand or digital seconds |
| show_date | boolean | true | Show the local weekday and day |

```yaml
screensaver:
  type: clock
  idle_timeout: 60
  face: bold
  background_color: '#3b925f'
```

For a blush sculpted face:

```yaml
screensaver:
  type: clock
  idle_timeout: 60
  face: sculpted
  background_color: '#e0bcb9'
  second_color: '#ee4eb9'
  show_date: false
```

It can also be used as `custom:houseview-clock-overview-card`; tapping that card opens the clock full-screen.

For a digital face, set `face: digital` or `face: digital_stacked` in the same configuration. Both appear in the visual editor’s **Clock face** list alongside the analogue faces. Background, seconds colour, date and seconds visibility apply to all four styles. Existing clock configurations keep their selected analogue face.
