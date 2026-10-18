import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { parseDate, splitName, type Person, type Source } from "@/lib/citation";
import { guard, jsonError } from "@/lib/server/guard";

export const maxDuration = 30;

const Body = z.object({ query: z.string().min(1).max(2000) });
const UA = "Mozilla/5.0 (compatible; StudyDeskCitationBot/1.0)";

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;

  let query: string;
  try {
    query = Body.parse(await req.json()).query.trim();
  } catch {
    return jsonError(400, "Enter a URL, DOI, or ISBN.");
  }

  try {
    const doi = /\b(10\.\d{4,9}\/[^\s"<>]+)/i.exec(query)?.[1]?.replace(/[.,;]+$/, "");
    if (doi) return Response.json({ source: await fromDoi(doi) });

    const isbn = query.replace(/[\s-]/g, "").replace(/^isbn:?/i, "");
    if (/^(\d{9}[\dX]|\d{13})$/i.test(isbn)) return Response.json({ source: await fromIsbn(isbn) });

    const url = /^https?:\/\//i.test(query) ? query : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(query) ? `https://${query}` : null;
    if (url) return Response.json({ source: await fromUrl(url) });

    return jsonError(400, "That doesn't look like a URL, DOI, or ISBN.");
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return jsonError(504, "The lookup took too long. Try again or enter the details by hand.");
    }
    if (err instanceof TypeError) {
      return jsonError(502, "Couldn't reach that site or lookup service. Enter the details by hand.");
    }
    return jsonError(502, err instanceof Error ? err.message : "Lookup failed.");
  }
}

// ---------- DOI via Crossref ----------

interface CrossrefWork {
  type?: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  "container-title"?: string[];
  publisher?: string;
  "publisher-location"?: string;
  volume?: string;
  issue?: string;
  page?: string;
  edition?: string;
  URL?: string;
  issued?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
}

async function fromDoi(doi: string): Promise<Partial<Source>> {
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(res.status === 404 ? "No record found for that DOI." : "DOI lookup failed.");
  const w = ((await res.json()) as { message: CrossrefWork }).message;
  const parts = (w["published-print"] ?? w.issued ?? w["published-online"])?.["date-parts"]?.[0] ?? [];
  const isBook = /book|monograph|edited-book|reference-book/.test(w.type ?? "");
  return {
    type: isBook ? "book" : "journal",
    authors: (w.author ?? []).map((a) => (a.family ? { first: a.given ?? "", last: a.family } : { first: "", last: a.name ?? "" })),
    title: w.title?.[0] ?? "",
    container: isBook ? "" : (w["container-title"]?.[0] ?? ""),
    publisher: w.publisher ?? "",
    place: w["publisher-location"] ?? "",
    edition: w.edition ?? "",
    volume: w.volume ?? "",
    issue: w.issue ?? "",
    pages: w.page ?? "",
    year: parts[0] ? String(parts[0]) : "",
    month: parts[1] ? String(parts[1]) : "",
    day: parts[2] ? String(parts[2]) : "",
    doi,
    url: w.URL ?? "",
  };
}

// ---------- ISBN via Open Library ----------

interface OpenLibraryBook {
  title?: string;
  subtitle?: string;
  authors?: { name: string }[];
  publishers?: { name: string }[];
  publish_places?: { name: string }[];
  publish_date?: string;
  url?: string;
}

async function fromIsbn(isbn: string): Promise<Partial<Source>> {
  const key = `ISBN:${isbn.toUpperCase()}`;
  const res = await fetch(`https://openlibrary.org/api/books?bibkeys=${key}&format=json&jscmd=data`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error("ISBN lookup failed.");
  const b = ((await res.json()) as Record<string, OpenLibraryBook>)[key];
  if (!b) throw new Error("No book found for that ISBN.");
  const date = parseDate(b.publish_date);
  return {
    type: "book",
    authors: (b.authors ?? []).map((a) => splitName(a.name)),
    title: b.subtitle ? `${b.title}: ${b.subtitle}` : (b.title ?? ""),
    publisher: b.publishers?.[0]?.name ?? "",
    place: b.publish_places?.[0]?.name ?? "",
    year: date.year,
  };
}

// ---------- Web page metadata ----------

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

async function assertPublic(url: URL) {
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http and https links work.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error("Couldn't find that website.");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("That address isn't allowed.");
}

async function fetchPage(start: string): Promise<{ html: string; finalUrl: URL }> {
  let url = new URL(start);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(10_000),
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) throw new Error(`The page returned an error (${res.status}). Enter the details by hand.`);
    if (!/html/i.test(res.headers.get("content-type") ?? "")) throw new Error("That link isn't a web page.");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Empty page.");
    const decoder = new TextDecoder();
    let html = "";
    while (html.length < 1_500_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    return { html, finalUrl: url };
  }
  throw new Error("Too many redirects.");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function metaTags(html: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
    }
    const key = (attrs.name || attrs.property || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content) out.set(key, [...(out.get(key) ?? []), decodeEntities(attrs.content)]);
  }
  return out;
}

interface LdNode {
  "@type"?: string | string[];
  "@graph"?: LdNode[];
  headline?: string;
  name?: string;
  datePublished?: string;
  author?: LdNode | LdNode[] | string;
  publisher?: LdNode | string;
}

function jsonLd(html: string): LdNode | undefined {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes: LdNode[] = (Array.isArray(data) ? data : [data]).flatMap((n: LdNode) => n["@graph"] ?? [n]);
      const article = nodes.find((n) => /Article|BlogPosting|Report|WebPage/.test(String(n["@type"])) && (n.headline || n.author));
      if (article) return article;
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return undefined;
}

function ldName(v: LdNode | string | undefined): string {
  return typeof v === "string" ? v : (v?.name ?? "");
}

async function fromUrl(raw: string): Promise<Partial<Source>> {
  const { html, finalUrl } = await fetchPage(raw);
  const meta = metaTags(html);
  const get = (...keys: string[]) => keys.map((k) => meta.get(k)?.[0]).find(Boolean) ?? "";
  const ld = jsonLd(html);

  const doi = get("citation_doi", "dc.identifier").match(/10\.\d{4,9}\/\S+/)?.[0];
  if (doi && get("citation_journal_title")) {
    try {
      return { ...(await fromDoi(doi)), url: finalUrl.href };
    } catch {
      // fall back to page metadata
    }
  }

  let authors: Person[] = (meta.get("citation_author") ?? []).map(splitName);
  if (!authors.length && ld?.author) {
    authors = (Array.isArray(ld.author) ? ld.author : [ld.author]).map((a) => splitName(ldName(a))).filter((p) => p.last);
  }
  if (!authors.length) {
    const a = get("author", "dc.creator", "parsely-author", "sailthru.author", "article:author");
    if (a && !/^https?:/.test(a)) authors = a.split(/\s*(?:,| and |;)\s*/).filter(Boolean).map(splitName);
  }

  const date = parseDate(
    get("citation_publication_date", "citation_date", "article:published_time", "date", "dc.date", "pubdate") ||
      ld?.datePublished,
  );
  const titleTag = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const journal = get("citation_journal_title");
  const site = get("og:site_name", "application-name") || ldName(ld?.publisher) || finalUrl.hostname.replace(/^www\./, "");
  const first = get("citation_firstpage");
  const last = get("citation_lastpage");

  return {
    type: journal ? "journal" : "website",
    authors: authors.length ? authors : [{ first: "", last: "" }],
    title: get("citation_title", "og:title", "twitter:title", "dc.title") || ld?.headline || titleTag,
    container: journal || site,
    publisher: get("citation_publisher", "dc.publisher"),
    volume: get("citation_volume"),
    issue: get("citation_issue"),
    pages: first ? (last ? `${first}-${last}` : first) : "",
    ...date,
    doi: doi ?? "",
    url: finalUrl.href,
  };
}
