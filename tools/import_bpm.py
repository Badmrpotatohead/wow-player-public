"""
WOW Player — Exportify CSV to Firebase BPM Importer
=====================================================
Usage:
  1. Export a playlist from exportify.app with "Include audio features data" checked
  2. Set FIREBASE_DB_URL to your Realtime Database URL, e.g.
       PowerShell:  $env:FIREBASE_DB_URL = "https://your-project-default-rtdb.firebaseio.com"
       bash:        export FIREBASE_DB_URL=https://your-project-default-rtdb.firebaseio.com
  3. Run: python import_bpm.py your_playlist.csv

Rules:
  - Tempo > 140 is halved (WCS convention — avoids double-time readings)
  - Tempo is rounded to nearest integer
  - Skips tracks with no Tempo value
  - Firebase key format matches bpm-lookup.js exactly
  - Source is tagged as "exportify-import" in the DB

This script writes directly to Firebase — no app or server needed.
"""

import csv
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

FIREBASE_DB = os.environ.get("FIREBASE_DB_URL", "").rstrip("/")

# ── Clean helpers (must match bpm-lookup.js exactly) ──────────────────────

def clean_title(title):
    t = title.lower()
    t = re.sub(r'\s*\(feat\..*?\)', '', t, flags=re.IGNORECASE)
    t = re.sub(r'\s*\(ft\..*?\)', '', t, flags=re.IGNORECASE)
    t = re.sub(r'\s*\(with.*?\)', '', t, flags=re.IGNORECASE)
    t = re.sub(r'\s*\(.*?remix.*?\)', '', t, flags=re.IGNORECASE)
    t = re.sub(r'\s*\(.*?remaster.*?\)', '', t, flags=re.IGNORECASE)
    t = re.sub(r'\s*-\s*remaster(ed)?.*$', '', t, flags=re.IGNORECASE)
    t = re.sub(r'\s*-\s*radio edit.*$', '', t, flags=re.IGNORECASE)
    t = re.sub(r'\s*-\s*stripped.*$', '', t, flags=re.IGNORECASE)
    t = re.sub(r'\s*-\s*acoustic.*$', '', t, flags=re.IGNORECASE)
    t = re.sub(r'\s*-\s*live.*$', '', t, flags=re.IGNORECASE)
    return t.strip()

def clean_artist(artist):
    a = artist.lower()
    a = re.split(r',|&| and ', a)[0]
    return a.strip()

def firebase_key(title, artist):
    key = f"{title}|||{artist}".lower().strip()
    key = re.sub(r'[.$#\[\]/]', '_', key)
    key = re.sub(r'\s+', '_', key)
    return key[:200]

def wcs_bpm(tempo):
    """Halve anything over 140 (WCS range is 60-140)."""
    return round(tempo / 2) if tempo > 140 else round(tempo)

# ── Firebase write ─────────────────────────────────────────────────────────

def write_to_firebase(key, bpm, title, artist):
    url = f"{FIREBASE_DB}/bpms/{urllib.parse.quote(key, safe='')}.json"
    payload = json.dumps({
        "bpm": bpm,
        "title": title,
        "artist": artist,
        "source": "exportify-import",
        "updated": int(time.time() * 1000)
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, method="PUT")
    req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except urllib.error.URLError as e:
        print(f"  ❌ Firebase error: {e}")
        return False

# ── Main ───────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("Usage: python import_bpm.py <exportify.csv>")
        sys.exit(1)

    if not FIREBASE_DB:
        print("Set FIREBASE_DB_URL to your Realtime Database URL first (see top of this file).")
        sys.exit(1)

    csv_path = Path(sys.argv[1])
    if not csv_path.exists():
        print(f"File not found: {csv_path}")
        sys.exit(1)

    with open(csv_path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    print(f"\n📂 Loaded {len(rows)} tracks from {csv_path.name}")

    with_tempo = [r for r in rows if r.get("Tempo", "").strip()]
    skipped_no_tempo = len(rows) - len(with_tempo)

    print(f"🎵 Tracks with Tempo: {len(with_tempo)}")
    if skipped_no_tempo:
        print(f"⏭  Skipped (no Tempo): {skipped_no_tempo}")
    print()

    imported = skipped = errors = halved = 0

    for i, row in enumerate(with_tempo, 1):
        raw_title = row.get("Track Name", "").strip()
        raw_artist = row.get("Artist Name(s)", "").strip()
        raw_tempo = row.get("Tempo", "").strip()

        if not raw_title or not raw_tempo:
            skipped += 1
            continue

        try:
            tempo = float(raw_tempo)
        except ValueError:
            skipped += 1
            continue

        was_halved = tempo > 140
        bpm = wcs_bpm(tempo)
        title = clean_title(raw_title)
        artist = clean_artist(raw_artist)
        key = firebase_key(title, artist)

        halved_note = " ✂️ halved" if was_halved else ""
        print(f"[{i}/{len(with_tempo)}] {raw_title} — {raw_artist} → {bpm} BPM{halved_note}")

        success = write_to_firebase(key, bpm, title, artist)
        if success:
            imported += 1
            if was_halved:
                halved += 1
        else:
            errors += 1

        # Small delay to avoid hammering Firebase
        time.sleep(0.05)

    print(f"\n{'='*50}")
    print(f"✅ Import complete!")
    print(f"   Imported : {imported}")
    print(f"   Halved   : {halved} (were >140 BPM)")
    print(f"   Skipped  : {skipped}")
    print(f"   Errors   : {errors}")

if __name__ == "__main__":
    main()
