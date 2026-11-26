# Draftline

A distraction-free typewriter for Google Docs. People sign in with Google, open or create a doc, and type. Text saves into the doc automatically.

**Easiest way to put it online:** the Google Apps Script version in [`apps-script/`](apps-script/SETUP.md). It takes about 3 minutes and needs no Google Cloud setup or hosting. The rest of this README covers the standalone web version.

## Features

- Sign in with Google. Open any Google Doc with the Google Picker or start a new one.
- Writing goes to the end of the chosen doc. Autosave runs every 5, 15 or 60 seconds, and when the tab is hidden.
- Typewriter key sounds, generated in the browser. No audio files.
- Forward-only mode blocks backspace, delete, arrow keys and undo.
- Focus fade dims every line except the one you're on.
- Night and Paper themes. Typewriter, serif and sans fonts.
- Local mode works without Google. The draft stays in the browser, and "Save now" downloads a .txt file.
- If someone edits the doc at the same time, Draftline finds its text again and keeps saving in the right spot.

## Privacy

The app uses the `drive.file` scope. It can only touch docs the user opens through the picker or creates in the app. It can't see anything else in their Drive. No server, no database. Everything runs in the browser.

## Setup (about 15 minutes)

You need a Google Cloud project. All three values go into `config.js`.

1. Go to https://console.cloud.google.com and create a project.
2. **APIs & Services > Library.** Enable **Google Docs API**, **Google Drive API** and **Google Picker API**.
3. **APIs & Services > OAuth consent screen.**
   - Pick **Internal** if only people in your Google Workspace domain will use it. No Google review needed.
   - Pick **External** for anyone with a Google account. Add the `.../auth/drive.file` scope. This scope is non-sensitive, so verification is light.
4. **Credentials > Create credentials > OAuth client ID.** Type: Web application. Under **Authorized JavaScript origins** add the URL you'll host on, for example `https://yourname.github.io` and `http://localhost:8000` for testing. Copy the client ID into `CLIENT_ID`.
5. **Credentials > Create credentials > API key.** Restrict it to the Google Picker API and to your site's URL. Copy it into `API_KEY`.
6. **Project settings** (gear icon on the dashboard). Copy the **Project number** into `APP_ID`.

## Run locally

```
python3 -m http.server 8000
```

Open http://localhost:8000. Opening the file directly with `file://` won't work with Google sign-in.

## Host it

It's a static site, so GitHub Pages works: repo **Settings > Pages**, deploy from this branch, root folder. Add the Pages URL to the OAuth client's JavaScript origins.

## School district note

If students sign in with district Google accounts, a Workspace admin may need to allow the app under **Admin console > Security > API controls > App access control**. Under-18 accounts often block unconfigured third-party apps by default. Give your admin the OAuth client ID.
