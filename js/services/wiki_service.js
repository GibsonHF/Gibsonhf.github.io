'use strict';

const WIKI_API = 'https://runescape.wiki/api.php';
const WIKI_BASE = 'https://runescape.wiki/w/';

const cache = new Map();

const INFOBOX_PATTERN = /\{\{Infobox\s+(Scenery|NPC|Item|Guild|Location|City|Area|Building)/i;

function cleanWikitext(value) {
    if (!value) return value;
    return value
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/\{\{[^}]+\}\}/g, '')
        .replace(/'{2,}/g, '')
        .trim();
}

function extractField(wikitext, field) {
    const pattern = new RegExp(`\\|\\s*${field}\\s*=\\s*([^\\n|]+)`, 'i');
    const match = wikitext.match(pattern);
    return match ? cleanWikitext(match[1].trim()) : null;
}

async function fetchPage(title) {
    const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&origin=*`;
    let res;
    try {
        res = await fetch(url);
    } catch {
        return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    return data?.parse?.wikitext?.['*'] || null;
}

async function fetchWiki(name) {
    const searchUrl = `${WIKI_API}?action=opensearch&search=${encodeURIComponent(name)}&limit=5&format=json&origin=*`;

    let searchRes;
    try {
        searchRes = await fetch(searchUrl);
    } catch {
        return null;
    }

    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const titles = searchData[1];
    if (!titles || titles.length === 0) return null;

    for (const title of titles) {
        const wikitext = await fetchPage(title);
        if (!wikitext) continue;
        if (/\{\{[Dd]isambig/.test(wikitext)) continue;
        if (!INFOBOX_PATTERN.test(wikitext)) continue;

        const examine = extractField(wikitext, 'examine');
        const members = extractField(wikitext, 'members');

        const idMatch = wikitext.match(/\|\s*id\s*=\s*([^\n|]+)/i);
        const ids = idMatch
            ? idMatch[1].trim().split(',').map(s => s.trim()).filter(Boolean)
            : [];

        return {
            title,
            wikiUrl: WIKI_BASE + encodeURIComponent(title.replace(/ /g, '_')),
            examine,
            members,
            ids,
        };
    }

    return null;
}

export async function lookupWiki(name) {
    const key = name.toLowerCase();

    if (cache.has(key)) {
        return cache.get(key);
    }

    const promise = fetchWiki(name).then((result) => {
        if (!result) cache.delete(key);
        return result;
    }).catch(() => {
        cache.delete(key);
        return null;
    });

    cache.set(key, promise);
    return promise;
}
