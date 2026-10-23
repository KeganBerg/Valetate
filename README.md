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

- **Admin**: invites people by email, sets roles, removes members, builds maps, parks cars.
- **Manager**: builds and edits maps, parks cars.
- **Valet**: sees the live lot (taken spots, time parked, plate, owner info), parks, moves, and retrieves cars.

The first person to sign up creates the company and becomes its admin. Invited people join automatically the first time they sign in with the invited email. Access is enforced in the database with row-level security (`supabase/migrations/`), not just in the UI. A company always keeps at least one admin, and a spot can only hold one parked car.

Without those variables, the app runs in single-device mode and saves to the browser's localStorage.

### Before going live

In the Supabase dashboard, open Authentication → URL Configuration and set **Site URL** to the Netlify site address (and add it under Redirect URLs), so confirmation and sign-in emails link back to the app.

## Requests and the guest link

- **Request queue** (Live lot): the stand types a tag (or taps "Request car" on a car), a valet taps **Claim**, then **Car is up** when it reaches the stand, then **Handed over** (which retrieves it). Everyone sees who has what, with timers that turn red after 5 minutes. Requested spots glow on the map (amber waiting, blue on its way, green at the stand).
- **Guest link**: every car parked with a team account gets a private link (`?car=<token>`). "Guest link" on the car card shows a QR code to scan at check-in, or texts/shares the link from the valet's own phone. The guest page has one button, "Bring my car", and live status until the car is up. Guests only ever see the company, tag, color and make: never the plate, owner or spot. The page calls two `security definer` functions (`guest_car`, `guest_request`) that anonymous visitors may run; the tables themselves stay closed to them.

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
