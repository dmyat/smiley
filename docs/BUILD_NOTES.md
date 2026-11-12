# SMILEY 0.1.2 build notes

How this build was put together, what was checked, and what is still open. The front page of
the repository is [README.md](../README.md).

A native BMW MGU iDrive 7 app with a black and champagne-gold theme. Built for the requested
2021 M340i project, using the open-source idrive7-apps runtime and diagnostic code.
This is an implementation and offline review build, **not a vehicle-validated release**.

## Included

| Tab | Current implementation | Practical limit |
| --- | --- | --- |
| Live Stats | Two gauge pages. Engine 1: RPM, boost, oil/coolant/intake temperatures, fuel trims, rail pressure. Engine 2: ignition timing, lambda, low-pressure fuel, oil pressure, boost target, engine load, torque, misfires per cylinder. Every gauge keeps its lowest and highest value until Reset peaks | Channels depend on the DME. Each one tries the upstream apps' identifiers in order and shows dashes when the engine unit answers none of them. Bank 2 may not exist on an inline-six. |
| Tune | MHD / bootmod3 selector, map slots 1–4, exhaust Open / Closed / OEM | Compatible multimap tune must already be installed. Unsupported BM3 ROMs cannot switch maps. Exhaust control ships disabled. |
| Faults | Engine: read and clear the DME's fault memory. Whole car: scan every control unit at once, with unit names, and clear the units that have faults. Saved scan, rescan after clearing | Clearing needs a scan under a minute old, the selector in P, a live speed under 1 km/h and a second press. No diagnostic session is changed, so a unit that refuses in its default session is named and left alone. Most fault descriptions are not included; the BMW code is shown. |
| AWD / 2WD | Switches xDrive off (rear-wheel drive) and shows the mode, the checks before switching and the front-axle torque. The upstream xDrive module, unchanged | **Experimental, ships disabled** (Settings, xDrive control). One write to the DSC after a second press, only with the car stationary in P; on most DSC variants the engine must be off with the ignition on. AWD returns when the ignition is switched off and on; an AWD button appears only on the DSC variant where that was measured. Measured by others on a G22 M440i, a G42 230i and a G01 X3 M40i, not on a G20 M340i. The DSC stores a fault entry while xDrive is off; ABS and stability control behaviour in 2WD was not measured. If the DSC asks for it, the module opens the extended diagnostic session for the one write. |
| Perf | Drag timer (0-60, 60-130, quarter mile, bests), G-meter with peaks, virtual dyno (power and torque from a pull in one gear), brake test (60-0 and 100-0) | Read-only. Listens while SMILEY is open. The dyno is an estimate from weight, drag and an assumed drivetrain loss set in Settings. Closed roads only. |
| Phone | Temporary local web dashboard with QR pairing; pause SMILEY diagnostics. The page uses the temperature and pressure units chosen in Settings | HTTP on the actual private Wi-Fi interface, port 8765. **Expect the page to be unreachable on the car as shipped:** the head unit's firewall drops incoming connections it has no rule for (the MGU Store's own phone page adds a rule as root for its port), and SMILEY runs as an ordinary app that cannot add one. No firewall rules are changed. |
| Headlights | Alternate / Together pattern previews with Stop preview | **Screen preview only. No exterior light commands are included.** Verified vehicle output mapping is still needed. |

**ECU flashing over the built-in hotspot is not implemented.** The phone tab does not
emulate an MHD adapter or claim a flasher connection. The licensed MHD / bootmod3 app
would still perform an actual flash; a proven phone-to-vehicle diagnostic bridge is
needed first. Joining the hotspot or seeing this web dashboard does not establish
that a flash will work. Pausing SMILEY stops only SMILEY's diagnostic traffic.

No cluster or HUD modifications are included. Other apps shown in the reference
clips were treated as design examples, not additional requirements.

## What changed while this build was put together

- **Bugs fixed from the first draft**: exhaust commands could be dropped while another request
  ran; fault clearing could never pass its Park check on a car standing still; steady gauge
  values went blank; demo mode left the exhaust flap held.
- **Added from the upstream idrive7-apps apps**: more live channels with min / max, whole-car
  fault scan and clear, drag timer, G-meter, virtual dyno, brake test, and the AWD / 2WD switch
  (`apps/smiley/xdrive.js` is the upstream file, byte for byte).
- **Removed**: the Logs and Shift tabs.
- **Look**: black and champagne gold, rounded-rectangle buttons, pixel icons on the page titles, the Inter
  typeface (free, SIL Open Font License; BMW's own typeface is not free to ship), plain wording,
  a logo drawn from the owner's car, and the maker's mark at the bottom left of every page.
- **Speed**: the screen redraws at the display's rate (60 a second with the GPU renderer) and
  the dials glide between readings. Each dial's bar changes colour as it climbs (champagne,
  gold, amber, red) and its tick marks are short and white. The gauges on the page in view are read from the engine
  computer as fast as it answers, one request at a time; the others about once a second.
- **Dials that fit the car**: no gauge has a fixed scale. Each dial runs from the lowest to the
  highest value this car has actually reached, with a little room (kept between drives in
  `data/ranges.json`, cleared by Reset min / max). A typical scale is shown until the car has been
  read, and a dial never shrinks below a sensible size.
- **Dyno graph**: after every pull, power and torque against engine speed with each peak marked and
  named, and the pull before it drawn faintly behind to compare.
- **G-meter**: a web of lines with a glow, the car's dot, and a white outline that follows the dot
  out and shrinks back about a second and a half after the dot has moved away. The most forward,
  braking, left and right g stay around it until Reset.
- **Tabs**: Live Stats, AWD / 2WD, Perf, Tune (maps, exhaust and the flashing note with Pause),
  Phone, Headlights, Faults.
- **Editable gauge pages**: press and hold a gauge (or tap Edit gauges), then tap another gauge to
  swap them, or Change to bring in a different gauge. The layout is kept in `data/gauges.json`.
- SMILEY opens each vehicle interface once and feeds every tab from it.
- **Checked for the head unit's Node 8**: every file the app ships parses as the JavaScript that
  Node 8.16 understands and uses no newer library calls. Requests to the engine computer are paced
  at least 25 ms apart.
- **Lighter frames**: only the page on screen is worked out; the gauge cards and the QR code are
  drawn once and kept by the renderer; frames never overlap. Measured on a desktop, the Live
  Stats page went from 16.5 KB to 10.7 KB sent per frame and the Phone page from 29.3 KB to 15.7 KB.

## First time on the car

Nothing in this build has run on a vehicle. Check it in this order, parked, before trusting it:

1. **Install and open.** The tile appears and the Live Stats tab draws. If the app is refused at
   install, the installer's message names the vehicle signal this head unit lacks.
2. **Engine 1, engine idling.** RPM, coolant and oil temperature should match the cluster. Note
   which gauges stay on dashes; those identifiers are not answered by this DME.
3. **Engine 2.** Same check. Lambda near 1.00 at warm idle, oil pressure plausible, timing moving.
4. **Faults, Engine, Read DME.** Read only. Compare with a scan from the MHD or bootmod3 app.
5. **Faults, Whole car, Scan car.** Read only. The unit count should look like the car's.
6. **Perf, G-meter** while a passenger watches on a quiet road: the speed and the dot should
   follow the car.
7. **AWD / 2WD**, enabled in Settings, without pressing 2WD: the DSC should be identified and
   the checks should match the car (in P, stationary).
8. Only then the things that send commands: a map change, exhaust control, clearing faults,
   and last of all 2WD, on a closed area first.

## Changes in 0.1.1

- **Exhaust commands are no longer dropped.** A flap command that arrived while another
  request was running (a fault scan, a DME check) was refused. That could lose the rpm
  guard's hand-back to OEM, leaving Close commanded above the limit until the DME let go,
  and it silently ended the 15-second hold. Flap commands now wait their turn.
- **Fault clearing works on a parked car.** The Park check wanted a selector message newer
  than 5 seconds, but the car reports the selector only when it moves and may not repeat a
  speed of 0, so a car sitting in P read as not parked. Speed and temperatures are now
  re-read (as the upstream kit does), the last selector position counts, and the check still
  fails closed without a live speed under 1 km/h and a source that says P.
- **The selector's two sources no longer overwrite each other.** A powertrain value that
  cannot tell N from P used to wipe a known P. R, N or D from either source wins.
- **Gauges keep steady values.** An oil or coolant temperature that did not change for 15
  seconds went blank; the re-read above keeps it shown.
- **Demo mode hands the flap back first.** Switching Demo on while Open or Closed was held
  now sends OEM before commands stop. Changing Exhaust control re-arms or stops the hold.
- The last DME scan is shown again after a restart (clearing still needs a fresh read).
- The log folder is no longer read from disk on every drawn frame.
- The app has a tile icon (`apps/smiley/icon.png`), which `mgu-repo.json` already named.

## Testing performed

The repository builds an SDK-free preview and runs the actual entry point through
the upstream head-unit stub. Tests use synthetic ECU responses, never a real car:

- 39 integration checks: MHD echo validation, supported/unknown BM3 ROMs,
  session serialization, demo/pause gates, stale data, fault-clear validation,
  exhaust RPM protection, CSV output, Wi-Fi binding and phone API authorization.
- A native entry-point flow: startup, tabs, MHD map action, exhaust action,
  two-press DME clear, OEM hand-back before demo, demo lock, and no overlapping
  diagnostic requests.
- Six screens rendered from the actual app code.

Nothing was installed on or sent to your car. The BMW SDK is not distributed.
An offline preview does not validate response timing, gauge calibration, head-unit
networking, touch/knob behavior or hardware actuation on your car.

## Build / preview locally

Python 3 and Node.js are needed. The app's runtime code stays compatible with Node 8.

```sh
python3 kit/tools/build.py --preview-only smiley
node tests/test-smiley.js
node tests/test-native-flow.js
node kit/tools/preview.js dist/smiley preview render BTN_PAGE BTN_PAGE BTN_PAGE BTN_PAGE BTN_PAGE --set tuner=mhd
```

The generated `dist/smiley` preview deliberately contains no BMW SDK and is **not
an installable binary**. Do not rename it to `.mgu` or `.tgz`.

## MGU Store source installation route

The companion USB archive contains a source repository under `mgu-repo/smiley/`.
Copy that `mgu-repo` folder to the USB root. A compatible Store can list the source
and build SMILEY on the head unit using its own SDK donor, as with upstream source
apps. This source-install route was packaged locally, not tested on a vehicle.

Required existing tools: `idrive7-renderd >= 2.1.7` and `mgu-inputgate >= 1.0.0`.
They come from the original cauliflowermossgrape/idrive7-apps Store source. This
package does not bundle or replace the renderer, input gate or the BMW SDK.

Initial app settings are vehicle data only, tuner None, and exhaust Disabled.
Opening the app does not switch a map, move the flap or clear faults. Selecting
bootmod3 uses the original ROM-identification procedure; a supported marker is
required before map writes. MHD results say Accepted because the upstream code
does not have a generic active-map readback. A recognized BM3 ROM uses readback.

## Source and attribution

Base: https://github.com/cauliflowermossgrape/idrive7-apps — commit in
`UPSTREAM_REVISION`. Reused Engine Config modules: `tune.js`, `bm3_protocol.js`,
`bm3_profiles.js`, `controller.js`, `diaglink.js`, `adapters.js`,
`real_adapters.js`, `auto.js`. Telemetry scaling and DID candidates come from
M Vitals / Live Data; fault parsing comes from `kit/runtime/diag.js`.

The renderer and Store are separate projects:
https://github.com/robertnisipeanu/mgu-store and
https://github.com/robertnisipeanu/idrive-apps.

QR generator: Project Nayuki, MIT, as vendored by mgu-store. See
`LICENSE-qrcodegen.txt`. Retain `LICENSE` and `NOTICE` with redistributed code.

## Remaining work before the requested feature set is complete

1. Verify the read-only telemetry and native UI on the target MGU firmware.
2. Validate the chosen tuner and exhaust controls on the actual DME.
3. Confirm the phone dashboard is reachable on the car hotspot; inspect any
   networking limitation before making a separate, narrowly scoped change.
4. Identify and validate the correct headlamp controller and output protocol.
   The examined public light-show project explicitly describes unverified output
   mapping; copying those commands would not make SMILEY's headlight control proven.
5. Obtain or implement a documented MHD-compatible hotspot diagnostic transport,
   including discovery, session ownership, transfer timing and recovery behavior.
   No flash security/license bypass or experimental firmware writer is included.
