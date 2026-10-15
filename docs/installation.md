# Installation

HouseView is a Home Assistant dashboard plugin: one JavaScript file that you register as a dashboard resource. It needs
Home Assistant 2024.8.0 or newer and a browser based on Chrome 105 or later (this includes the Home Assistant companion app
and the Android WebView on wall tablets). There is nothing to install on the server side and no integration to configure.

## Install with HACS

1. In HACS open the three-dot menu, choose **Custom repositories**, paste the repository address
   `https://github.com/dandoingdev/HouseView` and pick the category
   **Dashboard** (older HACS versions call it "Lovelace" or "Plugin"). Press **Add**.
2. Find **HouseView** in HACS, open it and press **Download**. Pick the newest release.
3. HACS normally registers the resource for you. Check it under **Settings > Dashboards > three-dot menu > Resources**:
   there should be an entry like `/hacsfiles/<repository name>/houseview.js` of type **JavaScript module**. If it is missing, add it
   yourself with that URL.
4. Reload the browser page (a hard refresh, or restart the companion app) so that it loads the new resource.

HACS keeps the file up to date: when a new release appears it offers an update, and you reload the browser after installing it.

## Install manually

1. Download `houseview.js` from the [latest release](https://github.com/dandoingdev/HouseView/releases/latest). Each release also
   contains `houseview.js.map` (a debugging aid) and `houseview.js.sha256` (a checksum you can compare with
   `shasum -a 256 houseview.js`).
2. Copy `houseview.js` to the `www` folder of your Home Assistant configuration, in a folder of its own:
   `/config/www/houseview/houseview.js`. If the `www` folder did not exist before, restart Home Assistant once so that
   `/local/` starts serving it.
3. Open **Settings > Dashboards > three-dot menu > Resources > Add resource**. Use the URL
   `/local/houseview/houseview.js`, resource type **JavaScript module**. (The Resources page is only visible when
   **Advanced mode** is on in your user profile.)
4. Hard-refresh the browser.

Files in `www` are served to anyone who can reach your Home Assistant without logging in, so put nothing private there.

### Caching

Browsers, the companion app and kiosk browsers keep the old file. When you replace the file with a newer version:

* Append a version to the resource URL (`/local/houseview/houseview.js?v=1.0.0`) and change it on every update. Edit the
  resource under **Settings > Dashboards > Resources**.
* Hard-refresh the browser (Ctrl+Shift+R, or Cmd+Shift+R on a Mac).
* In the Home Assistant companion app use its troubleshooting option to reset the frontend cache; in a kiosk browser such as
  Fully Kiosk Browser clear the web cache.

A HACS update changes the file but not the URL, so a wall tablet may need the same cache reset after an update.

## Check that it works

Open a dashboard, press **Edit dashboard > Add card** and search for "HouseView". You should see a list of cards such as
"HouseView · Light" and "HouseView · Weather overview". If the list is empty, see [Troubleshooting](#troubleshooting). The
browser console prints a `HOUSEVIEW v<version>` banner when the plugin loads.

## Add your first carousel

HouseView's carousel is designed to fill the whole screen, so put it in a **panel view** (a view that holds exactly one card
and gives it the full width). Create a new dashboard or view, set its type to **Panel (1 card)**, open the **Raw
configuration editor** and paste an example from the [examples folder](../examples/), for instance
[`minimal.yaml`](../examples/minimal.yaml). Replace the entity ids with your own, save, and swipe or press the dots to move
between pages. The visual editor on the carousel card can then add pages, set their background and add widgets.

```yaml
title: Home
views:
  - title: Home
    path: home
    type: panel
    cards:
      - type: custom:houseview-card
        cards:
          - type: custom:houseview-clock-card
          - type: custom:houseview-light-card
            entity: light.living_room
```

Single widgets also work as ordinary dashboard cards in any view type: see
[`single-cards.yaml`](../examples/single-cards.yaml) and the [widget list](widgets/index.md).

## Wall tablets and kiosk mode

Add `?tablet=1` to the dashboard address and HouseView hides Home Assistant's sidebar and header, so the carousel uses the
whole screen:

```
http://homeassistant.example:8123/dashboard-wall/home?tablet=1
```

Remove the parameter and everything returns. `tablet_mode: true` on the card does the same without the parameter. This
reaches into Home Assistant internals that are not a public API, so it can stop working after a Home Assistant update; the
[tablet page](tablet.md) has kiosk alternatives, orientation, dimming and sound. See also
[`tablet-kiosk.yaml`](../examples/tablet-kiosk.yaml).

## Optional: the HouseView theme

The repository contains `themes/houseview.yaml`, a Home Assistant theme with the same muted palette as the cards. It is
optional; the cards look the same without it. To use it, copy the file to `/config/themes/houseview.yaml`, make sure your
configuration loads a themes folder, and reload themes:

```yaml
# configuration.yaml
frontend:
  themes: !include_dir_merge_named themes
```

Then choose **HouseView** in your user profile. Merge the `frontend:` lines into your existing `frontend:` block instead of
adding a second one. See [theming](theming.md).

## Update

* **HACS:** update from the HACS page, then reload the browser (and reset the cache on wall tablets).
* **Manual:** replace `houseview.js`, change the `?v=` of the resource URL, hard-refresh.

Loading the plugin twice (for example once from HACS and once from `/local/`) does not break anything, but it is wasteful;
keep one resource.

## Uninstall

Remove the resource from **Settings > Dashboards > Resources** and delete `houseview.js` (or remove the repository in HACS).
Cards that use `custom:houseview-*` types will then show "Custom element doesn't exist" until you remove them.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| "Custom element doesn't exist: houseview-card" | The resource is missing, has the wrong URL, or is not of type **JavaScript module**. Open the resource URL in a browser tab: it should show JavaScript, not a 404 page. Then hard-refresh |
| The card appears but looks unstyled or old | The browser cached an older file. Change the `?v=` on the resource URL and hard-refresh |
| The carousel is too tall or is cut off | Use a panel view. In other view types the card cannot know how much room it has |
| HouseView does not appear in the card picker | The resource did not load. Look at the browser console (F12) for errors |
| A page shows fewer widgets than expected | Widgets that do not fit a page flow onto numbered pages ("Home · 2"). See [configuration](configuration.md#pages) |
| Tablet mode does nothing | Add `?tablet=1` to the dashboard address. See [tablet mode](tablet.md) |
| The wall tablet is slow | See [performance](performance.md) |

Please report anything else with the HouseView version (printed in the browser console when the plugin loads), your Home
Assistant version and the card YAML with entity ids anonymised.
