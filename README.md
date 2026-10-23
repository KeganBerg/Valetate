# Valetate

All-in-one valet operations app. This first piece is the **lot map editor**, plus a **Live lot** view on top of it.

## What's here

- **Edit map**: a 2D editor for any lot, garage level, or front drive.
  - Asset library: rows of spaces (they number themselves), single and accessible spaces, valet booth, ramp, car, walls, poles, stairs, elevator, buildings, trees, palms, shrubs, planter islands, arrows, crosswalks, lane lines, curbs, zones, and text.
  - Click an asset to drop it in the middle of the view, or drag it onto the map.
  - Drag to move, use the handles to resize, and use the round handle to rotate (snaps to 15°; hold Alt for free rotation).
  - Snap to grid, undo/redo, copy/paste, multi-select (Shift-click or Shift-drag), and arrow-key nudging.
  - Rows: set the row letter, the first number, and the count, or count from the other end. Spot labels look like `D 12`. The editor warns about duplicate labels.
- **Live lot**: built for rush hour. Tap a spot, and the next key tag number is already filled in. Tap a color and a make, then **Park**, which takes about three taps per car. The next closest open spot is selected automatically. Plate, owner, phone, and notes are optional and can be added later. Taken spots are filled with the car's color and show its tag and how long it has been parked. You can move a car or mark it retrieved, and search by tag, plate, owner, or color.
- **Find spot**: type `d12`, `D 12`, or `R3` to jump to that spot.
- **Maps**: you can keep several maps, start from templates (blank, surface lot, garage level), or open examples recreated from real venue maps (Broward Center back lot and front ramp, WPB Marriott). Maps can be imported and exported as files, and saved as PNG or SVG.
- Works on phones: pinch to zoom, and the panels open as bottom sheets.

## Accounts, roles, and live data (Supabase)

When `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set (see `.env`), Valetate requires sign-in, and everything is shared across a company in real time:

- **Admin**: invites people with one-time links, sets roles, removes members, builds maps, parks cars.
- **Manager**: builds and edits maps, parks cars.
- **Valet**: sees the live lot (taken spots, time parked, plate, owner info), parks, moves, and retrieves cars.

The first person to sign up creates the company and becomes its admin. Admins invite people with a one-time link (or its code, or a QR code) that they text out; whoever opens it and signs in joins with the role on the link. Joining never trusts the email on an account, so Supabase's "Confirm email" setting can be off. Access is enforced in the database with row-level security (`supabase/migrations/`), not just in the UI. A company always keeps at least one admin, and a spot can only hold one parked car. The database also records who parked and who brought out each car (the app can't change those), lets a valet undo a retrieve for 15 minutes, keeps the history of cars that left editable only by managers and admins, shows valets only the last day of that history, and clears owner names and phone numbers 30 days after a car leaves (a daily `pg_cron` job). Two people editing the same map can't overwrite each other: each save goes over the map's last-seen `version`, and a clash shows the other person's version with a "Keep mine" button.

Without those variables, the app runs in single-device mode and saves to the browser's localStorage.

### Before going live

In the Supabase dashboard, open Authentication → URL Configuration and set **Site URL** to the Netlify site address (and add it under Redirect URLs), so confirmation and sign-in emails link back to the app.

## Requests and the guest link

- **Request queue** (Live lot): the stand types a tag (or taps "Request car" on a car), a valet taps **Claim**, then **Car is up** when it reaches the stand, then **Handed over** (which retrieves it). Everyone sees who has what, with timers that turn red after 5 minutes. Requested spots glow on the map (amber waiting, blue on its way, green at the stand).
- **Guest link**: every car parked with a team account gets a private link (`?car=<token>`). "Guest link" on the car card shows a QR code to scan at check-in, or texts/shares the link from the valet's own phone. The guest page has one button, "Bring my car", and live status until the car is up. Guests only ever see the company, tag, color and make: never the plate, owner or spot. The page calls two `security definer` functions (`guest_car`, `guest_request`) that anonymous visitors may run; the tables themselves stay closed to them.

### Damage walkaround photos

"Photos" on a parked car opens a guided walkaround: front, driver side, back, passenger side, plus any close-ups. Each picture is shrunk on the phone (about 1600 px, a few hundred KB) with the time, tag and side burned into the corner, then uploads in the background and retries when signal comes back. Any photo can be marked as showing damage. Team accounts keep photos in the private `car-photos` Supabase Storage bucket under `<company>/<car>/`; only company members can see them and only admins can delete them. Single-device mode keeps them in the browser's IndexedDB.

### Plate scan

"📷 Scan plate" at check-in (and the camera button by the plate field or the parked-car search) opens the rear camera with a plate-shaped box. Frames inside the box are read on the phone with [Tesseract.js](https://github.com/naptha/tesseract.js) until two reads agree, then the plate is shown big and editable before it's used. Nothing leaves the phone. Scanning to search jumps to that car on any map, allowing for lookalike misreads (O/0, B/8, S/5) and one wrong character. Check-in warns when the plate is already parked. The reader's files (about 7 MB: worker, WebAssembly core, English model) are copied from `node_modules` into `public/ocr` by `scripts/copy-ocr.mjs` before `dev` and `build`, so the app serves them itself and needs no CDN; they only download the first time someone scans. Without camera access it falls back to taking a photo, or typing.

### Key tracking

Every car's keys hang on a hook or box: the tag number unless "Key hook or box" says otherwise (check-in warns if that hook already holds another car's keys). The car card shows where the keys are: "On hook 12", or "With Sam · 6m" once someone taps **Take keys**. Claiming a request takes the keys automatically. "Keys out" in the Live lot lists every key off the board, longest first, and turns red after 15 minutes when the car isn't on its way out. Stored in `parked_cars.key_slot`, `keys_with`, `keys_with_name` and `keys_out_at`.

### Stacked cars ("blocked by")

When a car is parked in front of another (tandem spaces, a ramp stack), "+ Blocking a car in?" at check-in, or "Blocking…" on the car card, offers the parked cars in the neighbouring spaces to tap. A request for a blocked-in car then says "Move #14 first" in the queue and on its card (outermost car first, following chains), and the cars in the way get a dashed orange ring on the map. Moving a car clears the stack it was part of. Typing a spot number while moving a car drops it there. Stored in `parked_cars.blocks` (ids of the cars it blocks).

### Event surge mode

For a theater or arena that lets out all at once. "Start event mode" in the menu takes a name and a let-out time; everyone on the team then sees the countdown over the map and an event card at the top of the Live lot. Before the let-out, a car can be asked for **at the let-out** (its card's second button, or the "For the let-out" box under the quick request). Those wait at the bottom of the queue in purple and the event card lists them as **Stage near the stand**: farthest from the valet booth first, with what's blocking them and the open spots nearest the booth. At the let-out every phone buzzes, the asked-ahead requests become live, and the card switches to cars waiting, cars out, cars per minute and minutes until the lot is empty. Moving the let-out time moves the asked-ahead requests with it. Separately, any lot down to 5% (or 3) open spots shows "Lot almost full" and says which other lot has the most room. Stored in `lot_events` and `requests.due_at`; the pace comes from `cars_out_since()`.

### Shift and tips

The third tile at the top of the Live lot (or "Shift and tips" in the menu) is the shift sheet. **Clock in** when you start so your time counts toward the tip pool. Log a tip in one tap: pick Cash or Venmo / card, then $1, $2, $3, $5, $10, $20 or another amount. **Today's pool** shows the total and every valet's share, split by minutes on the clock since 5 AM (so a late night counts as one day), and the shares always add up to the cent. Anyone can remove a tip they logged by mistake; managers can remove any tip and clock out someone who forgot. **Clock out** shows what you're leaving behind (cars still parked, keys off the board, open requests, your time and share) and takes a note for the next crew, which they see at the top of the sheet when they open it. Admins can set a guest tip link (Venmo, Cash App, PayPal.me; https only), and guests then see "Tip your valet" on their page once their car is up. Stored in `shifts`, `tips` and `companies.tip_url`.

### Stand report (managers and admins)

"Stand report" in the menu shows today, the last 7 days or the last 30 days. It covers cars in and out, the average wait (from the request, or the let-out for cars asked for ahead, until the car is at the stand) with the time 9 in 10 guests got their car within, and the busiest hour with a by-hour chart of requests or arrivals. It also shows cars per day, and a crew table with cars parked, cars brought up, average wait, time on the clock and tip share for each person, which you can download as a CSV. It is built from the `parked_cars`, `requests`, `tips` and `shifts` rows (valets can't read past cars, so it's managers only). Single-device mode keeps a local history of finished cars for it.

### Adding automatic texts later (Twilio)

The data is ready for it: requests record a `source` (`staff`, `guest`, `sms`), cars keep `owner_phone` and `guest_token`. The plan is a Supabase Edge Function that sends the welcome text (with the guest link) when a car is parked with a phone number, the "your car is ready" text when a request turns `ready`, and accepts "reply 1 to request" through a Twilio webhook. Setup needed: a Twilio account, a phone number (US: toll-free verification or A2P 10DLC registration, which can take days), and `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` saved as Edge Function secrets.

## Deploy

Netlify builds and publishes the site from `main` using `netlify.toml`, and every pull request gets a deploy preview. GitHub Actions (`.github/workflows/ci.yml`) runs the tests and the build on each push.

## Data model

- `LotMap` holds `items: MapItem[]`. Each item is a box (`x, y, w, h`) rotated around its center.
- `listSpots(items)` expands rows into `Spot`s. Each one has a stable `key` (`<itemId>#<number>`), so cars and requests stay attached to a spot when the map is edited.
- `ParkedCar` points at `Spot.key`.

## Develop

```sh
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```
