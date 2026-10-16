---
type: volume
label: Volume view
entity: required
domains: [media_player]
since: 1.3
---

# Volume view

Press the volume button on a music widget to open a full-screen speaker volume control. Drag up or down across
the view, just like the light dimmer. The fill and percentage follow immediately; release sends one
`media_player.volume_set` command with the final level. Zero sets silent volume and does not stop playback.
A cancelled drag restores the starting value without changing the speaker.

Close with X or Escape. Keyboard users can use the native range's arrows, Home and End. The view follows Home
Assistant updates while preserving an in-progress gesture. Speakers without volume support and unavailable
speakers cannot adjust volume. Mute/unmute is offered only when the speaker supports it; speaker settings are
available from the top-right button. No playback action runs when opening the view.

The control works from music widgets in dashboards and standalone cards. It uses the same gesture and queued
value-action handling as brightness. No dashboard configuration change is required.
