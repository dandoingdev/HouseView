---
type: photo_frame
label: Photo frame
entity: none
domains: []
since: 1.0
---

# Photo frame

Photos from a folder in Home Assistant media. As a **screensaver** it is a full-screen black frame with the photo in a
big rounded square and the time and date bottom right. As a **card** (`custom:houseview-photo-frame-overview-card`)
the photo fills the card with a thin light rim, and a tap opens the full-screen view; a tap on that returns. The card
and the screensaver change photo at the same pace. It needs no entity.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| folder | text | none | `media-source://media_source/local/Photos`, `/media/Photos`, `local/Photos` or just `Photos` |
| interval | number | 60 | Seconds between photos (5 to 86400). 60 is a minute, 3600 an hour |
| shuffle | boolean | true | A fixed shuffled order per folder (every device and the card agree). Off sorts by file name |
| recursive | boolean | false | Also use photos in sub-folders (three levels) |
| show_time | boolean | true | Screensaver only: the time and date |

```yaml
type: custom:houseview-card
cards:
  - type: custom:houseview-photo-frame-overview-card
    folder: media-source://media_source/local/Photos
    interval: 300
screensaver:
  type: photo_frame
  folder: media-source://media_source/local/Photos
  interval: 30
  idle_timeout: 120
```

## Notes

* Put the photos in a folder that Home Assistant's media source offers (`/media` or the local media folder).
* The folder is read through Home Assistant's own websocket (`media_source/browse_media` and
  `media_source/resolve_media`); nothing is polled. A listing is cached for 15 minutes and holds at most 2000 photos.
  Only images served by Home Assistant itself are loaded.
* Which photo is on show is decided by the clock, so the card and the screensaver show the same one and nothing drifts.
* Put resized photos (about 1600 px wide) in the folder: a phone original is several megabytes to decode on a weak
  tablet. Not every browser can show every format; use JPEG, PNG or WebP.
* The folder is typed once as text, because Home Assistant's folder picker cannot choose a folder.
