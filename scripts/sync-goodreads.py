#!/usr/bin/env python3
"""Sync Goodreads shelves to reading/data.json.

Fetches 'currently-reading' and 'favorites' RSS feeds and writes
reading/data.json, which the Reading page loads client-side.
"""
import html
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

GOODREADS_ID = "202221944"
OUT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "reading", "data.json"))
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; goodreads-sync/1.0)"}


def fetch_shelf(shelf):
    url = f"https://www.goodreads.com/review/list_rss/{GOODREADS_ID}?shelf={shelf}&per_page=200"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def strip_html(text):
    if not text:
        return None
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def parse_shelf(xml_bytes):
    root = ET.fromstring(xml_bytes)
    books = []
    for item in root.findall(".//item"):
        def t(tag):
            el = item.find(tag)
            return el.text.strip() if el is not None and el.text else None

        books.append({
            "title": t("title"),
            "author": t("author_name"),
            "cover": t("book_large_image_url"),
            "link": t("link"),
            "description": strip_html(t("book_description")),
        })
    return books


if __name__ == "__main__":
    try:
        currently = parse_shelf(fetch_shelf("currently-reading"))
        favorites = parse_shelf(fetch_shelf("favorites"))
    except Exception as e:
        print(f"Error fetching Goodreads data: {e}", file=sys.stderr)
        sys.exit(1)

    data = {
        "updated": datetime.now(timezone.utc).isoformat(),
        "currently_reading": currently,
        "favorites": favorites,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Synced: {len(currently)} currently reading, {len(favorites)} favorites → {OUT}")
