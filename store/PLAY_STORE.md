# Getting Whoosh Blocks onto Google Play

Everything needed for the Play Store: the steps, the listing text and the
answers to Google's forms. Images are in this folder:

| File | Where it goes in Play Console |
|---|---|
| `app-icon-512.png` | Store listing → App icon |
| `feature-graphic.png` (1024×500) | Store listing → Feature graphic |
| `screenshot-1.png` … `screenshot-6.png` (1080×1920) | Store listing → Phone screenshots |

Game address: **https://sterls.github.io/whoosh-blocks/**
Privacy policy: **https://sterls.github.io/whoosh-blocks/privacy.html**

---

## Step 1. Google Play developer account (you)

1. Go to <https://play.google.com/console> and sign in with the game's Gmail.
2. Choose **Personal** account, pay the US$25 fee, and complete identity
   verification (photo ID) and Android device verification.
3. Verification can take a few days. Carry on with step 2 meanwhile.

## Step 2. Build the Android app with PWABuilder (you, about 10 minutes)

1. Open <https://www.pwabuilder.com>, paste `https://sterls.github.io/whoosh-blocks/`
   and press **Start**.
2. Click **Package for stores** → **Android** → **Generate package**, then
   open **All settings** and set:

   | Setting | Value |
   |---|---|
   | Package ID | `io.github.sterls.whooshblocks` (permanent, can never change) |
   | App name | `Whoosh Blocks` |
   | Launcher name | `Whoosh` |
   | App version / version code | `1.0.0` / `1` |
   | Display mode | `Standalone` |
   | Status bar colour / Splash colour | `#EFE9FF` |
   | Signing key | **Create new** |

3. Download the zip. It contains:
   - `*.aab`: the app to upload to Play,
   - `signing.keystore` and `signing-key-info.txt`: **your signing key and passwords**,
   - `assetlinks.json`: needed for step 5.
4. **Back up the whole zip somewhere safe**, e.g. a password manager or private
   cloud storage. You need the key for every future update. **Never put it in this
   repo**, because the repo is public.

## Step 3. Create the app in Play Console (you)

1. **Create app**: name `Whoosh Blocks`, language English (United Kingdom),
   **Game**, **Free**. Accept the declarations.
2. Keep **Play App Signing** on (the default). Google then holds the final
   signing key, so a lost upload key can be reset.
3. Fill in the store listing and forms with the text below.

## Step 4. Closed test, 14 days (you plus 12 testers)

1. **Test and release → Testing → Closed testing → Create track.**
2. Upload the `.aab` from step 2 and roll out the release.
3. Add **at least 12 testers** by email (Google accounts with Android phones)
   and send them the opt-in link. They must stay opted in for **14 days in a row**.
4. After 14 days, apply for **production access**. Google reviews it in a few
   days, then you publish to production.

## Step 5. Make the app open full-screen (you + me)

Android hides the browser bar only if the website confirms it owns the app.
That proof file must live at `https://sterls.github.io/.well-known/assetlinks.json`,
the root of your GitHub Pages site, which needs one extra repo:

1. On GitHub, create a **public** repo named exactly **`Sterls.github.io`**
   (empty is fine) and tell me. I'll add the file.
2. Send me the two SHA-256 fingerprints, which are safe to share:
   - **upload key**: from `signing-key-info.txt` or PWABuilder's `assetlinks.json`,
   - **app signing key**: Play Console → **Test and release → App integrity
     → App signing** → "SHA-256 certificate fingerprint".
3. Until this is done, testers will see a thin address bar at the top. Everything
   else works.

---

## Store listing text

**App name** (30 max)

```
Whoosh Blocks: 3D Cube Puzzle
```

**Short description** (80 max)

```
Tap cubes to send them flying. A calm 3D arrow puzzle with endless levels.
```

**Full description** (4,000 max)

```
Tap a cube and watch it whoosh away!

Whoosh Blocks is a calm 3D puzzle. Every cube has an arrow. Tap a cube and it
flies off in that direction, but only if nothing is in its way. Spin the stack,
spot the cubes that are free, and unblock the puzzle one cube at a time until
every last block is gone.

★ Relaxing 3D puzzles: turn and zoom the stack with your fingers
★ Endless levels that grow from a few cubes to towering stacks
★ Every level is guaranteed solvable
★ Picture puzzles: clear hearts, houses, cats, stars and more
★ Challenges every few levels: perfect runs, speed and tap bonuses
★ Win stars and trophies
★ Hints whenever you're stuck, with no limits
★ No timers on normal levels, no lives, no pressure
★ Plays offline
★ No ads, no tracking, no accounts

Simple to learn, satisfying to master, and a gentle workout for your brain.
Perfect for a few minutes' break or a long, quiet puzzle session.
```

**Category:** Game → Puzzle
**Tags:** Puzzle, Brain games, Logic, Casual, Offline, Relaxing (pick what Play offers)
**Contact email** (required, shown publicly): the game's Gmail
**Website:** `https://sterls.github.io/whoosh-blocks/`
**Privacy policy:** `https://sterls.github.io/whoosh-blocks/privacy.html`

---

## Form answers (App content section)

These are correct **while the leaderboard is switched off**, which it is until
`js/config.js` is filled in. **When the leaderboard is turned on**, update the
answers marked ⚠️ in Play Console (App content) before or as it goes live.
No new app build is needed.

| Form | Answer |
|---|---|
| Privacy policy | `https://sterls.github.io/whoosh-blocks/privacy.html` |
| App access | All functionality is available without special access |
| Ads | **No**, the app does not contain ads |
| Content rating (IARC) | Category **Game**, then answer **No** to violence, sexual content, language, drugs, gambling. ⚠️ "Users can interact or exchange content": **No** (once the leaderboard is on: **Yes**. Players see each other's nicknames, and there's a filter, reporting and removal). Expected rating: PEGI 3 / Everyone. |
| Target audience | **13–15, 16–17, 18+** (not under 13). "Could the app appeal to children?" **No** |
| News app | No |
| COVID-19 contact tracing / status | No |
| Data safety | ⚠️ **No data collected, no data shared.** (Once the leaderboard is on: collected, **not shared**, **optional**, encrypted in transit, users can request deletion. Data types: **Personal info → Name** (the nickname), **App info and performance → Other** or **App activity → Other actions** (total points and furthest level), **Device or other IDs** (the random player ID). Purpose for all: **App functionality**.) |
| Government app | No |
| Financial features | None |
| Health | None |
| Actions requiring background location / sensitive permissions | None |
