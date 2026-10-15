# Cameras

## The camera widget

`custom:houseview-camera-card` shows a still picture from a `camera.*` entity. It asks Home Assistant for a fresh snapshot
every 30 seconds while its page is visible. Only pictures served by your own Home Assistant under `/camera_proxy/` are
loaded; anything else leaves the widget reading "Snapshot unavailable". A tap opens the entity's dialog, whose live playback
depends on the camera integration and the browser. HouseView never labels a still image as live video. See the
[camera widget page](widgets/camera.md).

## The camera grid

Add a `camera_gallery` to the carousel and pressing the camera widget opens a full-height grid of up to four cameras
instead:

```yaml
type: custom:houseview-card
camera_gallery:
  - {entity: camera.front_door, name: Front door, slot: 0}
  - {entity: camera.driveway, name: Driveway, stream: true, slot: 1}
  - {entity: camera.back_garden, name: Back garden, slot: 2}
  - {entity: camera.garage, name: Garage, slot: 3}
cards:
  - {type: custom:houseview-camera-card, entity: camera.front_door}
```

| Key | Default | Description |
| --- | --- | --- |
| `entity` | required | A `camera.*` entity. Each camera may appear once |
| `name` | friendly name | The label in the grid |
| `stream` | `false` | `true` uses the camera stream instead of a refreshing still image |
| `slot` | order in the list | 0 top left, 1 top right, 2 bottom left, 3 bottom right |

The list must contain one to four entries, otherwise the card reports `Camera view needs one to four camera entities.`
The same option works on a standalone `houseview-camera-card`.

* Tap a camera to enlarge it. **All cameras** returns to the grid, **Back** returns to the page, and Escape goes back one step.
* While open, the grid refreshes still images about every five seconds, waiting for the previous request to finish. Closing
  or changing the view releases the connections.
* A stream that fails is retried after 30 seconds. A camera that sends no picture shows "Camera not responding".
* Navigation inside the grid never calls a camera service; nothing moves or switches.
* In the visual editor, the **Camera grid** section has four slots with an entity picker, a label and a stream switch. A
  camera already used in one slot is disabled in the others, and clearing a slot keeps the others where they are.
* Address tokens come from Home Assistant at runtime and are not stored in your configuration.
* A screensaver or other overview does not start while the grid is open.

If streams do not play, use still images: whether a stream works depends on the camera integration and the browser, and some
cameras only offer snapshots.
