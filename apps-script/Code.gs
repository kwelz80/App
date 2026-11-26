/**
 * Draftline for Google Apps Script.
 * Paste this into Code.gs, add Index.html, then Deploy > New deployment > Web app.
 */

const DOCS_API = 'https://docs.googleapis.com/v1/documents';
const RECENT_KEY = 'draftline.recent';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Draftline')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- called from the page ---------- */

function getUser() {
  return { email: Session.getActiveUser().getEmail(), recent: getRecent_() };
}

function createDoc(title) {
  const d = DocumentApp.create(title || 'Untitled draft');
  return openDoc(d.getId());
}

function openDoc(urlOrId) {
  const id = extractId_(urlOrId);
  if (!id) throw new Error('That does not look like a Google Doc link.');
  const d = docsGet_(id);
  const end = endIndex_(d);
  const empty = end <= 2;
  rememberDoc_(id, d.title);
  return {
    id: id,
    title: d.title,
    start: end - 1,
    prefix: empty ? '' : '\n\n',
    written: '',
    revision: d.revisionId,
    empty: empty,
  };
}

/**
 * Replace this session's range in the doc with `text`.
 * Takes and returns the session state the page holds.
 */
function saveText(state, text) {
  delete state.moved;
  const body = clean_(text);
  const build = function () { return body ? state.prefix + body : ''; };
  try {
    writeRange_(state, build());
  } catch (e) {
    if (e.status !== 400) throw e;
    reanchor_(state);
    writeRange_(state, build());
  }
  return state;
}

/* ---------- Docs API helpers ---------- */

function api_(url, method, payload) {
  const res = UrlFetchApp.fetch(url, {
    method: method || 'get',
    contentType: 'application/json',
    payload: payload ? JSON.stringify(payload) : undefined,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const json = JSON.parse(res.getContentText() || '{}');
  if (code >= 300) {
    const err = new Error((json.error && json.error.message) || 'HTTP ' + code);
    err.status = code;
    throw err;
  }
  return json;
}

function docsGet_(id) {
  return api_(DOCS_API + '/' + id);
}

function endIndex_(d) {
  const c = d.body.content;
  return c[c.length - 1].endIndex;
}

function writeRange_(state, next) {
  const prev = state.written;
  if (next === prev) return;
  let same = 0;
  while (same < prev.length && same < next.length && prev[same] === next[same]) same++;

  const requests = [];
  if (prev.length > same) {
    requests.push({ deleteContentRange: { range: { startIndex: state.start + same, endIndex: state.start + prev.length } } });
  }
  if (next.length > same) {
    requests.push({ insertText: { location: { index: state.start + same }, text: next.slice(same) } });
  }
  const res = api_(DOCS_API + '/' + state.id + ':batchUpdate', 'post', {
    requests: requests,
    writeControl: { requiredRevisionId: state.revision },
  });
  state.revision = res.writeControl.requiredRevisionId;
  state.written = next;
}

// Someone else edited the doc. Find our text again, or start fresh at the end.
function reanchor_(state) {
  const d = docsGet_(state.id);
  state.revision = d.revisionId;
  if (!state.written) { state.start = endIndex_(d) - 1; return; }
  let text = '';
  const idx = [];
  d.body.content.forEach(function (block) {
    ((block.paragraph && block.paragraph.elements) || []).forEach(function (pe) {
      const s = pe.textRun && pe.textRun.content;
      if (!s) return;
      for (let i = 0; i < s.length; i++) idx.push(pe.startIndex + i);
      text += s;
    });
  });
  const pos = text.lastIndexOf(state.written);
  if (pos >= 0) {
    state.start = idx[pos];
  } else {
    state.start = endIndex_(d) - 1;
    state.prefix = '\n\n';
    state.written = '';
    state.moved = true;
  }
}

/* ---------- small helpers ---------- */

function clean_(s) {
  return String(s || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
}

function extractId_(s) {
  s = String(s || '').trim();
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}

function getRecent_() {
  try { return JSON.parse(PropertiesService.getUserProperties().getProperty(RECENT_KEY) || '[]'); }
  catch (e) { return []; }
}

function rememberDoc_(id, title) {
  const list = getRecent_().filter(function (x) { return x.id !== id; });
  list.unshift({ id: id, title: title });
  PropertiesService.getUserProperties().setProperty(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
}

// Never called. It makes Apps Script ask for Google Docs access when users first open the app.
function authHint_() { DocumentApp.getActiveDocument(); }
