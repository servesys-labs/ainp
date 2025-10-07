#!/usr/bin/env python3
"""
Builds a combined Web4 WHITEPAPER.md from a template with include directives.

Usage:
  python scripts/build_whitepaper.py --template docs/web4/WHITEPAPER.template.md --out docs/web4/WHITEPAPER.md

Include directives (in the template):
  <!-- INCLUDE path -->
      Includes the entire file.

  <!-- INCLUDE path:Heading Name -->
      Includes the section that starts at the heading whose text matches
      "Heading Name" (case sensitive), ending before the next heading of
      the same or higher level.

This keeps source of truth in the original docs and assembles a whitepaper view.
"""

import argparse
import io
import os
import re
import sys

INCLUDE_RE = re.compile(r"^\s*<!--\s*INCLUDE\s+([^:>]+?)(?::([^>]+?))?\s*-->\s*$")


def read_file(path: str) -> str:
    with io.open(path, 'r', encoding='utf-8') as f:
        return f.read()


def find_section(content: str, heading: str) -> str:
    lines = content.splitlines()
    # Find the heading line that matches heading text, starting with one or more #
    start_idx = None
    start_level = None
    heading_pattern = re.compile(r"^(#+)\s+(.+?)\s*$")
    for i, line in enumerate(lines):
        m = heading_pattern.match(line)
        if m and m.group(2).strip() == heading.strip():
            start_idx = i
            start_level = len(m.group(1))
            break
    if start_idx is None:
        raise ValueError(f"Heading not found: {heading}")

    # Collect until next heading of same or higher level
    end_idx = len(lines)
    for j in range(start_idx + 1, len(lines)):
        m = heading_pattern.match(lines[j])
        if m and len(m.group(1)) <= start_level:
            end_idx = j
            break

    return "\n".join(lines[start_idx:end_idx]) + "\n"


def process_template(template_path: str, out_path: str):
    template_dir = os.path.dirname(template_path) or "."
    template = read_file(template_path)
    out_lines = []
    for line in template.splitlines():
        m = INCLUDE_RE.match(line)
        if not m:
            out_lines.append(line)
            continue

        rel_path = m.group(1).strip()
        heading = m.group(2).strip() if m.group(2) else None
        src_path = rel_path
        if not os.path.isabs(src_path):
            src_path = os.path.normpath(os.path.join(template_dir, src_path))
        if not os.path.exists(src_path):
            out_lines.append(f"<!-- INCLUDE ERROR: missing file {src_path} -->")
            continue
        src = read_file(src_path)
        try:
            if heading:
                included = find_section(src, heading)
            else:
                included = src
        except Exception as e:
            included = f"<!-- INCLUDE ERROR: {e} in {src_path} -->\n"
        out_lines.append(included.rstrip())

    out = "\n".join(out_lines).rstrip() + "\n"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with io.open(out_path, 'w', encoding='utf-8') as f:
        f.write(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--template', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    process_template(args.template, args.out)


if __name__ == '__main__':
    main()
