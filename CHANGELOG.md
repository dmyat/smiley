# Release notes

Every version of the app from the first build to now, newest first.

## 0.2.0

- Version number moves to 0.2.0. Same build as 0.1.27.

## 0.1.27

- History page: headlines are regular weight, a size smaller and a softer
  white, so the page is easier on the eyes.

## 0.1.26

- **Warm-up light.** Top right on every tab, from the engine oil temperature:
  blue "ENGINE COLD" below 140°F (60°C), amber "WARMING UP" up to 185°F
  (85°C), green "WARMED UP" above that. It stays off when the car sends no oil
  temperature.

## 0.1.25

- History page rewritten in plain words: one big line per entry ("0 to 60 mph
  in 3.92 seconds", "397 horsepower", "Stopped from 60 mph in 110 feet") with
  every other figure of that run in small text under it.
- Four larger rows a page instead of six small ones.

## 0.1.24

- **History page on the Perf tab.** Every drag run, dyno pull and brake test
  is listed newest first and kept after the car is switched off.
- Each entry is deleted automatically when it is 30 days old.
- Demo runs are shown and never saved.

## 0.1.23

- The Info row for the Instagram handle is labelled just "Instagram".

## 0.1.22

- The Instagram handle moves from the corner label to its own row on the Info
  tab. It replaces the car Wi-Fi address row, which only served the Phone tab
  that is switched off.
- The corner label is back to the app name, maker and version.

## 0.1.21

- Corner label shows the Instagram handle alone, without an icon.

## 0.1.20

- Corner label shows a small outline camera and the Instagram handle.

## 0.1.19

- "FOLLOW ME ON IG @g20smiley" added to the corner label.

## 0.1.18

- The app is listed as PERFORMANCE in the car's menu. The icon is unchanged.

## 0.1.17

Fixes from the first on-car video of 0.1.16:

- Info: the VIN and engine computer type are read for the page itself, and
  asked for again a few times if the first request goes unanswered.
- Top bar: opening a tab by touch hides the controller's box, which used to
  stay on the tab the knob was last on.
- Dials without a hot end (pressures, trims, timing, lambda) use one calm
  colour, so a normal reading no longer looks orange or red. Temperatures keep
  blue to red.
- David Myat is named in LICENSE and NOTICE for the parts of the app he made.

## 0.1.16

- The Christmas snow and surprises move only on the GPU renderer. On the Basic
  renderer the theme keeps its colours and stays still, so pages are not
  redrawn 15 times a second.

## 0.1.15

- On-screen instructions say "this app" instead of the app's name.

## 0.1.14

- A dial's needle no longer sweeps from the previous gauge's value when the
  page is switched.
- Signal bars step smoothly and show MIN as well as MAX.
- The RPM bar flashes red and white past 6500 rpm.

## 0.1.13

- Live Stats: RPM, boost, boost target, engine load and torque are signal
  bars; the other gauges are dials.
- Oil, coolant and intake temperature dials run blue (cold) to red (hot).
- A setting can make everything dials or everything bars.

## 0.1.12

- Sportier dials: a thicker band, a red zone on RPM, oil and coolant, and the
  lowest and highest value so far beside each dial.
- A "Reset min/max" button.
- The bar option becomes signal bars: fourteen rising bars that light up green
  to red.

## 0.1.11

- Not released. A trial of straight bar gauges that was dropped.

## 0.1.10

- Live Stats gauges can be straight bars or dials.
- Info shows the hardware and software numbers, read from the engine
  computer's BMW parts list.
- The Tune row on Info no longer says "None found" for a tune it cannot
  detect. It shows the tune chosen on the Tune tab, or bootmod3 once
  recognised.

## 0.1.9

- **Christmas Red**, a second Christmas colour scheme in cranberry and gold.
  The first one is now listed as Christmas Green.

## 0.1.8

- Christmas surprises play only in the empty strip at the bottom of Live
  Stats, Perf and Info, so they never cover a gauge, a button or text.

## 0.1.7

- Live Stats shows six gauges a page (three across, two down) on two pages.
- A gauge is changed by picking from a list of all sixteen.
- Christmas is the default theme.
- **Christmas surprises**: Santa's sleigh, a shooting star or a waving snowman
  now and then. They can be switched off in Settings.

## 0.1.6

- **Christmas theme** with falling snow.

## 0.1.5

- Fixed the boost gauge showing "NO DATA" on the default first page. The fast
  gauges were sharing turns with the slow ones, so boost never got read.

## 0.1.4

- Boost, boost target and oil pressure no longer stay blank when the car does
  not report outside air pressure. Standard air pressure stands in until it
  does.

## 0.1.3

- Phone, Connect and Flash tabs switched off for now.
- Boost: fewer dropouts. A reading that worked before is retried after 2
  seconds instead of 30.
- Dyno: the "too short" message is shortened so it fits its card.

## 0.1.2

The first version on GitHub and the first tested on the car.

- Live Stats grows to two pages with more readings: ignition timing, lambda,
  low-pressure fuel, oil pressure, boost target, engine load, torque and
  misfires. Every gauge keeps its lowest and highest value.
- Gauge pages can be edited: press and hold a gauge to move or change it.
- New Perf tab: drag timer, G-meter, virtual dyno with a power and torque
  graph, and brake test.
- New AWD / 2WD tab (experimental, off until turned on in Settings).
- Faults can scan and clear the whole car, not only the engine computer.
- New look: black and champagne gold, rounded buttons, the Inter typeface, the
  car logo and the maker's mark.
- Dials scale themselves to what the car has actually reached.
- The Logs and Shift tabs are removed.

## 0.1.1

Bug fixes to the first draft:

- Exhaust flap commands are no longer dropped while another request is
  running.
- Fault clearing works on a parked car. The Park check used to fail on a car
  standing still.
- Gauges keep steady values. An oil or coolant temperature that did not change
  for 15 seconds used to go blank.
- Switching Demo on hands the exhaust flap back to the car first.
- The last engine fault scan is shown again after a restart.
- The app has a tile icon.

## 0.1.0

The first review build.

- Tabs: Live Stats (RPM, boost, oil, coolant and intake temperatures, fuel
  trims, rail pressure), Controls (tune map slots and exhaust flap), Fault
  Codes (engine computer only), Drive Logs, Phone and Headlights (screen
  preview only).
- Midnight Violet theme.
