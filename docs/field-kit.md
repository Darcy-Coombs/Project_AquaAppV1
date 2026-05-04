# Aqua Field Kit

The field kit is a separate phone-ready browser app in:

```text
packages/field-web/
```

It is meant for real-world trial runs with several phones.

## What It Does

- creates one Aqua account per phone
- encrypts the private key with the local passphrase
- creates signed protocol-compatible events in the browser
- stores events locally on the phone
- pushes pending events to a reachable Aqua node
- pulls events from a reachable Aqua node
- exports and imports event bundles for nearby handoff
- supports transfers, proposals, votes, proxy votes, outcome publishing, Chaos Chat rooms/messages, DEX quotes, escrow, witness verification, and release

## Desktop Trial

Run:

```powershell
npm.cmd run dev:field
```

Open:

```text
http://localhost:5180
```

Start a node too:

```powershell
npm.cmd run dev:node -- --port 7001
```

## Phone Trial

For a phone to sync over the internet, the phone must reach both:

- the field app
- the Aqua node API

The cleanest first field setup is an HTTPS tunnel or hosted HTTPS static folder for the app, plus an HTTPS-reachable node URL. In the app, set the node URL in the Sync tab.

If you are on the same Wi-Fi, you can try a computer LAN IP, but mobile browser crypto and install behavior are more reliable in secure contexts such as HTTPS.

## Package Folder

Run:

```powershell
npm.cmd run pack:field
```

The copyable package is written to:

```text
dist/aqua-field-kit/
```

A zip copy is also available at:

```text
dist/aqua-field-kit.zip
```

## Nearby / Bluetooth Reality

The app supports bundle export/import for nearby testing. Share the exported JSON file with another phone, then import it in the Sync tab.

Browser Bluetooth is not a general phone-to-phone transport. Web Bluetooth is an experimental BLE device API and has limited browser support, so the field kit only checks whether the browser exposes the API. Use network sync or file/QR style bundle handoff for the first field tests.
