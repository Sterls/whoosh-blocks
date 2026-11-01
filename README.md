# Whoosh Blocks

A calm 3D cube puzzle with **no ads, no tracking and no accounts**.

Tap a cube to send it flying in the direction of its arrow. If another cube is
in the way, it bumps and comes back. Clear every cube to finish the level.

- **Drag** to turn the puzzle, **pinch** to zoom.
- **Hint** makes a cube that can leave right now pulse.
- **Stars:** 3 for no bumps, 2 for one or two bumps, 1 otherwise.
- Levels never run out: each level number is generated on the fly, bigger and
  trickier as you go, and every level is guaranteed solvable (they are built
  by solving backwards; see `js/levels.js`).
- **Leaderboard** shows who has beaten the furthest level (optional, see below).
- **Challenges** every 5th level (from level 5) win trophies, rotating through:
  - **Picture**: the cubes form a picture (heart, house, cat, …) in its own colours.
  - **Perfect run**: no bumps allowed; a bump starts the level over.
  - **Speed bonus**: finish inside a target time (the clock starts on the first tap).
  - **Tap bonus**: finish within a tap limit.

  Speed and tap bonuses can't be failed: missing the target just means no
  trophy, and the next level still unlocks.
- Progress is saved on the phone. Works offline once opened.

## Installing on an Android phone

1. Open the game's link in **Chrome**.
2. Tap the **⋮** menu → **Add to Home screen** (or **Install app**).
3. Open it from the new home-screen icon. It runs full screen, like an app.

## Hosting (GitHub Pages)

The game is plain static files with no build step. In the repository on GitHub, go to
**Settings → Pages**, set **Source** to *Deploy from a branch*, choose the
branch and the `/ (root)` folder, and save. After a minute it is live at
`https://sterls.github.io/whoosh-blocks/`.

## Setting up the leaderboard (optional, free)

The game is static, so the shared leaderboard lives in a free
[Supabase](https://supabase.com) database. One-time setup:

1. Sign up at supabase.com and create a **New project** (free plan; any name
   and region; save the database password somewhere, though the game doesn't need it).
2. In the project, open **SQL Editor → New query**, paste the contents of
   [`supabase/setup.sql`](supabase/setup.sql), and press **Run**.
3. Open **Project Settings → API** (or **Connect**). Copy the **Project URL**
   and the **anon / publishable** key into `js/config.js`:

   ```js
   export const LEADERBOARD = {
     url: 'https://abcdefghijk.supabase.co',
     anonKey: 'eyJhbGciOi...',
   };
   ```
4. Commit and push. Phones pick it up the next time the game is opened.

The anon key is designed to be public. The database only lets the game read
names and levels and add or raise a player's own score. Each phone has a
random secret id, so nobody can change another player's score. The leaderboard
isn't cheat-proof, though: anyone with the link can submit a score. Free
Supabase projects pause after a week with no activity; open the Supabase
dashboard and click **Restore** if the board stops loading.

## Developing

```bash
npm start   # serves the game at http://localhost:8080
npm run stamp  # after changing any game file: updates the version in sw.js
npm test    # checks levels are solvable and the version stamp is current
```

Installed copies of the game check for a new version whenever they're opened
(and hourly while open). When one has downloaded, the menu shows
**"A new version is ready · Update"**. Phones only notice a release if the
version in `sw.js` changed, which is why `npm run stamp` matters.

Files:

- `index.html`, `css/style.css`: screens and styling
- `js/main.js`: menus, saving, sounds, Android back button
- `js/game.js`: the 3D scene, touch controls and animations (three.js)
- `js/levels.js`: level generator
- `js/audio.js`: sound effects, synthesized in the browser
- `js/leaderboard.js`, `js/config.js`, `supabase/setup.sql`: the optional leaderboard
- `sw.js`, `manifest.webmanifest`: offline support, updates and install-to-home-screen
- `scripts/stamp.mjs`: writes the version fingerprint into `sw.js`
- `vendor/`: a local copy of [three.js](https://threejs.org) r170 (MIT), so the game never loads code from other sites
