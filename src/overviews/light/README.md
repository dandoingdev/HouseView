---
type: light
label: Light view
entity: required
domains: [light]
since: 1.1
---

# Light view

Press a light widget’s icon to open its full-screen brightness control. The entire view shows the brightness
with an edge-to-edge flat yellow fill on pale grey-blue. A bold percentage and the widget’s icon sit in the centre. Coloured light modes use the entity's RGB colour. White and colour-temperature modes, including near-white RGB updates after dimming, keep the app's active-light yellow so the fill stays visible.
The name, icon and percentage follow the entity. Close with the close key or Escape; the power key toggles the light
and the settings key opens Home Assistant's more-info dialog.

Drag anywhere on the control: the fill boundary follows the finger vertically and the percentage updates immediately.
The brightness is committed on release through the widget's ordinary service action, with no writes during movement.
A cancelled pointer gesture restores the starting value. The native range is also keyboard and screen-reader accessible:
arrow keys adjust by one percent; Home and End select zero and full brightness. Changes made while a brightness call
is pending retain the latest value and send it after that call completes.

Off lights show zero and can be dragged on. Zero calls `light.turn_off`; positive values call `light.turn_on` with
`brightness_pct`. Unavailable, unknown and missing entities cannot be dimmed. Lights that only support on/off keep
the power and settings keys but disable the slider. The rest of the light tile toggles on/off. Explicit `action: toggle` and `action: off` on a widget preserve
those direct actions, along with configured Home Assistant tap/hold/double-tap actions.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `light.*` entity |
| name | text | friendly name | Light name |
| icon | icon | entity icon or lightbulb-outline | Light icon |

```yaml
type: custom:houseview-light-overview-card
entity: light.living_room
```

The same view can be placed on a carousel or used as a standalone card. Its fill has no animation so the boundary
stays under the pointer, including with reduced motion and on low-performance devices.
