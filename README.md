# Valetate

A grounds site manager for operations teams: map any site (event grounds, a venue or hotel, a campus or facility, a parking garage) in minutes, and share it with your team.

## What's here

- **Sites and areas**: a site is one place (a venue, an event, a campus, a garage). Each site has areas, one map each: the whole site, an outdoor area, a parking lot, a garage level or a building floor. Areas show as tabs under the top bar; tap the open tab to rename, move or delete it. New sites start from a ready-made site (event grounds, venue or hotel, campus or facility, parking garage, blank) or a real example.
- **Editor**: a 2D editor for any area.
  - Site pieces: entrance, exit, gate, fence, stage, tent, toilets, first aid, assembly point, info point, loading dock, fire extinguisher, north arrow.
  - Asset library: rows of spaces (they number themselves), single and accessible spaces, valet booth, ramp, car, walls, poles, stairs, elevator, buildings, trees, palms, shrubs, planter islands, arrows, crosswalks, lane lines, curbs, zones, and text.
  - Click an asset to drop it in the middle of the view, or drag it onto the map.
  - Drag to move, use the handles to resize, and use the round handle to rotate (snaps to 15°; hold Alt for free rotation).
  - Snap to grid, undo/redo, copy/paste, multi-select (Shift-click or Shift-drag), and arrow-key nudging.
  - Rows: set the row letter, the first number, and the count, or count from the other end. Spot labels look like `D 12`. The editor warns about duplicate labels.
  - Drag the orange handles to resize the lot; it also grows on its own when something is dropped past the edge.
- **Find**: type `d12`, `D 12`, `R3` or a name like `First aid` to jump to it, in whichever area of the site it is.
- **Files**: each area can be exported as a file (opened again as a new area), or saved as PNG or SVG.
- Works on phones: pinch to zoom, and the asset library and properties open as bottom sheets.
- Opens with no signal: the built app installs a small service worker (`sw.js`, generated at build time) and shows the maps as the device last saw them.

## Accounts and teams (Supabase)

When `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set (see `.env`), Valetate requires sign-in and a company's maps are shared in real time:

- **Admin**: invites people with one-time links, sets roles, removes members, builds maps.
- **Manager**: builds and edits maps.
- **Viewer** (`valet` in the database): sees the maps, read-only.

The first person to sign up creates the company and becomes its admin. Admins invite people with a one-time link (or its code, or a QR code); whoever opens it and signs in joins with the role on the link. Access is enforced in the database with row-level security (`supabase/migrations/`). Two people editing the same map can't overwrite each other: each save goes over the map's last-seen `version`, and a clash shows the other person's version with a "Keep mine" button.

Without those variables, the app runs in single-device mode and saves to the browser's localStorage.

The database still has the tables from the earlier operations features (parked cars, requests, tips, shifts, incidents, payments). The app no longer uses them; they were left in place on purpose.

### Before going live

In the Supabase dashboard, open Authentication → URL Configuration and set **Site URL** to the Netlify site address (and add it under Redirect URLs), so confirmation and sign-in emails link back to the app.

## Deploy

Netlify builds and publishes the site from `main` using `netlify.toml`, and every pull request gets a deploy preview. GitHub Actions (`.github/workflows/ci.yml`) runs the tests and the build on each push.

## Data model

- `LotMap` holds `items: MapItem[]`. Each item is a box (`x, y, w, h`) rotated around its center.
- `listSpots(items)` expands rows into `Spot`s, each with a stable `key` (`<itemId>#<number>`) and a label like `D 12`.

## Develop

```sh
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```
