# Valetate

All-in-one valet operations app. This first piece is the **lot map editor**, plus a **Live lot** view on top of it.

## What's here

- **Edit map**: a 2D editor for any lot, garage level, or front drive.
  - Asset library: rows of spaces (they number themselves), single and accessible spaces, valet booth, ramp, car, walls, poles, stairs, elevator, buildings, trees, palms, shrubs, planter islands, arrows, crosswalks, lane lines, curbs, zones, and text.
  - Click an asset to drop it in the middle of the view, or drag it onto the map.
  - Drag to move, use the handles to resize, and use the round handle to rotate (snaps to 15°; hold Alt for free rotation).
  - Snap to grid, undo/redo, copy/paste, multi-select (Shift-click or Shift-drag), and arrow-key nudging.
  - Rows: set the row letter, the first number, and the count, or count from the other end. Spot labels look like `D 12`. The editor warns about duplicate labels.
- **Live lot**: tap a spot to park a car there (plate, vehicle, owner, phone, ticket, notes). Taken spots turn red and show how long the car has been parked. You can move a car to another spot or mark it retrieved, and search by plate, spot, ticket, or owner.
- **Find spot**: type `d12`, `D 12`, or `R3` to jump to that spot.
- **Maps**: you can keep several maps, start from templates (blank, surface lot, garage level), or open examples recreated from real venue maps (Broward Center back lot and front ramp, WPB Marriott). Maps can be imported and exported as files, and saved as PNG or SVG.
- Works on phones: pinch to zoom, and the panels open as bottom sheets.

Data is currently saved in the browser (localStorage). Accounts, roles, and shared live data are coming next, using Supabase.

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
