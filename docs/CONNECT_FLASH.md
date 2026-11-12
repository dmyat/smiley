# Connect and Flash — SMILEY 0.1.2 beta

The two new tabs follow all eight themes in the latest uploaded source,
including the custom main colour, second colour and background settings.
They show an entry warning every time you open them. Acknowledging the warning
only opens the controls; it does not connect or start programming. Their page
titles continue to display **BETA** after acknowledgement. Existing tabs keep
their own labels and warnings.

**These additions have not been tested on a car. Live ECU flashing is locked.**
The native UI, transport and programming workflow have been exercised against
synthetic responses and an in-memory ECU. That does not establish compatibility
with a BMW gateway, DME, bootloader, firmware version, or head-unit network.

## Try the complete flow without a car

1. In Settings, turn **Demo data** on.
2. Open **Connect**, read the warning and choose **I understand — continue**.
3. Select **Connect demo**. The fictional VIN, hardware and software appear.
4. Open **Flash** and acknowledge its separate warning.
5. Select **Load demo file**, then **Simulated power**.
6. Select **Simulate flash**, review the file and ECU, then **Confirm flash**
   within 15 seconds.
7. The progress advances as the simulated ECU acknowledges transferred bytes.
   A successful sequence ends at **Simulation complete**, then disconnects.

Demo has no network connection and cannot write its fictional calibration to
a real transport. A real connection cannot be selected by a demo profile.
Changing Demo mode invalidates connection and file selection. During a flash,
source-changing settings and navigation away from Flash are locked; theme
and custom-colour changes remain available. A failed operation is never automatically retried.

## What the real connection currently does

Connect is an outbound **DoIP (ISO 13400)** client. It is not a phone hotspot
bridge, MHD integration, BMW HSFZ/ENET implementation, or ECU unlocker. Connecting
a phone to the car's Wi-Fi does not by itself provide a DME programming route.
No firewall, network routing, SSH or root settings are changed by these tabs.

The endpoint must be independently established for the actual vehicle. This
build does not guess an IP address, tester address, ECU logical address or
routing activation type. The gateway's own logical address is not substituted
for the target ECU's address. No connection is made at app start.

For an explicitly configured DoIP endpoint, **Connect ECU** first returns any
exhaust control held by SMILEY to stock, waits for its diagnostics to finish,
then pauses those diagnostics. It activates routing and reads VIN (F190),
hardware (F191) and software (F194). All three must return valid, matching
service/DID responses; unsupported identifiers are reported as failure rather
than an identified ECU. These standard identifiers may not be supported by
every DME. This behavior needs vehicle validation.

After disconnecting, use **Resume diagnostics** on Connect to resume SMILEY.
Disconnecting does not automatically restart polling. Other diagnostic or
tuning apps are outside SMILEY's control and must not run concurrently.

## Connection and calibration files

Files belong in the **installed SMILEY app's data directory**, inside a `flash`
subfolder. They do not belong in the source repository or the Phone dashboard.
The runtime selects the installed app's `data` directory; the exact installation
path depends on the Store. Do not assume another app's data folder is SMILEY's.

`flash/connect.json` has the following shape. Placeholders are intentionally
invalid. They must be replaced with verified values; this is not a runnable
vehicle configuration.

```json
{
  "protocol": "doip",
  "host": "REQUIRED_GATEWAY_IPV4",
  "port": 13400,
  "testerAddress": null,
  "ecuAddress": null,
  "activationType": null
}
```

`flash/profile.json` describes the exact calibration file and expected ECU.
Again, this example is intentionally invalid. Addresses are JSON integers;
identity fields are the exact payload bytes from the DID responses, encoded as
even-length hex without spaces. VIN must contain exactly 17 bytes.

```json
{
  "schema": 1,
  "provider": "required-reviewed-ecu-adapter",
  "label": "My calibration",
  "ecuAddress": null,
  "expected": {
    "vinHex": "REQUIRED",
    "hardwareHex": "REQUIRED",
    "softwareHex": "REQUIRED"
  },
  "image": {
    "file": "my-calibration.bin",
    "bytes": null,
    "sha256": "REQUIRED_64_HEX_CHARACTERS"
  }
}
```

The binary must be a regular file directly inside the same `flash` folder,
between 1 byte and 16 MiB. Paths containing traversal and symbolic-link files
are rejected. Loading checks the byte count and SHA-256 before retaining a
copy in memory. Hash matching establishes file integrity, **not** engine safety,
ECU checksum correctness, signature validity, tune compatibility or unlock state.
No calibration or production programming profile is bundled.

## What still needs implementing for your DME

`apps/smiley/flash-profiles.js` deliberately exports an empty, frozen registry.
JSON cannot turn a profile into a verified programming adapter. Copying BeeM's
generic parameters or adding `"verified": true` does not enable live flashing.

A qualified ECU-specific integration must supply and validate:

- The actual transport and programming target for the vehicle.
- Firmware/bootloader-specific memory region, exact image layout, checksums
  and signatures. Generic CRC or a matching file hash is insufficient.
- The legitimate programming access procedure for the already-supported ECU.
  No security keys, bypass or unlock implementation is included.
- Preconditions read from the ECU with validated scaling: Park, zero speed,
  zero engine RPM, ignition on and supply voltage in the supported range.
- Programming session, erase/verify routines, expected result bytes, transfer
  limits, reset behavior and post-reset identity/read-back verification.
- Timing and recovery behavior measured on an appropriate bench before testing
  the vehicle.

The adapter contract used by `flash-engine.js` is `validateImage(data, profile)`,
`plan(data, profile)`, `readConditions(send)`, `authorize(send, profile)`, and
`afterReset(context, bundle)`. Real adapters must explicitly have
`liveValidated: true` in reviewed source; this is a development prerequisite,
not a substitute for the validation itself. The generic engine currently
supports an uncompressed, single contiguous calibration download with four-byte
address/length fields and no TransferData/TransferExit vendor parameters.
Different ECU requirements need implementation changes, not guessed profile
values. The fictional demo adapter is separate from the real registry.

## Failure behavior

DoIP requests are serialized. Connection and response waits are bounded.
Malformed, mismatched or timed-out responses close the connection. UDS
`responsePending` extends a bounded wait **without resending the request**.
TransferData requires the exact acknowledged block counter. Verification must
return the expected routine and result; a positive service byte alone is not
treated as success. Reset rejection and failed post-reset verification remain
failures, never a successful flash.

The real workflow writes and synchronizes an incomplete run record at
`flash/last-run.json` before entering programming, then updates it at each
phase. An incomplete or unreadable record prevents subsequent real connections
and prevents normal diagnostics from restarting. Simulation does not modify
this record. There is no in-app bypass or automatic retry. Recovery must be
established with the ECU-specific programming tool/procedure; deleting the
record is not a recovery procedure.

## Validation of this build

```sh
python3 kit/tools/build.py --preview-only smiley
node tests/test-connect-flash.js
node tests/test-native-flash.js docs/screenshots/connect-flash
node tests/test-merged-themes.js docs/screenshots/connect-flash
node tests/test-native-connect.js
node tests/test-native-connect.js --recovery
node tests/test-smiley.js
node tests/test-native-flow.js
node tests/test-edit-gauges.js
```

- 28 new transport, file, programming and workspace test cases passed.
- Native Connect/Flash UI flow passed in both themes, including beta entry
  warnings, blocked controls, confirmation expiration/navigation, settings
  lock, progress and completion. It sent no real vehicle commands.
- The latest-source merge also passed a native flow across all eight theme
  choices. Custom main, secondary and background colours reach the beta pages
  and remain editable during simulated programming; changing the diagnostic
  source remains blocked during programming.
- Compared with the uploaded `smiley-MAIN.zip`, all original files are present.
  The logo, app icon, theme definitions, settings options, runtime and existing
  diagnostic modules were preserved. Only the original README, app description,
  main entry point and UI file needed edits; the beta modules, tests and their
  documentation were added alongside them. Version remains 0.1.2.
- 44 existing SMILEY integration checks and the native control/gauge-editor
  flows passed with synthetic vehicle data.
- The unchanged Phone Access helper's separate test could not complete in
  the earlier local run: interface enumeration was denied (`uv_interface_addresses`).
  That helper was not modified or vehicle-tested here.
- The preview build contains no BMW SDK and is not an installable binary.
  This delivery is a Store source repository, retaining the original build
  metadata. Installation and on-car operation remain untested for this version.

## Source reference

BeeM-Flash was reviewed at commit
[`56942783478ee85f419d60ba2e7ce6395813c549`](https://github.com/waliworld/BeeM-Flash/tree/56942783478ee85f419d60ba2e7ce6395813c549).
Its Connect/Flash architecture informed these additions. The new modules
implement stricter request correlation, file checks, acknowledgement checks
and explicit unsupported-ECU blocking. No BeeM map controls, logging, DTC tools,
checksum preset or other pages were imported. The original SMILEY UI and its
existing features remain the base. The BeeM MIT notice is retained in
`docs/licenses/BeeM-Flash-MIT.txt`; existing source and font notices remain.
