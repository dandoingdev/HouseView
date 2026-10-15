---
type: media_player
label: Music
entity: required
since: 1.0
---
# Music

A now-playing panel for a `media_player.*` entity: a large rounded album cover with the title and artist over its
lower edge, a progress bar with elapsed and remaining time, shuffle / previous / play-pause / next / repeat, a volume
pill and an options button (the dots over the cover) that opens the more-info dialog.

* Previous and next are enabled when the entity advertises the `supported_features` bits 16 and 32; the volume
  keys when it advertises bit 4; shuffle and repeat with bits 32768 and 262144. Play / pause is enabled whenever the
  speaker is available.
* Play / pause only sends `media_play_pause` while the state is `playing` or `paused`; in any other state
  (`idle`, `off`, `standby`) the button opens more-info instead.
* Each volume press calls `media_player.volume_set`, moving `volume_level` by 5 percentage points, clamped between 0
  and 1. Shuffle calls `shuffle_set`; repeat steps through off, all and one with `repeat_set`.
* The progress bar needs `media_duration` (radio streams have none and show an empty bar). It advances once a second
  while the player is `playing`.
* Artwork is shown only when `entity_picture` points to `/api/media_player_proxy/` on this Home Assistant
  (the page origin or the configured base URL). Anything else falls back to a music-note icon.
* While a speaker plays and nobody touches the screen, the [cover art](../overviews/cover_art.md) overview can take
  the whole screen (see the `music_screensaver` card option).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `media_player.*` entity |
| name | string | friendly name | Read by screen readers (the panel shows the track, not the name) |
| size | normal/wide/tall/large | normal | Widget size on carousel pages |

```yaml
type: custom:houseview-media_player-card
entity: media_player.living_room
```
