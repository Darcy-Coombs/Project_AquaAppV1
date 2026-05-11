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
- links phone-created events to recent local parents
- verifies imported events before storing them
- stores events locally on the phone
- pushes pending events to a reachable Aqua node
- pulls events from a reachable Aqua node
- exports and imports event bundles for nearby handoff
- supports transfers, proposals, votes, proxy votes, outcome publishing, Chaos Chat rooms/messages, DEX quotes, escrow, witness verification, and release

## Desktop Trial

Run:

```powershell
Start Aqua Field.bat
```

Open:

```text
http://localhost:5180
```

This starts both:

```text
http://localhost:7001  node/API
http://localhost:5180  field app
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

## Trusted Field Machine Package

For a package that includes the working node, protocol modules, field app, docs, launchers, and packaging scripts, run:

```powershell
npm.cmd run pack:field-machine
```

The full package is written to:

```text
dist/aqua-trusted-field-machine/
```

It is intended for a laptop or small field computer that acts as the trusted test node while phones connect to it.

## Import Validation

The phone app rejects imported or pulled events if they fail:

- protocol and module version checks
- known module/type checks
- canonical event hash check
- Ed25519 signature verification
- parent reference checks
- schema checks
- verified-user checks for governance and chat
- spend/escrow checks that would create impossible balances

## Nearby / Bluetooth Reality

The app supports bundle export/import for nearby testing. Share the exported JSON file with another phone, then import it in the Sync tab.

Browser Bluetooth is not a general phone-to-phone transport. Web Bluetooth is an experimental BLE device API and has limited browser support, so the field kit only checks whether the browser exposes the API. Use network sync or file/QR style bundle handoff for the first field tests.
