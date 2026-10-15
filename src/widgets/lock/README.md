---
type: lock
label: Lock
entity: required
since: 1.0
---
# Lock

Shows a `lock.*` entity as an icon widget with its name and state. The icon is an open padlock while the lock is
`unlocked` and a closed one otherwise. A tap locks an unlocked door and unlocks a locked one; unlocking asks
"Unlock this door?" first. While the lock is in any other state (`locking`, `unlocking`, `jammed`, `open`, ...) a tap
opens the more-info dialog instead of sending a command. An unavailable or unknown lock is shown disabled.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| entity | entity | required | A `lock.*` entity |
| name | string | friendly name | Label |
| size | normal/wide/tall/large | normal | Widget size on carousel pages |
| icon | icon | `mdi:lock` / `mdi:lock-open` | Override the icon. A name without a prefix is an `mdi:` icon |

```yaml
type: custom:houseview-lock-card
entity: lock.front_door
```
