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

The Leaderboard button stays hidden until this is done. The shared
leaderboard lives in a free [Supabase](https://supabase.com) database:

1. Sign up at supabase.com (with the game's Gmail) and create a **New
   project**: free plan, region **London (eu-west-2)**, any name. Save the
   database password somewhere safe; the game doesn't need it.
2. In the project, open **SQL Editor → New query**, paste the whole of
   [`supabase/setup.sql`](supabase/setup.sql) and press **Run**. It is safe
   to run again after updates.
3. Open **Project Settings → API keys** (or **Connect**) and copy the
   **Project URL** and the **publishable** (or legacy **anon**) key into
   `js/config.js`. Never use the **secret** / **service_role** key.
4. Run `npm run stamp`, commit and push. Players get it through the update bar.

What the database enforces:

- **Nickname filter** (same word lists as `js/names.js`): no swearing, slurs,
  web addresses or unusual characters.
- **Scores only rise, at a realistic pace**: at most one level per 20 seconds
  since the last rise, plus a little slack. New entries start at level 100 or less.
- **Reports**: three different players reporting a nickname hides it.
- **Remove me** deletes a player's entry (and their friend challenges); entries idle for 12 months are deleted.
- **Friend challenges** ("Challenge a friend" on the win card): stored with a
  6-character code, shared as a link (`…/whoosh-blocks/?c=CODE`), and deleted
  after 30 days. Each player can send up to 30 a day.
- **Live races** ("Race friends"): up to 8 players race the same 3 or 5 levels
  through a room code, using Supabase **Realtime** (broadcast + presence).
  Nothing is stored. If races won't connect, check **Project Settings →
  Realtime** and make sure public channels are allowed (not "private channels
  only"). Add `?debug&localrace&racename=Name` to the address to test races
  between browser tabs without Supabase.
- The public can read only nicknames and levels, never the players' secret ids.

**Moderating:** in Supabase, open **Table Editor → scores**. Tick **hidden** to
hide a nickname, untick it to restore one, or delete the row. **reports**
shows which nicknames were reported. Check it weekly.

Free Supabase projects pause after a week without any activity. If the
leaderboard stops loading, open the Supabase dashboard and click **Restore**.

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
