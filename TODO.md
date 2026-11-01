# Safety & privacy to-do

Everything to sort out before releasing the game to the public, based on
publishing from the UK to Google Play and the App Store. This is a
checklist, not legal advice; check current rules on gov.uk, ico.org.uk and
ofcom.org.uk, and with an accountant/solicitor if the game takes off.

Tick items off as they're done (`- [x]`).

## 1. Name and branding (do first)

- [x] Pick a name: **Whoosh Blocks**.
- [ ] Search "Whoosh Blocks" on Google Play, the App Store and the
      [UK IPO trademark search](https://trademarks.ipo.gov.uk/ipo-tmtext) first.
- [x] Update the title, home screen and install name (manifest) with the new name.
- [ ] Use the new name in the store listings, with keywords: title
      "Whoosh Blocks: 3D Cube Puzzle"; "unblock", "arrow", "tap" in the
      subtitle, keyword field or description. Never use other games' names
      as keywords, and keep "no ads" out of the Google Play title.
- [ ] Keep all art, sounds and levels original. Never copy from the other
      game or its store screenshots.

## 2. Privacy (UK GDPR, store rules)

- [x] Write a privacy policy and host it next to the game (`privacy.html`). It must say:
  - what's collected: leaderboard name, a random player ID, furthest level beaten
  - what the database and hosting providers see: IP addresses in their logs
  - who processes it (Supabase, the hosting provider) and where
  - how long it's kept
  - how to get it deleted
  - a contact email
- [x] Link the privacy policy from the Settings screen.
- [ ] Link the privacy policy from both store listings (text ready in `store/PLAY_STORE.md`).
- [ ] Add a "Remove me from the leaderboard" button that deletes the player's
      row (new `delete_score(secret)` database function).
- [ ] Decide how long scores are kept, e.g. delete entries inactive for
      12 months with a scheduled database job.
- [ ] Create the Supabase project in the London (`eu-west-2`) region and
      accept Supabase's Data Processing Addendum.
- [ ] Do the ICO data protection fee self-assessment (ico.org.uk) and pay the
      fee if required (about £52/year, smallest tier).
- [ ] Set up a contact email for privacy and data-deletion requests and
      reply within one month.
- [ ] Fill in the Google Play **Data safety** form and Apple **App Privacy**
      labels so they match the privacy policy exactly.

## 3. Children (ICO Children's Code)

- [ ] Decide the target age (recommended 13+) and set it in Play Console
      ("Target audience") and App Store Connect.
- [ ] Complete the content rating questionnaires (IARC on Google Play, age
      rating on Apple) truthfully.
- [ ] Write a short Children's Code self-assessment: is the game likely to
      be played by under-18s? If yes, use high-privacy defaults, e.g. the
      leaderboard off until the player chooses to join (already the case),
      with no real names encouraged.
- [x] Add a line on the name screen: "Don't use your real name."

## 4. Leaderboard safety (Online Safety Act, Apple guideline 1.2)

Typed-in names shown to other players make this a "user-to-user service".

- [ ] Block offensive names. Use a word filter in the app and the same check
      in the `submit_score` database function, so it can't be bypassed.
- [ ] Add a "Report" option on each leaderboard row.
- [ ] Add a way to hide or ban a name: a `hidden` flag on the scores table,
      excluded by the leaderboard view.
- [ ] Decide who checks reports and how often, e.g. weekly, and write it down.
- [ ] Do and record an Ofcom **illegal content risk assessment** (Ofcom
      has a free online tool for small services).
- [ ] Do and record an Ofcom **children's access assessment**.
- [ ] Publish a support/contact email in the app and store listings, as Apple requires.
- [ ] Add leaderboard rules to the terms of use: no offensive names, and names can be removed.

## 5. Security and abuse

- [ ] Rate-limit score submissions, e.g. at most a few per minute per
      player, to stop spam and fake traffic.
- [ ] Reject impossible scores, e.g. a jump of thousands of levels in minutes.
- [ ] Add a Content Security Policy to the hosting so the page can only
      load its own files and talk to the leaderboard database.
- [ ] Turn on database backups (Supabase Pro), or accept that a lost
      leaderboard is acceptable.
- [ ] Keep the Supabase service-role key out of the repo. Only the public
      anon key belongs in `js/config.js`.

## 6. Terms and notices

- [ ] Write short terms of use (`terms.html`): the game is provided "as is"
      with no guarantees, plus the leaderboard rules. Link from Settings and the stores.
- [x] Add an "About & licences" screen with the three.js MIT licence notice
      (required by its licence) and a credit line.

## 7. Store submission

- [ ] Answer Apple's encryption question: the game uses only standard HTTPS (exempt).
- [ ] Use a virtual business address on the Google Play developer profile so
      your home address isn't shown publicly.
- [ ] Re-check the Data safety, App Privacy and content rating answers
      after any update that changes what data is collected.

## 8. If ads are ever added

- [ ] Use Google's free consent tool (UMP) to show a consent pop-up to UK and EU players.
- [ ] Prefer optional rewarded ads only, and turn on ad content filters
      (no gambling, dating, etc.).
- [ ] Turn on child-directed or "under age of consent" ad settings if
      children may play.
- [ ] Update the privacy policy, Data safety and App Privacy forms for the ad network.
- [ ] Keep an ad-free build for family.

## 9. Money and tax (UK)

- [ ] Register for Self Assessment with HMRC once income passes £1,000 in a
      tax year (the trading allowance).
- [ ] Keep receipts for expenses: store fees, hosting, domain.
- [ ] Consider a limited company only if profits reach about £30,000–50,000
      a year or you want liability protection.

## Already done

- [x] No ads, trackers, analytics or third-party scripts. Every file is served
      from the game's own site.
- [x] Progress and settings are stored only on the phone.
- [x] Leaderboard is opt-in: nothing is sent until the player picks a name.
- [x] Each phone has a private random ID; the public can read only names and
      levels, and scores can only go up, through one database function.
- [x] Names are shown as plain text, so they can't inject code into the page.
