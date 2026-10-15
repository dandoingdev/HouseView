# Security policy

## Supported versions

Security fixes go into the latest release. Please update before reporting a problem you found in an older version.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately:

* Use GitHub's private vulnerability reporting: the **Security** tab of the repository, then **Report a vulnerability**
  (<https://github.com/dandoingdev/HouseView/security/advisories/new>), or
* write to [@dandoingdev](https://github.com/dandoingdev) on GitHub, by direct message.

Include the HouseView version, your Home Assistant version and browser, what you did, what you expected and what happened, and
a minimal card configuration with placeholder entity ids. Do not send real tokens, addresses or camera images.

You can expect an acknowledgement within a few days, a fix or a decision as soon as it can be made, and credit in the release
notes if you want it.

## What is in scope

HouseView is a browser-side plugin for the Home Assistant frontend. Examples of reports that matter:

* A way for entity data (a name, a state, an attribute, a URL) to run script or inject markup in the dashboard.
* A way to make HouseView load a picture, script or other resource from an address other than your Home Assistant.
* A way for an overview to call a service or change state.
* A `tap_action` that opens or runs something the configuration did not ask for.
* The release files not matching the published checksum.

Out of scope: vulnerabilities in Home Assistant itself, in HACS, in a camera or media integration, or in a browser; and
behaviour you configured yourself, such as a `tap_action` that calls a service.

## How HouseView limits its reach

* It makes no network requests of its own. It talks to Home Assistant through the frontend's `hass` object and websocket.
* Camera snapshots, album art and photos are loaded only from the page's own origin or Home Assistant's configured base URL,
  and, for cameras and album art, only from Home Assistant's proxy paths.
* Text from entities is escaped before it is put into the page.
* Overviews are read-only: their context has no service call.
* The `url` action opens only `http`, `https`, `mailto` and `tel` links.
* Services are called only when you press a control or configure a `tap_action` that does.

Keep in mind that files in `/config/www` are served without authentication: put only `houseview.js` there, and nothing private.
