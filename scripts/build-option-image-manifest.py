#!/usr/bin/env python3
"""Build a static manifest of per-option (and question-text) image files.

Option images are named:

    {subject}/{chapterId}_{questionId}_optimg_{optionNumber}_{n}.{ext}
    {subject}/{chapterId}_{questionId}_opt_{optionNumber}_{n}.{ext}   (older files)

and extra question-text panels are:

    {subject}/{chapterId}_{questionId}_qtext_{n}.{ext}

Nothing in the database points at these files, so the frontend resolves them
from this manifest instead (see src/lib/option-images.ts). Regenerate with:

    python3 scripts/build-option-image-manifest.py

Reads public/img/data by default; pass --dir to point at another image tree.
"""

import argparse
import json
import os
import re

SUBJECTS = ("physics", "chemistry", "biology")
OPT_RE = re.compile(
    r"^(?P<chapter>\d+)_(?P<question>\d+)_(?:optimg|opt)_(?P<opt>\d+)_(?P<n>\d+)"
    r"\.(?P<ext>png|jpe?g|webp|svg)$",
    re.I,
)
QTEXT_RE = re.compile(
    r"^(?P<chapter>\d+)_(?P<question>\d+)_qtext_(?P<n>\d+)\.(?P<ext>png|jpe?g|webp|svg)$",
    re.I,
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="public/img/data")
    ap.add_argument("--out", default="src/lib/option-images.json")
    args = ap.parse_args()

    options: dict[str, dict[str, str]] = {}
    qtext: dict[str, list[str]] = {}

    for subject in SUBJECTS:
        folder = os.path.join(args.dir, subject)
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            path = f"{subject}/{name}"
            m = OPT_RE.match(name)
            if m:
                if int(m.group("n")) != 1:
                    continue  # extra panels of the same option
                qid = str(int(m.group("question")))
                # stored 0-based so the frontend can index straight into options[]
                idx = str(int(m.group("opt")) - 1)
                options.setdefault(qid, {}).setdefault(idx, path)
                continue
            m = QTEXT_RE.match(name)
            if m:
                qid = str(int(m.group("question")))
                qtext.setdefault(qid, []).append(path)

    payload = {"options": options, "qtext": qtext}
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"), sort_keys=True)
        fh.write("\n")

    print(
        f"questions with option images={len(options)} "
        f"option files={sum(len(v) for v in options.values())} "
        f"qtext questions={len(qtext)} -> {args.out}"
    )


if __name__ == "__main__":
    main()
