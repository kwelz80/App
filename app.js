/* Draftline: a typewriter-style writer that saves into Google Docs. */
(() => {
  "use strict";

  const CFG = window.DRAFTLINE_CONFIG || {};
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const DOCS_API = "https://docs.googleapis.com/v1/documents";
  const LS = {
    settings: "draftline.settings",
    draft: "draftline.draft",
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    body: document.body,
    editor: $("editor"),
    paper: $("paper"),
    welcome: $("welcome"),
    docName: $("docName"),
    status: $("status"),
    words: $("wordCount"),
    signIn: $("btnSignIn"),
    signOut: $("btnSignOut"),
    pick: $("btnPick"),
    newDoc: $("btnNew"),
    local: $("btnLocal"),
    settingsBtn: $("btnSettings"),
    settings: $("settings"),
    saveNow: $("btnSaveNow"),
    optSound: $("optSound"),
    optForward: $("optForward"),
    optFocus: $("optFocus"),
    optTheme: $("optTheme"),
    optFont: $("optFont"),
    optSave: $("optSave"),
  };

  /* ---------- storage helpers (never throw) ---------- */
  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  /* ---------- settings ---------- */
  const settings = Object.assign(
    { sound: true, forward: false, focus: true, theme: "dark", font: "mono", save: 15 },
    store.get(LS.settings, {})
  );

  function applySettings() {
    el.optSound.checked = settings.sound;
    el.optForward.checked = settings.forward;
    el.optFocus.checked = settings.focus;
    el.optTheme.value = settings.theme;
    el.optFont.value = settings.font;
    el.optSave.value = String(settings.save);
    el.body.dataset.theme = settings.theme;
    el.body.dataset.font = settings.font;
    el.body.classList.toggle("focus", settings.focus);
    store.set(LS.settings, settings);
    restartAutosave();
  }

  el.optSound.onchange = () => { settings.sound = el.optSound.checked; applySettings(); };
  el.optForward.onchange = () => { settings.forward = el.optForward.checked; applySettings(); moveCaretToEnd(); };
  el.optFocus.onchange = () => { settings.focus = el.optFocus.checked; applySettings(); };
  el.optTheme.onchange = () => { settings.theme = el.optTheme.value; applySettings(); };
  el.optFont.onchange = () => { settings.font = el.optFont.value; applySettings(); };
  el.optSave.onchange = () => { settings.save = Number(el.optSave.value); applySettings(); };
  el.settingsBtn.onclick = () => el.settings.showModal();

  /* ---------- sound (synthesized, no audio files) ---------- */
  let audio = null;
  function ctx() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    return audio;
  }
  function noiseBurst(ac, { dur, freq, q, gain, when = 0 }) {
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    const g = ac.createGain(); g.gain.value = gain;
    src.connect(bp).connect(g).connect(ac.destination);
    src.start(ac.currentTime + when);
  }
  function tone(ac, { freq, dur, gain, when = 0 }) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine"; o.frequency.value = freq;
    const t = ac.currentTime + when;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur);
  }
  const sound = {
    key() {
      const ac = ctx();
      noiseBurst(ac, { dur: 0.035, freq: 2200 + Math.random() * 1600, q: 1.2, gain: 0.9 });
      noiseBurst(ac, { dur: 0.02, freq: 350, q: 0.8, gain: 0.6 });
    },
    space() {
      const ac = ctx();
      noiseBurst(ac, { dur: 0.05, freq: 900, q: 0.9, gain: 0.9 });
    },
    back() {
      const ac = ctx();
      noiseBurst(ac, { dur: 0.03, freq: 1400, q: 1, gain: 0.5 });
    },
    returnKey() {
      const ac = ctx();
      tone(ac, { freq: 2093, dur: 0.9, gain: 0.12 });
      noiseBurst(ac, { dur: 0.28, freq: 600, q: 0.5, gain: 0.5, when: 0.05 });
      noiseBurst(ac, { dur: 0.05, freq: 300, q: 0.7, gain: 0.9, when: 0.32 });
    },
  };

  /* ---------- editor behavior ---------- */
  const NAV_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Backspace", "Delete"]);

  function moveCaretToEnd() {
    const n = el.editor.value.length;
    el.editor.setSelectionRange(n, n);
    el.editor.scrollTop = el.editor.scrollHeight;
  }

  el.editor.addEventListener("keydown", (e) => {
    if (settings.forward && (NAV_KEYS.has(e.key) || ((e.ctrlKey || e.metaKey) && /^[zxya]$/i.test(e.key)))) {
      e.preventDefault();
      return;
    }
    el.body.classList.add("typing");
    if (!settings.sound || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter") sound.returnKey();
    else if (e.key === " ") sound.space();
    else if (e.key === "Backspace" || e.key === "Delete") sound.back();
    else if (e.key.length === 1) sound.key();
  });

  // Covers mobile keyboards and context-menu deletes.
  el.editor.addEventListener("beforeinput", (e) => {
    if (!settings.forward) return;
    if (e.inputType.startsWith("delete") || e.inputType.startsWith("history")) e.preventDefault();
    else moveCaretToEnd();
  });

  ["mouseup", "focus", "select"].forEach((ev) =>
    el.editor.addEventListener(ev, () => { if (settings.forward) setTimeout(moveCaretToEnd, 0); })
  );

  el.editor.addEventListener("input", () => {
    const atEnd = el.editor.selectionStart === el.editor.value.length;
    if (atEnd) el.editor.scrollTop = el.editor.scrollHeight;
    updateWordCount();
    store.set(LS.draft, el.editor.value);
    dirty = true;
  });

  document.addEventListener("mousemove", () => el.body.classList.remove("typing"));

  function updateWordCount() {
    const n = (el.editor.value.trim().match(/\S+/g) || []).length;
    el.words.textContent = `${n} word${n === 1 ? "" : "s"}`;
  }

  function showPaper() {
    el.welcome.hidden = true;
    el.paper.hidden = false;
    el.editor.focus();
    moveCaretToEnd();
  }

  /* ---------- Google auth ---------- */
  let token = null;
  let tokenClient = null;
  let pendingToken = null;

  function configReady() {
    return CFG.CLIENT_ID && !CFG.CLIENT_ID.startsWith("YOUR_");
  }

  function initAuth() {
    if (!configReady()) {
      setStatus("Google sign-in is not configured. See README.");
      el.signIn.disabled = true;
      return;
    }
    if (!window.google?.accounts?.oauth2) { setTimeout(initAuth, 200); return; }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CFG.CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        const p = pendingToken; pendingToken = null;
        if (resp.error) { p?.reject(new Error(resp.error)); return; }
        token = { value: resp.access_token, expires: Date.now() + (resp.expires_in - 60) * 1000 };
        onSignedIn();
        p?.resolve(token.value);
      },
      error_callback: (err) => {
        const p = pendingToken; pendingToken = null;
        p?.reject(new Error(err.type || "auth_error"));
      },
    });
  }

  function requestToken(prompt) {
    return new Promise((resolve, reject) => {
      pendingToken = { resolve, reject };
      tokenClient.requestAccessToken({ prompt });
    });
  }

  async function getToken() {
    if (token && Date.now() < token.expires) return token.value;
    return requestToken(token ? "" : "consent");
  }

  function onSignedIn() {
    el.signIn.hidden = true;
    el.signOut.hidden = false;
    el.pick.disabled = false;
    el.newDoc.disabled = false;
    if (!doc) setStatus("Signed in");
  }

  el.signIn.onclick = () => requestToken("consent").catch((e) => setStatus(`Sign-in failed: ${e.message}`));

  el.signOut.onclick = async () => {
    if (dirty && doc) await save();
    if (token) google.accounts.oauth2.revoke(token.value, () => {});
    token = null; doc = null;
    el.signIn.hidden = false;
    el.signOut.hidden = true;
    el.pick.disabled = true;
    el.newDoc.disabled = true;
    el.docName.textContent = "No doc selected";
    el.paper.hidden = true;
    el.welcome.hidden = false;
    setStatus("Signed out");
  };

  async function api(url, opts = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const t = await getToken();
      const res = await fetch(url, {
        ...opts,
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(opts.headers || {}) },
      });
      if (res.status === 401 && attempt === 0) { token = null; continue; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(body.error?.message || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return body;
    }
  }

  /* ---------- Google Picker ---------- */
  let pickerLoaded = null;
  function loadPicker() {
    if (!pickerLoaded) {
      pickerLoaded = new Promise((resolve) => {
        const wait = () => (window.gapi ? gapi.load("picker", resolve) : setTimeout(wait, 200));
        wait();
      });
    }
    return pickerLoaded;
  }

  el.pick.onclick = async () => {
    try {
      const t = await getToken();
      await loadPicker();
      const view = new google.picker.DocsView(google.picker.ViewId.DOCUMENTS)
        .setMode(google.picker.DocsViewMode.LIST);
      new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(t)
        .setDeveloperKey(CFG.API_KEY)
        .setAppId(CFG.APP_ID)
        .setTitle("Pick a Google Doc to write in")
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) openDoc(data.docs[0].id);
        })
        .build()
        .setVisible(true);
    } catch (e) {
      setStatus(`Could not open picker: ${e.message}`);
    }
  };

  el.newDoc.onclick = async () => {
    const title = prompt("Name your new doc", `Draft ${new Date().toLocaleDateString()}`);
    if (title == null) return;
    try {
      setStatus("Creating doc...");
      const created = await api(DOCS_API, { method: "POST", body: JSON.stringify({ title: title || "Untitled draft" }) });
      await openDoc(created.documentId);
    } catch (e) {
      setStatus(`Could not create doc: ${e.message}`);
    }
  };

  el.local.onclick = () => {
    doc = null;
    el.docName.textContent = "Local draft (saved in this browser)";
    showPaper();
  };

  /* ---------- Writing into the doc ----------
   * Each session writes into one range at the end of the doc.
   * On every save we replace that range with the full session text,
   * so backspace and edits in the editor carry over correctly.
   */
  let doc = null;        // { id, title, start, written, revision }
  let dirty = false;
  let saving = false;

  function docEndIndex(d) {
    const c = d.body.content;
    return c[c.length - 1].endIndex;
  }

  // Map the doc body to a flat string plus the doc index of each char.
  function flattenDoc(d) {
    let text = "";
    const idx = [];
    for (const block of d.body.content) {
      for (const pe of block.paragraph?.elements || []) {
        const s = pe.textRun?.content;
        if (!s) continue;
        for (let i = 0; i < s.length; i++) idx.push(pe.startIndex + i);
        text += s;
      }
    }
    return { text, idx };
  }

  async function openDoc(id) {
    try {
      if (dirty && doc) await save();
      setStatus("Opening doc...");
      const d = await api(`${DOCS_API}/${id}`);
      const end = docEndIndex(d);
      const empty = end <= 2;
      doc = {
        id,
        title: d.title,
        start: end - 1,
        prefix: empty ? "" : "\n\n",
        written: "",
        revision: d.revisionId,
      };
      el.docName.textContent = d.title;
      setStatus(empty ? "Ready" : "New writing goes at the end of this doc");
      if (el.editor.value.trim() && !confirm("Add the text already in the editor to this doc?\n\nCancel starts a blank page.")) {
        el.editor.value = "";
        store.set(LS.draft, "");
        updateWordCount();
      }
      dirty = el.editor.value.length > 0;
      showPaper();
    } catch (e) {
      setStatus(`Could not open doc: ${e.message}`);
    }
  }

  function cleanText(s) {
    // Docs rejects most control chars. Keep \n and \t.
    return s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
  }

  async function save() {
    if (!doc || saving || !dirty) return;
    saving = true;
    dirty = false;
    const body = cleanText(el.editor.value);
    const next = body ? doc.prefix + body : "";
    try {
      setStatus("Saving...");
      await writeRange(next);
      setStatus(`Saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
    } catch (e) {
      dirty = true;
      setStatus(`Save failed: ${e.message}`);
    } finally {
      saving = false;
    }
  }

  async function writeRange(next, retried = false) {
    const prev = doc.written;
    if (next === prev) return;

    // Only touch the part that changed.
    let same = 0;
    while (same < prev.length && same < next.length && prev[same] === next[same]) same++;

    const requests = [];
    if (prev.length > same) {
      requests.push({ deleteContentRange: { range: { startIndex: doc.start + same, endIndex: doc.start + prev.length } } });
    }
    if (next.length > same) {
      requests.push({ insertText: { location: { index: doc.start + same }, text: next.slice(same) } });
    }

    try {
      const res = await api(`${DOCS_API}/${doc.id}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests, writeControl: { requiredRevisionId: doc.revision } }),
      });
      doc.revision = res.writeControl.requiredRevisionId;
      doc.written = next;
    } catch (e) {
      // Someone else edited the doc. Find our text again and retry once.
      if (e.status === 400 && !retried) {
        await reanchor();
        return writeRange(next, true);
      }
      throw e;
    }
  }

  async function reanchor() {
    const d = await api(`${DOCS_API}/${doc.id}`);
    doc.revision = d.revisionId;
    if (!doc.written) { doc.start = docEndIndex(d) - 1; return; }
    const { text, idx } = flattenDoc(d);
    const pos = text.lastIndexOf(doc.written);
    if (pos >= 0) {
      doc.start = idx[pos];
    } else {
      // Our earlier text was changed by someone else. Start a fresh block at the end.
      doc.start = docEndIndex(d) - 1;
      doc.prefix = "\n\n";
      doc.written = "";
      setStatus("Doc changed elsewhere. Continuing at the end.");
    }
  }

  el.saveNow.onclick = async () => {
    if (doc) { dirty = true; await save(); return; }
    // Local mode: download a text file.
    const blob = new Blob([el.editor.value], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "draft.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  let autosaveTimer = null;
  function restartAutosave() {
    clearInterval(autosaveTimer);
    autosaveTimer = setInterval(save, settings.save * 1000);
  }

  document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
  window.addEventListener("beforeunload", (e) => {
    if (doc && (dirty || saving)) { save(); e.preventDefault(); e.returnValue = ""; }
  });

  function setStatus(msg) { el.status.textContent = msg; }

  /* ---------- boot ---------- */
  el.editor.value = store.get(LS.draft, "");
  updateWordCount();
  applySettings();
  initAuth();
})();
