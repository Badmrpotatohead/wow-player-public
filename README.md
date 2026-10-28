# WOW Player

A now-playing screen for West Coast Swing socials. Project it on the wall and dancers see the current song, its BPM (colour-coded), how far through it is, and what's coming up next. It reads whatever the DJ is playing on Spotify, from any device.

Originally built for [West Orlando Westies](https://westorlandowesties.netlify.app). Free to use for any dance community under the MIT license.

## What it does

- **Now playing + up next**: follows the DJ's Spotify playback and queue in real time.
- **BPM for every song**: comes with a built-in list of about 5,800 songs already tagged with West Coast Swing tempos. Unknown songs are looked up automatically (see [BPM lookup](#bpm-lookup)) and DJs can correct any tempo by hand.
- **Shared BPM list**: optionally, corrections and lookups are saved to your own Firebase database, so every DJ in your community benefits.
- **Community master list**: every copy also reads the shared WOW Player master list, and **Share with community** in the BPM editor sends your DJs' hand-entered tempos (new songs and corrections) to it. Submissions are reviewed before they go live, then every group gets them.
- **Multiple DJs**: each DJ logs in with their own Spotify account; switching DJs takes a click.
- **OtsAV DJ mode**: import an OtsAV DJ Pro playlist export and run the set without Spotify playback.
- **Bulk BPM import**: load an [Exportify](https://exportify.app) playlist CSV at `/bpm-importer` to add a whole playlist's tempos at once.

## Requirements

- A **Spotify Premium** account for each DJ. Spotify only shares playback state with Premium.
- **Node.js 18+**.
- A free **Netlify** account to host it. Optional for local use, but the BPM lookups run as Netlify Functions.

## Setup

### 1. Create your own Spotify app

Every community uses its own Spotify developer app. Spotify limits how many people can log in to an app that hasn't been through their review, so sharing one app between groups doesn't work.

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and click **Create app**.
2. Give it any name and description, tick **Web API**, and add your redirect URIs:
   - `http://127.0.0.1:5173/callback` for running locally (Spotify rejects `localhost`, so use `127.0.0.1`)
   - `https://<your-site>.netlify.app/callback` once you deploy
3. Save, then copy the **Client ID**.
4. Under **User Management**, add the Spotify email of every DJ who will log in.

The first time the app opens it asks for this Client ID and remembers it on that device. No code changes are needed.

### 2. Run it locally

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. On Windows you can double-click `START-WOW-PLAYER.bat` instead.

`npm run dev` serves only the front end, so only the built-in BPM list works. To run the BPM lookups locally too, use the [Netlify CLI](https://docs.netlify.com/cli/get-started/): `netlify dev`.

### 3. Deploy to Netlify

1. Fork this repo and import it into Netlify (**Add new site → Import an existing project**). The build settings come from `netlify.toml`.
2. Add the environment variables below under **Site configuration → Environment variables**, then redeploy.
3. Add `https://<your-site>.netlify.app/callback` to your Spotify app's redirect URIs.

## BPM lookup

When a song isn't already known, the app tries these in order and stops at the first answer:

1. This device's cache (re-checked against the shared lists weekly)
2. Your shared Firebase database (if configured)
3. The community master list
4. The built-in song list
5. [GetSongBPM](https://getsongbpm.com/api) (if configured)
6. An AI estimate from Claude (if configured)

Tempos above 140 are halved, following West Coast Swing convention. Steps 2, 5 and 6 are optional. Leave a variable unset and that step is skipped.

| Environment variable | What it's for | Where to get it |
| --- | --- | --- |
| `FIREBASE_DB_URL` | Shared BPM list for your DJs | Firebase Realtime Database URL (see below) |
| `GETSONGBPM_API_KEY` | Tempo lookups for songs not in the list | Free at [getsongbpm.com/api](https://getsongbpm.com/api) |
| `ANTHROPIC_API_KEY` | Last-resort AI tempo estimate | [console.anthropic.com](https://console.anthropic.com) |
| `ANTHROPIC_MODEL` | Optional: override the Claude model | Defaults to `claude-sonnet-5-5` |
| `MASTER_DB_URL` | Optional: a different community master list, or `off` to skip it | Defaults to the WOW Player list |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Artist images and album names in OtsAV DJ mode | Your Spotify app's settings page |

Keys stay on the server inside the Netlify Function and are never sent to the browser.

### Setting up the shared database (optional)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com), then add a **Realtime Database**.
2. Copy its URL (e.g. `https://your-project-default-rtdb.firebaseio.com`) into `FIREBASE_DB_URL`.
3. Apply the included rules so anyone can read the list but nobody can delete it or write junk:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy --only database --project <your-project-id>
   ```

   Rules live in `database.rules.json`. Don't leave the database in Firebase's open "test mode".

To bulk-load a playlist's tempos from the command line, use `tools/import_bpm.py` (instructions at the top of the file).

## Tips for events

- Press **F11** in the browser for a clean full-screen display.
- Set your community's name and logo in the player's branding settings. To change the default logo for everyone, replace `public/wow-logo.jpeg`.
- Each DJ can log out and the next DJ logs in with their own Spotify account.

## License

[MIT](LICENSE). Use it, change it, share it.
