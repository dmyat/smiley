# Release notes

Every version of the app from the first build to now, newest first.

## 0.4.6

Dyno page, reworked after the first real pulls on the car.

- **Bigger graph:** it is wider and taller and fills the page.
- **Peaks in the legend:** peak power and torque with their revs are written
  above the graph, with a dot and a fine line on each curve, so the numbers no
  longer sit on top of the lines.
- **Honest comparison:** the plus or minus against the pull before only shows
  when both pulls covered the same revs.
- **Rounder scale:** steps of 50, 100 or 200 instead of odd numbers.
- **Pull covered:** the page says which revs the pull covered, shades them,
  and when it was a short one says how to get the whole curve.

## 0.4.5

- The app's icon has a clear background: the black is gone, so only the car,
  the hat, the snow and the name show on the car's menu.

## 0.4.4

- The app's icon has smooth rounded corners.

## 0.4.3

- The app's icon in the car is a little smaller, with a margin around it.

## 0.4.2

- **Hive:** the line across the middle of every hexagon is gone, and the
  screen is centred instead of sitting to the left.
- The same line is removed from the Deco and Hive tab shapes.

## 0.4.1

Fixes from the first run of 0.4.0 on the car.

- **Tabs readable in every theme.** The car's own tab strip now always gets
  light lettering: the open tab was dark on dark in 8-Bit and others, and the
  other tabs were too dim in Comic, LCD Watch and Rally.
- **8-Bit:** the block digits are solid, with no lines showing between blocks.
- **Comic:** the burst is one clean shape and the horsepower number is no
  longer doubled.
- **Light themes:** buttons and the maker's mark are drawn dark so they show.
- **Dyno:** the graph always covers the whole rev range, 1000 to 7000 rpm.

## 0.4.0

- **Ten new themes replace all the old ones:** Slash, Midnight, Deco, Big
  Tach, Neon, Hive, Comic, LCD Watch, Rally and 8-Bit. Each has its own
  colours, its own tab bar and its own Live Stats screen. Pick one under
  Settings, Theme. Slash stays the default; a car on one of the old themes is
  moved to Slash.
- **The old layouts are gone:** Six gauges, Cockpit, Race dash, Graph view
  and Car view, along with the gauge editor, the Custom theme and the
  Christmas surprises.
- **More readings.** A button on every Live Stats screen opens a second page
  in the theme's style with the other twelve readings. Tap any reading on
  either page to make it big.
- Not carried over to the new screens yet: tyre pressures and temperatures,
  and the lowest and highest value beside each reading (big number mode
  still shows them).
- The other tabs take each theme's colours and tab bar and keep their layout.

## 0.3.3

- **New logo.** The Christmas one: the car in a Santa hat, with snow and holly.
  It is the app's icon in the car and the logo on this page.

## 0.3.2

- **AI key from your phone.** On the AI tab press Use my phone (QR), join the
  car Wi-Fi, scan the code and paste the key on the page that opens. The page
  only works with the one-time code in the QR, accepts one key, and switches
  itself off when the key arrives or after ten minutes. It needs the Phone
  Access helper from the Store. Typing the key on the car screen still works.

## 0.3.1

- **New AI tab.** Ask an AI assistant about the car: four ready-made
  questions or your own, typed on the app's touch keyboard. It needs your own
  API key (Anthropic or OpenAI) and internet in the car. A question goes out
  with the live readings and the fault codes last read; never the VIN.
- Chat only: it cannot run anything or change the car. The key is saved on
  the head unit only, and Forget key deletes it.

## 0.3.0

- **New default look: Slash.** Racing red cut across black with white
  lettering. The tabs are slanted and sit in the top right corner.
- **Slash Live Stats screen.** The gear as tall as the screen on a red slab,
  with engine speed, horsepower, boost, torque, oil and coolant beside it and
  the revs as one slanted bar. Tap a reading to make it big. The Layout button
  still steps through Six gauges, Cockpit, Race dash, Graph view and Car view.
- A car that already has the app is moved to Slash once on this update. After
  that your own choice of Theme and Live Stats layout in Settings is kept.
- The other tabs wear the Slash colours and keep their layout for now.

## 0.2.10

- **AWD / 2WD tab is back.** It stays off until you turn on "AWD / 2WD
  switch" in Settings. The page now says every time: in 2WD the rear axle
  takes all the torque, so no hard launches.

## 0.2.9

- **Warm-up timer.** Beside the warm-up light: about how many minutes until
  the oil is warm, and the revs to keep under until then. The limit climbs
  from 3500 rpm to the redline as the oil warms.
- **Turbo cool-down.** After hard driving the header counts down how long to
  drive gently or idle before switching off (30 seconds to 3 minutes), then
  says the turbo has cooled.
- **Car view: xDrive split and gearbox oil temperature.** The front and rear
  share of the drive torque is shown on the car, and the gearbox oil
  temperature under it, when the car sends them.
- All read only. The method follows the Warm-Up and M Vitals apps of the
  idrive7-apps kit (MIT), credited in NOTICE.

## 0.2.8

- **Real tyre pressures and temperatures on Car view.** They come from the
  car's own tyre pressure monitor and are shown in your units, whatever unit
  the car itself is set to. A tyre well under the car's target pressure turns
  red, one a little off turns amber. Read only: nothing is sent to the car.
  The signal names and scaling come from the M Vitals app of the idrive7-apps
  kit (MIT), credited in NOTICE.

## 0.2.7

- **Live horsepower gauge.** A new Live Stats gauge shows horsepower as you
  drive, with its highest value so far. It is the engine computer's own
  crankshaft torque multiplied by engine speed, so it is the engine's
  estimate at the crank, not a measurement at the wheels like a dyno.
- It sits on the second gauge page, where engine load was; engine load moves
  to the list of gauges not on show. A layout you arranged yourself keeps its
  order. It can be picked for any place and opened in big number mode.

## 0.2.6

- **AWD / 2WD tab switched off.** A rear driveshaft broke on hard launches
  with the car in 2WD, where the rear axle takes all of the engine's torque.
  The tab and its setting are hidden and the app no longer asks the stability
  control unit anything. The car itself goes back to AWD every time the
  ignition is cycled, so nothing needs undoing.

## 0.2.5

- **Smoother gauges.** The fast gauges on screen are now asked for together in
  one request to the engine computer, so each is refreshed several times as
  often. A gauge joins only after it has answered on its own, and if the car
  does not answer combined requests the app goes back to one at a time by
  itself. Not yet confirmed on a car.
- The six-gauge page is exactly as before again: the Layout button is gone
  from it. The other layouts are chosen under Settings → Live Stats layout;
  inside them a Layout button steps to the next one and back.
- README updated: big number mode, the warm-up light, the four layouts and new
  screenshots.

## 0.2.4

- Car view: each tyre shows its pressure, with its temperature beside it. The
  numbers are samples in the demo. On the car they show "--" for now, because
  the signal that carries tyre pressure is not known yet.
- The app looks through the head unit's list of signals for tyre readings and
  shows the names it finds under the car, so the next version can read them.

## 0.2.3

- **Four new layouts for Live Stats**, next to the six gauges: Cockpit (one
  large RPM ring with boost inside and four readings around it), Race dash
  (rising rev bars and five big numbers), Graph view (the last 30 seconds of
  each reading as a line) and Car view (readings around a top view of a car).
- A **Layout** button on Live Stats steps through them; Settings has the same
  choice. Six gauges stays the default.
- A tap on any reading in any layout opens it in big number mode.

## 0.2.2

- The start-up animation plays once, when the app starts, and not again when
  you come back to the app later.

## 0.2.1

- **Big number mode.** Tap any gauge on Live Stats to show it alone across the
  whole page: a very large number, the lowest and highest so far, and a bar
  showing where it sits on its scale. Tap anywhere to go back. Holding a gauge
  still opens the list to change it.
- **Start-up animation.** About a second and a half when the app opens: the
  name is written out, a line draws under it, PERFORMANCE fades in, then it
  fades away to the page. It can be switched off in Settings.

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
