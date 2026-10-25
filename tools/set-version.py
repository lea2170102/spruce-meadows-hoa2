#!/usr/bin/env python3
"""Spruce Meadows HOA - set the website's version label (for developers only).

Board members never need this. It is used when the website's CODE changes,
so that every visitor's browser downloads the new files together instead of
mixing new pages with old saved copies of the code.

It adds (or updates) "?v=LABEL" on:
  - every <link href="css/..."> and <script src="js/..."> in the .html pages
  - every link from one code file to another ( from "./x.js" / from "../x.js" )

Every reference must carry the SAME label. If two files pointed to the same
code with different labels, the browser could load it twice.

Usage (from the website's top folder):
  python3 tools/set-version.py 2026-11-01        # set the label everywhere
  python3 tools/set-version.py --check           # report problems, change nothing
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML_REF = re.compile(r'((?:href|src)="(?:css|js)/[^"?]+)(\?v=[^"]*)?(")')
JS_REF = re.compile(r'(from\s+"\.{1,2}/[^"?]+\.js)(\?v=[^"]*)?(")')
LABEL = re.compile(r'^[0-9A-Za-z._-]{1,40}$')


def files():
    html = sorted(ROOT.glob("*.html"))
    js = sorted(p for p in (ROOT / "js").rglob("*.js"))
    return [(p, HTML_REF) for p in html] + [(p, JS_REF) for p in js]


def check():
    labels, problems, count = set(), [], 0
    for path, pattern in files():
        for m in pattern.finditer(path.read_text(encoding="utf-8")):
            count += 1
            if not m.group(2):
                problems.append(f"{path.relative_to(ROOT)}: no version label on {m.group(1)}")
            else:
                labels.add(m.group(2)[3:])
    if len(labels) > 1:
        problems.append("different labels in use: " + ", ".join(sorted(labels)))
    return count, labels, problems


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    if sys.argv[1] == "--check":
        count, labels, problems = check()
        print(f"{count} references checked; label(s): {', '.join(sorted(labels)) or 'none'}")
        for p in problems:
            print("PROBLEM:", p)
        return 1 if problems else 0
    label = sys.argv[1]
    if not LABEL.match(label):
        print("Use only letters, numbers, dots, dashes or underscores, e.g. 2026-11-01")
        return 2
    changed = 0
    for path, pattern in files():
        text = path.read_text(encoding="utf-8")
        new = pattern.sub(lambda m: f"{m.group(1)}?v={label}{m.group(3)}", text)
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed += 1
    count, labels, problems = check()
    print(f"Updated {changed} files; {count} references now use label: {', '.join(sorted(labels))}")
    for p in problems:
        print("PROBLEM:", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
