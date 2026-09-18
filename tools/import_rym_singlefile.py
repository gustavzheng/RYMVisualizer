#!/usr/bin/env python3
"""Import RYM release pages saved by SingleFile into the web data store."""

from __future__ import annotations

import argparse
import base64
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INBOX = ROOT / "cache" / "rym-singlefile"
DEFAULT_DATABASE = ROOT / "web" / "public" / "data" / "albums.json"
DEFAULT_COVERS = ROOT / "web" / "public" / "covers"
DEFAULT_CRAWLER = ROOT.parent / "RYMCrawler"
DEFAULT_VISUAL = {
    "dominant": {"hex": "#777777", "weight": 1, "h": 0, "s": 0, "l": 47},
    "accent": {"hex": "#aaaaaa", "weight": 1, "h": 0, "s": 0, "l": 67},
    "palette": [{"hex": "#777777", "weight": 1, "h": 0, "s": 0, "l": 47}],
    "chromaticHue": 0, "hueDiversity": 0, "brightness": 47, "contrast": 0,
    "saturation": 0, "warmth": 50, "colorfulness": 0, "entropy": 0,
    "detail": 0, "symmetry": 50, "darkRatio": 0, "lightRatio": 0,
}


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def first_match(text: str, patterns: list[str], flags: int = re.I | re.S) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, flags)
        if match:
            return clean(re.sub(r"<[^>]+>", " ", match.group(1)))
    return None


def number(value: str | None, *, decimal: bool = False):
    if not value:
        return None
    match = re.search(r"\d[\d,]*(?:\.\d+)?", value)
    if not match:
        return None
    raw = match.group(0).replace(",", "")
    return float(raw) if decimal else int(float(raw))


def duration_seconds(value: str | None) -> int | None:
    if not value:
        return None
    parts = [int(x) for x in re.findall(r"\d+", value)]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return None


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.links: list[dict[str, str]] = []
        self.images: list[dict[str, str]] = []
        self.jsonld: list[dict] = []
        self._script_type = ""
        self._script: list[str] = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "meta":
            key = values.get("property") or values.get("name")
            if key and values.get("content"):
                self.meta[key.lower()] = values["content"]
        elif tag == "link":
            self.links.append(values)
        elif tag == "img":
            self.images.append(values)
        elif tag == "script":
            self._script_type = values.get("type", "").lower()
            self._script = []

    def handle_data(self, data):
        if self._script_type == "application/ld+json":
            self._script.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._script_type == "application/ld+json":
            try:
                value = json.loads("".join(self._script))
                values = value if isinstance(value, list) else [value]
                self.jsonld.extend(x for x in values if isinstance(x, dict))
            except json.JSONDecodeError:
                pass
        if tag == "script":
            self._script_type = ""
            self._script = []


def jsonld_album(items: list[dict]) -> dict:
    queue = list(items)
    while queue:
        item = queue.pop(0)
        graph = item.get("@graph")
        if isinstance(graph, list):
            queue.extend(x for x in graph if isinstance(x, dict))
        kind = item.get("@type", "")
        kinds = kind if isinstance(kind, list) else [kind]
        if any(str(x).lower() in {"musicalbum", "musicrelease"} for x in kinds):
            return item
    return {}


def names(value) -> list[str]:
    if not value:
        return []
    values = value if isinstance(value, list) else [value]
    result = []
    for item in values:
        name = item.get("name") if isinstance(item, dict) else item
        if clean(str(name or "")):
            result.append(clean(str(name)))
    return result


def canonical_url(parser: PageParser, raw: str) -> str | None:
    for link in parser.links:
        if "canonical" in link.get("rel", "").lower() and link.get("href"):
            return link["href"]
    return parser.meta.get("og:url") or first_match(
        raw, [r"https?://rateyourmusic\.com/release/[^\"'<> ]+/?"]
    )


def extract_id(raw: str, url: str | None) -> str | None:
    return first_match(raw, [
        r"(?:album_id|release_id)[\"'\s:=_-]+(\d+)",
        r"/release/view/(\d+)",
        r"(?:rate|catalog|release)[^\n]{0,120}?data-id=[\"'](\d+)",
    ])


def field_block(raw: str, label: str) -> str | None:
    patterns = [
        rf"class=[\"'][^\"']*info_hdr[^\"']*[\"'][^>]*>\s*{re.escape(label)}\s*</[^>]+>\s*<[^>]+>(.*?)</(?:div|td)>",
        rf">\s*{re.escape(label)}\s*</[^>]+>\s*<[^>]+>(.*?)</(?:div|td)>",
    ]
    return first_match(raw, patterns)


def extract_list_from_links(raw: str, route: str) -> list[str]:
    values = re.findall(rf"<a[^>]+href=[\"'][^\"']*/{route}/[^\"']+[\"'][^>]*>(.*?)</a>", raw, re.I | re.S)
    return list(dict.fromkeys(clean(re.sub(r"<[^>]+>", " ", x)) for x in values if clean(re.sub(r"<[^>]+>", " ", x))))


def save_embedded_cover(parser: PageParser, raw: str, album_id: str, covers: Path) -> str | None:
    candidates = []
    og = parser.meta.get("og:image")
    if og:
        candidates.append(og)
    for image in parser.images:
        marker = " ".join([image.get("class", ""), image.get("id", ""), image.get("alt", "")]).lower()
        if any(x in marker for x in ("cover", "album", "release")):
            candidates.extend([image.get("src", ""), image.get("data-src", "")])
    candidates.extend(re.findall(r"data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+", raw))
    for source in candidates:
        match = re.match(r"data:image/(jpeg|png|webp);base64,(.+)", source or "", re.I | re.S)
        if not match:
            continue
        ext = {"jpeg": "jpg"}.get(match.group(1).lower(), match.group(1).lower())
        try:
            payload = base64.b64decode(re.sub(r"\s+", "", match.group(2)), validate=True)
        except (ValueError, base64.binascii.Error):
            continue
        if len(payload) < 1024:
            continue
        covers.mkdir(parents=True, exist_ok=True)
        target = covers / f"{album_id}.{ext}"
        target.write_bytes(payload)
        return f"/covers/{target.name}"
    return None


def load_crawler(crawler_root: Path):
    """Load the canonical extractor instead of maintaining a second DOM parser."""
    if not (crawler_root / "rym_crawler" / "cli.py").is_file():
        raise RuntimeError(f"找不到 RYMCrawler：{crawler_root}")
    sys.path.insert(0, str(crawler_root))
    try:
        from rym_crawler.cli import parse_page as crawler_parse_page
        from rym_crawler.cover_cache import import_local_cover
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "RYMCrawler 依赖未安装；请用 import-rym-singlefile.cmd，"
            "或运行 uv run --project ../RYMCrawler python tools/import_rym_singlefile.py"
        ) from exc
    return crawler_parse_page, import_local_cover


def extract_user_rating(raw: str, album_id: str) -> float | int | None:
    """Read the signed-in user's RYM 0.5–5 rating and convert it to app's 1–10 scale."""
    patterns = [
        rf'id=["\']?rating_num_l_{re.escape(album_id)}["\']?[^>]*>\s*([0-5](?:\.5)?)\s*<',
        r'class=["\'][^"\']*\brating_num\b[^"\']*["\'][^>]*>\s*([0-5](?:\.5)?)\s*<',
    ]
    value = first_match(raw, patterns)
    if value is None:
        # RYM's star-Nm class stores the number of selected half-stars.
        star = re.search(
            rf'id=["\']?rating_stars_l_{re.escape(album_id)}["\']?[^>]*class=["\'][^"\']*\bstar-(\d{{1,2}})m?\b',
            raw, re.I,
        )
        if star and 1 <= int(star.group(1)) <= 10:
            return int(star.group(1))
        return None
    rating = float(value) * 2
    return int(rating) if rating.is_integer() else rating


def parse_page(path: Path, covers: Path, crawler, capture_cover: bool = True) -> dict:
    raw = path.read_text(encoding="utf-8", errors="replace")
    parser = PageParser()
    parser.feed(raw)
    url = canonical_url(parser, raw)
    details = crawler[0](raw, url or "https://rateyourmusic.com/")
    page_ids = details.get("cover_release_ids") or details.get("page_release_ids") or details.get("vote_album_ids") or []
    album_id = page_ids[0] if len(page_ids) == 1 else extract_id(raw, url)
    if not album_id:
        raise ValueError("找不到 RYM release/album ID；请确认保存的是专辑发行页，而非榜单页")
    date = details.get("release_date_raw")
    year_match = re.search(r"\b(\d{4})\b", date or "")
    cover = None
    if capture_cover:
        cover_info = crawler[1](covers.parent, album_id, path, raw, details.get("cover_url"))
        cover_path = cover_info.get("path")
        cover = "/" + cover_path.replace("\\", "/") if cover_path else None
    track_count = details.get("track_count") or 0
    total_duration = details.get("duration_seconds")
    return {
        "id": album_id,
        "title": details["title"],
        "artist": " & ".join(x["name"] for x in details.get("artists", [])),
        "year": int(year_match.group(1)) if year_match else None,
        "releaseDate": date,
        "communityRating": details.get("community_rating"),
        "ratingCount": details.get("rating_count"),
        "releaseType": details.get("release_type"),
        "genres": details.get("primary_genres", []) + details.get("secondary_genres", []),
        "descriptors": details.get("descriptors", []),
        "language": details.get("language_raw"),
        "durationSeconds": total_duration,
        "avgTrackSeconds": round(total_duration / track_count) if total_duration and track_count else None,
        "trackCount": track_count,
        "ranks": details.get("ranks", []),
        "url": details.get("canonical_url") or url,
        "cover": cover,
        "userRating": extract_user_rating(raw, album_id),
    }


def main() -> int:
    cli = argparse.ArgumentParser(description="把 SingleFile 保存的 RYM 专辑页导入网页数据库")
    cli.add_argument("files", nargs="*", type=Path, help="HTML 文件；省略时扫描 cache/rym-singlefile")
    cli.add_argument("--inbox", type=Path, default=DEFAULT_INBOX)
    cli.add_argument("--database", type=Path, default=DEFAULT_DATABASE)
    cli.add_argument("--covers", type=Path, default=DEFAULT_COVERS)
    cli.add_argument("--crawler-root", type=Path, default=DEFAULT_CRAWLER, help="RYMCrawler 项目目录")
    cli.add_argument("--user-rating", type=float, help="给本次导入的新专辑设置个人评分（0-10）")
    cli.add_argument("--dry-run", action="store_true")
    args = cli.parse_args()

    files = args.files or sorted([*args.inbox.glob("*.html"), *args.inbox.glob("*.htm")])
    if not files:
        print(f"没有找到 HTML：请把 SingleFile 页面放入 {args.inbox}", file=sys.stderr)
        return 2
    try:
        crawler = load_crawler(args.crawler_root.resolve())
        albums = json.loads(args.database.read_text(encoding="utf-8-sig")) if args.database.exists() else []
    except (json.JSONDecodeError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    by_id = {str(album.get("id")): album for album in albums}
    changed = 0
    for path in files:
        try:
            incoming = parse_page(path, args.covers, crawler, capture_cover=not args.dry_run)
            old = by_id.get(incoming["id"], {})
            merged = dict(old)
            merged.update({k: v for k, v in incoming.items() if v not in (None, "", [])})
            if "visual" not in merged:
                merged["visual"] = DEFAULT_VISUAL
            if args.user_rating is not None:
                merged["userRating"] = args.user_rating
            by_id[incoming["id"]] = merged
            changed += 1
            print(f"OK  {incoming['id']}  {incoming['artist']} — {incoming['title']}")
        except Exception as exc:
            print(f"ERR {path.name}: {exc}", file=sys.stderr)
    if changed and not args.dry_run:
        output = sorted(by_id.values(), key=lambda x: (x.get("year") or 0, str(x.get("artist", "")).casefold(), str(x.get("title", "")).casefold()))
        args.database.parent.mkdir(parents=True, exist_ok=True)
        args.database.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"已写入 {args.database}（{changed} 个页面，数据库共 {len(output)} 张专辑）")
    elif args.dry_run:
        print(f"试运行完成：解析成功 {changed} 个页面，未写入数据库")
    return 0 if changed == len(files) else 1


if __name__ == "__main__":
    raise SystemExit(main())
