// Citation formatting for APA 7, MLA 9, Chicago 17 (notes-bibliography), Harvard (Cite Them Right),
// IEEE, AMA 11, and ASA. Output is HTML (italics only); all user text is escaped.

export type SourceType = "website" | "book" | "journal";
export type Style = "apa" | "mla" | "chicago" | "harvard" | "ieee" | "ama" | "asa";

export interface Person {
  first: string;
  last: string;
}

export interface Source {
  type: SourceType;
  authors: Person[];
  title: string;
  container: string;
  publisher: string;
  place: string;
  edition: string;
  volume: string;
  issue: string;
  pages: string;
  year: string;
  month: string;
  day: string;
  url: string;
  doi: string;
  accessed: string;
}

export const STYLES: { id: Style; name: string }[] = [
  { id: "apa", name: "APA 7th" },
  { id: "mla", name: "MLA 9th" },
  { id: "chicago", name: "Chicago 17th" },
  { id: "harvard", name: "Harvard" },
  { id: "ieee", name: "IEEE" },
  { id: "ama", name: "AMA 11th" },
  { id: "asa", name: "ASA" },
];

export function emptySource(type: SourceType = "website"): Source {
  return {
    type,
    authors: [{ first: "", last: "" }],
    title: "",
    container: "",
    publisher: "",
    place: "",
    edition: "",
    volume: "",
    issue: "",
    pages: "",
    year: "",
    month: "",
    day: "",
    url: "",
    doi: "",
    accessed: new Date().toISOString().slice(0, 10),
  };
}

// ---------- helpers ----------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MLA_MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const IEEE_MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const it = (s: string) => (s ? `<i>${esc(s)}</i>` : "");
const clean = (s: string) => s.trim().replace(/\s+/g, " ");

/** Adds a period unless the text already ends with terminal punctuation. */
function dot(s: string): string {
  if (!s) return s;
  return /[.?!]$/.test(s.replace(/<\/?i>/g, "").replace(/["”']$/, "")) ? s : `${s}.`;
}

/** "Title" with the period inside the quotes, unless the title ends in ? or !. */
function quotedTitle(title: string, punct = "."): string {
  const t = esc(clean(title));
  if (!t) return "";
  return /[?!]$/.test(t) ? `“${t}”` : `“${t}${punct}”`;
}

function ordinal(n: string): string {
  const num = parseInt(n, 10);
  if (!num) return esc(clean(n));
  const s = ["th", "st", "nd", "rd"];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

const hasEdition = (s: Source) => !!s.edition.trim() && parseInt(s.edition, 10) !== 1;
const pagesRange = (p: string, dash = "–") => clean(p).replace(/\s*[-–—]\s*/g, dash);
const doiUrl = (doi: string) => `https://doi.org/${doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`;
const bareDoi = (doi: string) => doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
const link = (s: Source) => (s.doi.trim() ? doiUrl(s.doi) : clean(s.url));

function monthIdx(s: Source): number {
  const m = parseInt(s.month, 10);
  return m >= 1 && m <= 12 ? m - 1 : -1;
}
const day = (s: Source) => parseInt(s.day, 10) || 0;

function accessedParts(s: Source): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.accessed);
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}

/** "March 5, 2023" or "March 2023" or "2023". */
function mdy(s: Source, months = MONTHS): string {
  const mi = monthIdx(s);
  if (!s.year) return "";
  if (mi < 0) return s.year;
  return day(s) ? `${months[mi]} ${day(s)}, ${s.year}` : `${months[mi]} ${s.year}`;
}
/** "5 Mar. 2023". */
function dmy(s: Source, months = MLA_MONTHS): string {
  const mi = monthIdx(s);
  if (!s.year) return "";
  if (mi < 0) return s.year;
  return day(s) ? `${day(s)} ${months[mi]} ${s.year}` : `${months[mi]} ${s.year}`;
}
function accessedMdy(s: Source, months = MONTHS) {
  const a = accessedParts(s);
  return a ? `${months[a.m]} ${a.d}, ${a.y}` : "";
}
function accessedDmy(s: Source, months = MONTHS) {
  const a = accessedParts(s);
  return a ? `${a.d} ${months[a.m]} ${a.y}` : "";
}

function people(s: Source): Person[] {
  return s.authors
    .map((p) => ({ first: clean(p.first), last: clean(p.last) }))
    .filter((p) => p.first || p.last);
}
const isOrg = (p: Person) => !p.first || !p.last;
const orgName = (p: Person) => p.last || p.first;

function initials(first: string, { dots = true, spaced = true } = {}): string {
  return first
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split("-")
        .map((h) => (h[0] ? h[0].toUpperCase() + (dots ? "." : "") : ""))
        .join("-"),
    )
    .join(spaced ? " " : "");
}

const lastFirst = (p: Person) => (isOrg(p) ? orgName(p) : `${p.last}, ${p.first}`);
const firstLast = (p: Person) => (isOrg(p) ? orgName(p) : `${p.first} ${p.last}`);
const surname = (p: Person) => (isOrg(p) ? orgName(p) : p.last);

function list(items: string[], { conj = "and", serial = true } = {}): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]}${serial && conj === "&" ? "," : ""} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}${serial ? "," : ""} ${conj} ${items.at(-1)}`;
}

// ---------- author lists per style ----------

function authorsApa(ps: Person[]): string {
  const one = (p: Person) => (isOrg(p) ? orgName(p) : `${p.last}, ${initials(p.first)}`);
  if (ps.length > 20) return `${ps.slice(0, 19).map(one).join(", ")}, . . . ${one(ps.at(-1)!)}`;
  return list(ps.map(one), { conj: "&" });
}
function authorsMla(ps: Person[]): string {
  if (ps.length === 1) return lastFirst(ps[0]);
  if (ps.length === 2) return `${lastFirst(ps[0])}, and ${firstLast(ps[1])}`;
  return `${lastFirst(ps[0])}, et al`;
}
function authorsChicago(ps: Person[]): string {
  if (ps.length > 10) return `${[lastFirst(ps[0]), ...ps.slice(1, 7).map(firstLast)].join(", ")}, et al`;
  if (ps.length === 1) return lastFirst(ps[0]);
  if (ps.length === 2) return `${lastFirst(ps[0])}, and ${firstLast(ps[1])}`;
  return list([lastFirst(ps[0]), ...ps.slice(1).map(firstLast)]);
}
function authorsHarvard(ps: Person[]): string {
  const one = (p: Person) => (isOrg(p) ? orgName(p) : `${p.last}, ${initials(p.first, { spaced: false })}`);
  if (ps.length >= 4) return `${one(ps[0])} et al.`;
  return list(ps.map(one), { serial: false });
}
function authorsIeee(ps: Person[]): string {
  const one = (p: Person) => (isOrg(p) ? orgName(p) : `${initials(p.first)} ${p.last}`);
  if (ps.length >= 7) return `${one(ps[0])} et al.`;
  return list(ps.map(one));
}
function authorsAma(ps: Person[]): string {
  const one = (p: Person) => (isOrg(p) ? orgName(p) : `${p.last} ${initials(p.first, { dots: false, spaced: false })}`);
  if (ps.length > 6) return `${ps.slice(0, 3).map(one).join(", ")}, et al`;
  return ps.map(one).join(", ");
}
function authorsAsa(ps: Person[]): string {
  if (ps.length === 1) return lastFirst(ps[0]);
  if (ps.length === 2) return `${lastFirst(ps[0])}, and ${firstLast(ps[1])}`;
  return list([lastFirst(ps[0]), ...ps.slice(1).map(firstLast)]);
}

// ---------- in-text ----------

function names(ps: Person[], { conj = "and", etAl = 3, serialComma = false } = {}): string {
  const sn = ps.map(surname);
  if (sn.length >= etAl) return `${sn[0]} et al.`;
  if (sn.length === 2) return `${sn[0]} ${conj} ${sn[1]}`;
  if (sn.length === 3) return `${sn[0]}, ${sn[1]}${serialComma ? "," : ""} ${conj} ${sn[2]}`;
  return sn[0] ?? "";
}

function shortTitle(s: Source, italic: boolean, punct = ""): string {
  const words = clean(s.title).split(" ");
  const short = words.length > 4 ? words.slice(0, 4).join(" ") : clean(s.title);
  return italic ? `${it(short)}${punct}` : `“${esc(short)}${punct}”`;
}
const titleItalic = (s: Source) => s.type !== "journal";

export function inText(s: Source, style: Style, n = 1): string {
  const ps = people(s);
  const year = s.year || "n.d.";
  const who = (opts: Parameters<typeof names>[1]) => (ps.length ? esc(names(ps, opts)) : shortTitle(s, titleItalic(s)));
  switch (style) {
    case "apa":
      return `(${who({ conj: "&", etAl: 3 })}, ${esc(year)})`;
    case "mla":
      return `(${who({ conj: "and", etAl: 3 })})`;
    case "chicago":
      return ps.length
        ? `${esc(names(ps, { etAl: 4, serialComma: true }))}, ${shortTitle(s, titleItalic(s), ".")}`
        : shortTitle(s, titleItalic(s), ".");
    case "harvard":
      return `(${who({ conj: "and", etAl: 4 })}, ${s.year ? esc(s.year) : "no date"})`;
    case "ieee":
      return `[${n}]`;
    case "ama":
      return `<sup>${n}</sup>`;
    case "asa":
      return `(${who({ conj: "and", etAl: 3 })} ${s.year ? esc(s.year) : "N.d."})`;
  }
}

// ---------- references ----------

export function reference(s: Source, style: Style): string {
  const ps = people(s);
  const title = clean(s.title);
  const container = clean(s.container);
  const publisher = clean(s.publisher);
  const place = clean(s.place);
  const vol = clean(s.volume);
  const iss = clean(s.issue);
  const url = clean(s.url);
  const L = link(s);

  switch (style) {
    case "apa": {
      const date =
        s.type === "website" && s.year && monthIdx(s) >= 0
          ? `${s.year}, ${MONTHS[monthIdx(s)]}${day(s) ? ` ${day(s)}` : ""}`
          : s.year || "n.d.";
      const A = ps.length ? dot(esc(authorsApa(ps))) : "";
      const ed = hasEdition(s) ? ` (${ordinal(s.edition)} ed.)` : "";
      if (s.type === "journal") {
        const head = A ? `${A} (${esc(date)}). ${dot(esc(title))}` : `${dot(esc(title))} (${esc(date)}).`;
        const src = [
          it(container),
          vol ? `, ${it(vol)}` : "",
          iss ? `(${esc(iss)})` : "",
          s.pages ? `, ${esc(pagesRange(s.pages))}` : "",
        ].join("");
        return [head, src ? `${src}.` : "", esc(L)].filter(Boolean).join(" ");
      }
      const t = `${it(title)}${ed}`;
      const head = A ? `${A} (${esc(date)}). ${dot(t)}` : `${dot(t)} (${esc(date)}).`;
      const tail = s.type === "book" ? publisher : container;
      return [head, tail ? dot(esc(tail)) : "", esc(L)].filter(Boolean).join(" ");
    }

    case "mla": {
      const A = ps.length ? dot(esc(authorsMla(ps))) : "";
      if (s.type === "book") {
        const parts = [hasEdition(s) ? `${ordinal(s.edition)} ed.` : "", esc(publisher), esc(s.year)].filter(Boolean);
        return [A, dot(it(title)), parts.length ? `${parts.join(", ")}.` : ""].filter(Boolean).join(" ");
      }
      if (s.type === "journal") {
        const parts = [
          it(container),
          vol ? `vol. ${esc(vol)}` : "",
          iss ? `no. ${esc(iss)}` : "",
          esc(dmy(s) || s.year),
          s.pages ? `pp. ${esc(pagesRange(s.pages))}` : "",
          s.doi.trim() ? esc(doiUrl(s.doi)) : esc(url.replace(/^https?:\/\//, "")),
        ].filter(Boolean);
        return [A, quotedTitle(title), `${parts.join(", ")}.`].filter(Boolean).join(" ");
      }
      const parts = [it(container), esc(dmy(s)), esc(url.replace(/^https?:\/\//, ""))].filter(Boolean);
      const accessed = !s.year && accessedDmy(s, MLA_MONTHS) ? ` Accessed ${accessedDmy(s, MLA_MONTHS)}.` : "";
      return [A, quotedTitle(title), parts.length ? `${parts.join(", ")}.${accessed}` : accessed.trim()]
        .filter(Boolean)
        .join(" ");
    }

    case "chicago": {
      const A = ps.length ? dot(esc(authorsChicago(ps))) : "";
      if (s.type === "book") {
        const pub = [place && publisher ? `${place}: ${publisher}` : publisher || place, s.year].filter(Boolean).join(", ");
        return [A, dot(it(title)), hasEdition(s) ? `${ordinal(s.edition)} ed.` : "", pub ? `${esc(pub)}.` : "", L ? `${esc(L)}.` : ""]
          .filter(Boolean)
          .join(" ");
      }
      if (s.type === "journal") {
        const when = monthIdx(s) >= 0 ? `${MONTHS[monthIdx(s)]} ${s.year}` : s.year;
        const src = `${it(container)}${vol ? ` ${esc(vol)}` : ""}${iss ? `, no. ${esc(iss)}` : ""}${when ? ` (${esc(when)})` : ""}${s.pages ? `: ${esc(pagesRange(s.pages))}` : ""}`;
        return [A, quotedTitle(title), `${src}.`, L ? `${esc(L)}.` : ""].filter(Boolean).join(" ");
      }
      const date = s.year ? `${esc(mdy(s))}.` : accessedMdy(s) ? `Accessed ${accessedMdy(s)}.` : "";
      return [A, quotedTitle(title), container ? `${esc(container)}.` : "", date, url ? `${esc(url)}.` : ""]
        .filter(Boolean)
        .join(" ");
    }

    case "harvard": {
      const year = `(${s.year ? esc(s.year) : "no date"})`;
      const A = ps.length ? esc(authorsHarvard(ps)) : "";
      const accessed = accessedDmy(s) ? ` (Accessed: ${accessedDmy(s)})` : "";
      if (s.type === "book") {
        const head = A ? `${A} ${year} ${it(title)}.` : `${it(title)} ${year}.`;
        const pub = place && publisher ? `${place}: ${publisher}` : publisher || place;
        return [head, hasEdition(s) ? `${ordinal(s.edition)} edn.` : "", pub ? `${esc(pub)}.` : ""].filter(Boolean).join(" ");
      }
      if (s.type === "journal") {
        const head = A ? `${A} ${year} '${esc(title)}',` : `'${esc(title)}' ${year},`;
        const src = [
          `${it(container)}`,
          vol ? `${esc(vol)}${iss ? `(${esc(iss)})` : ""}` : iss ? `(${esc(iss)})` : "",
          s.pages ? `pp. ${esc(pagesRange(s.pages))}` : "",
        ]
          .filter(Boolean)
          .join(", ");
        const avail = s.doi.trim() ? ` Available at: ${esc(doiUrl(s.doi))}.` : url ? ` Available at: ${esc(url)}${accessed}.` : "";
        return `${head} ${src}.${avail}`;
      }
      const head = A ? `${A} ${year} ${it(title)}.` : `${it(title)} ${year}.`;
      return `${head}${url ? ` Available at: ${esc(url)}${accessed}.` : ""}`;
    }

    case "ieee": {
      const A = ps.length ? `${esc(authorsIeee(ps))}, ` : "";
      if (s.type === "book") {
        const pub = [place && publisher ? `${place}: ${publisher}` : publisher || place, s.year].filter(Boolean).join(", ");
        return `${A}${it(title)}${hasEdition(s) ? `, ${ordinal(s.edition)} ed` : ""}.${pub ? ` ${esc(pub)}.` : ""}`;
      }
      if (s.type === "journal") {
        const when = monthIdx(s) >= 0 ? `${IEEE_MONTHS[monthIdx(s)]} ${s.year}` : s.year;
        const parts = [
          it(container),
          vol ? `vol. ${esc(vol)}` : "",
          iss ? `no. ${esc(iss)}` : "",
          s.pages ? `pp. ${esc(pagesRange(s.pages))}` : "",
          esc(when),
          s.doi.trim() ? `doi: ${esc(bareDoi(s.doi))}` : "",
        ].filter(Boolean);
        return `${A}${quotedTitle(title, ",")} ${parts.join(", ")}.`;
      }
      const accessed = accessedMdy(s, IEEE_MONTHS);
      return [
        `${A}${quotedTitle(title, ",")}`,
        container ? `${esc(container)}.` : "",
        accessed ? `Accessed: ${accessed}.` : "",
        url ? `[Online]. Available: ${esc(url)}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    case "ama": {
      const A = ps.length ? dot(esc(authorsAma(ps))) : "";
      if (s.type === "book") {
        const pub = [publisher, s.year].filter(Boolean).join("; ");
        return [A, dot(it(title)), hasEdition(s) ? `${ordinal(s.edition)} ed.` : "", pub ? `${esc(pub)}.` : ""].filter(Boolean).join(" ");
      }
      if (s.type === "journal") {
        const loc = `${esc(s.year)}${vol ? `;${esc(vol)}` : ""}${iss ? `(${esc(iss)})` : ""}${s.pages ? `:${esc(pagesRange(s.pages, "-"))}` : ""}`;
        return [A, dot(esc(title)), dot(it(container)), `${loc}.`, s.doi.trim() ? `doi:${esc(bareDoi(s.doi))}` : url ? esc(url) : ""]
          .filter(Boolean)
          .join(" ");
      }
      return [
        A,
        dot(esc(title)),
        container ? dot(esc(container)) : "",
        s.year ? `Published ${esc(mdy(s))}.` : "",
        accessedMdy(s) ? `Accessed ${accessedMdy(s)}.` : "",
        esc(url),
      ]
        .filter(Boolean)
        .join(" ");
    }

    case "asa": {
      const year = s.year ? `${esc(s.year)}.` : "N.d.";
      const A = ps.length ? dot(esc(authorsAsa(ps))) : "";
      if (s.type === "book") {
        const pub = place && publisher ? `${place}: ${publisher}` : publisher || place;
        return [A, year, dot(it(title)), hasEdition(s) ? `${ordinal(s.edition)} ed.` : "", pub ? `${esc(pub)}.` : ""]
          .filter(Boolean)
          .join(" ");
      }
      if (s.type === "journal") {
        const src = `${it(container)}${vol ? ` ${esc(vol)}` : ""}${iss ? `(${esc(iss)})` : ""}${s.pages ? `:${esc(pagesRange(s.pages))}` : ""}`;
        return [A, year, quotedTitle(title), `${src}.`, s.doi.trim() ? `doi:${esc(bareDoi(s.doi))}.` : ""]
          .filter(Boolean)
          .join(" ");
      }
      const retrieved = accessedMdy(s) ? `Retrieved ${accessedMdy(s)}${url ? ` (${esc(url)})` : ""}.` : url ? `(${esc(url)}).` : "";
      return [A, year, quotedTitle(title), container ? dot(it(container)) : "", retrieved].filter(Boolean).join(" ");
    }
  }
}

/** Sort key for author-date bibliographies. */
export function sortKey(s: Source): string {
  const p = people(s)[0];
  return (p ? surname(p) : s.title).toLowerCase().replace(/^(the|a|an)\s+/, "");
}

export const numbered = (style: Style) => style === "ieee" || style === "ama";

export function htmlToText(html: string): string {
  return html
    .replace(/<sup>(.*?)<\/sup>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// ---------- parsing helpers used by the lookup route ----------

const ORG_WORDS =
  /\b(news|staff|team|inc|llc|ltd|university|college|association|organi[sz]ation|department|agency|institute|society|council|committee|foundation|center|centre|press|editors?|group|corporation|company|bureau|office|ministry|board)\b/i;

export function splitName(raw: string): Person {
  const name = clean(raw.replace(/^by\s+/i, ""));
  if (!name) return { first: "", last: "" };
  if (name.includes(",")) {
    const [last, first] = name.split(",", 2).map(clean);
    if (first && !ORG_WORDS.test(name)) return { first, last };
  }
  const words = name.split(" ");
  if (words.length === 1 || words.length > 4 || ORG_WORDS.test(name)) return { first: "", last: name };
  return { first: words.slice(0, -1).join(" "), last: words.at(-1)! };
}

export function parseDate(raw: string | undefined): { year: string; month: string; day: string } {
  const none = { year: "", month: "", day: "" };
  if (!raw) return none;
  const s = raw.trim();
  let m = /^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?/.exec(s);
  if (m) return { year: m[1], month: m[2] ? String(+m[2]) : "", day: m[3] ? String(+m[3]) : "" };
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return { year: String(d.getUTCFullYear()), month: String(d.getUTCMonth() + 1), day: String(d.getUTCDate()) };
  }
  m = /\b(1[5-9]\d\d|20\d\d)\b/.exec(s);
  return m ? { year: m[1], month: "", day: "" } : none;
}
