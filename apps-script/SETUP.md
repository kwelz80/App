# Put Draftline online with Google Apps Script

About 3 minutes. No Google Cloud project, no API keys, no hosting. Do this while signed in to the Google account that should own the app.

1. Go to https://script.google.com and click **New project**.
2. Click **Untitled project** at the top and rename it **Draftline**.
3. Open `Code.gs` in the editor. Delete what's there. Paste in everything from [Code.gs](https://raw.githubusercontent.com/kwelz80/App/claude/focused-hawking-lk77z1/apps-script/Code.gs).
4. Click the **+** next to **Files**, pick **HTML**, and name it `Index`. Delete what's there. Paste in everything from [Index.html](https://raw.githubusercontent.com/kwelz80/App/claude/focused-hawking-lk77z1/apps-script/Index.html).
5. Click the save icon.
6. Click **Deploy > New deployment**. Click the gear next to "Select type" and pick **Web app**.
   - **Execute as:** User accessing the web app
   - **Who has access:** "Anyone within your district" for students and staff, or "Anyone with Google account" for everyone
7. Click **Deploy**. Google asks you to authorize. Click through and allow it.
8. Copy the **Web app URL**. That's the link you share.

The first time each person opens the link, Google asks them to allow Draftline to see and edit their Google Docs. After that it just opens.

## Updating later

Paste the new code, then go to **Deploy > Manage deployments**, click the pencil, set Version to **New version**, and click **Deploy**. The link stays the same.

## If students get blocked

District admins often block outside apps for student accounts. If students see "This app is blocked," send your Google Workspace admin the project name and ask them to trust it under **Admin console > Security > API controls > App access control**.

## How saving works

- The app can only open docs the person already has edit access to.
- Writing goes at the end of the doc. It saves every 15 seconds by default, and when the person switches tabs.
- If someone else edits the doc at the same time, Draftline finds its text again and keeps saving in the right spot.
