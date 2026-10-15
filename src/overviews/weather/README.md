---
type: weather
label: Weather overview
entity: required
domains: [weather]
since: 1.0
---

# Weather overview

A full-screen sky scene for a Home Assistant `weather.*` entity: condition, today's high and low, a large frosted
temperature, the time and up to six details. Use it as a **screensaver** over a HouseView carousel, as a **page card** (`custom:houseview-weather-overview-card`),
as a standalone card, or as a small widget that opens the full scene when pressed (see "As a widget"). Tapping the
screensaver wakes the dashboard; tapping the card opens the weather entity.

The sky is painted in CSS (gradients and soft clouds, no images, nothing is downloaded) and follows the weather state and
the time of day: sunny, partly cloudy, cloudy, fog, rain, heavy rain, thunderstorm, hail, snow, sleet, wind and
exceptional, each with a day and a night sky. Rain, snow and drifting clouds are animated with `transform` and `opacity`
only (at most three animations at once) and stand still when the device asks for reduced motion. The card's
[`performance`](../performance.md) option applies: with `lite` (chosen by `auto` on weak tablets) the scene is still, and
rain, snow, fog, hail, lightning and the sun's rays are left out.

| Option     | Type    | Default                      | Description                                                                                                                |
| ---------- | ------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| entity     | entity  | required                     | A `weather.*` entity (forecasts are subscribed, nothing is polled)                                                         |
| display    | enum    | scene                        | Card only: `scene` fills the card with the sky; `tile` is a small flat widget (condition icon, condition, `H:14° L:9°`) that opens the full scene when pressed |
| sun_entity | entity  | sun.sun                      | Used for sunset/sunrise and day or night art                                                                               |
| details    | list    | sunset, wind, humidity, rain | Up to six of sunset, wind, humidity, rain, pressure, uv, visibility, dew_point, feels_like, cloud_coverage, gust            |
| show_time  | boolean | true                         | Show the time (turn off beside a clock widget)                                                                             |
| show_unit  | boolean | false                        | Show C or F after temperatures                                                                                             |
| frosted    | boolean | true                         | Frosted translucent numerals; off for solid white                                                                          |
| daylight   | enum    | auto                         | `auto` follows the sun entity (then the weather state, then the clock); `day` or `night` forces the artwork                |

As a screensaver the framework keys apply too (`idle_timeout`, `enabled`, `preview`, `start_in_edit_mode`); on a card,
`name`, `size` and `page`.

## As a widget

Set `display: tile` on the card for a one-cell widget that looks like a compact weather summary. A tap opens the full
weather scene over the whole card, like the screensaver: the first tap on the scene only closes it again.

```yaml
type: custom:houseview-card
cards:
  - type: custom:houseview-weather-overview-card
    entity: weather.home
    display: tile
```

## What is shown

- **Condition and range**: the condition icon and name (Home Assistant's own translation when the frontend offers it),
  then `H:14° L:9°` from today's daily forecast. Without a daily forecast the extremes of today's hourly forecast are
  used; without any forecast the line is left out.
- **Time**: in the format and time zone of your Home Assistant profile, updated once a minute, on the minute.
- **Temperature**: the entity's temperature rounded to a whole number, drawn very large in frosted numerals.
- **Details**: a detail that has no data is left out, never shown blank. _Sunset_ turns into _Sunrise_ once the sun is
  down. _Rain_ reads `Now`, `In 25m`, `In 3h`, `Today`, `In 2d` or `None`, from the hourly forecast and then the daily one.
- **Unavailable**: a missing, `unavailable` or `unknown` entity shows a calm grey sky, "Weather unavailable" and the time.

## Examples

```yaml
type: custom:houseview-card
cards:
  - type: custom:houseview-clock-card
screensaver:
  type: weather
  entity: weather.home
  idle_timeout: 120
```

As a page of its own:

```yaml
type: custom:houseview-card
pages:
  - {name: Home, surface: teal, layout: auto}
  - {name: Weather, surface: glass, layout: auto}
cards:
  - {type: custom:houseview-clock-card, page: Home}
  - {type: custom:houseview-weather-overview-card, entity: weather.home, page: Weather}
```

## Notes

- Forecasts come from Home Assistant's `weather/subscribe_forecast` subscription (Home Assistant 2023.12 and newer), shared between cards
  and released shortly after the last card goes away. Older cores fall back to the `forecast` attribute.
- The overview never calls a service. It only reads the weather entity and the sun entity.
- Frosted numerals fall back to solid white with `frosted: false`, and automatically with `high_contrast`.
