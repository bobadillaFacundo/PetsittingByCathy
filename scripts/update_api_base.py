#!/usr/bin/env python3
"""Reemplaza URLs hardcodeadas del backend por API_BASE / mediaUrl."""
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "frontend" / "src"
OLD = "https://petsittingbycathy.onrender.com"


def api_import_line(path: Path) -> str:
    rel = os.path.relpath(ROOT / "lib/api.js", path.parent).replace("\\", "/")
    if not rel.startswith("."):
        rel = "./" + rel
    rel = rel.removesuffix(".js")
    return f"import {{ API_BASE, mediaUrl }} from '{rel}';\n"


def transform(text: str) -> str:
    out = text.replace(f"`{OLD}/", "`${API_BASE}/")
    out = out.replace(OLD, "${API_BASE}")
    out = re.sub(
        r"src=\{`\$\{API_BASE\}\$\{([^}]+)\}`\}",
        r"src={mediaUrl(\1)}",
        out,
    )
    return out


def main():
    for path in sorted(ROOT.rglob("*")):
        if path.suffix not in {".js", ".jsx"}:
            continue
        if path.name == "api.js" and path.parent.name == "lib":
            continue
        text = path.read_text(encoding="utf-8")
        if OLD not in text:
            continue
        new_text = transform(text)
        if "API_BASE" in new_text and "from" not in new_text.split("API_BASE")[0][-80:]:
            lines = new_text.splitlines(keepends=True)
            last_import = 0
            for i, line in enumerate(lines):
                if line.startswith("import "):
                    last_import = i
            lines.insert(last_import + 1, api_import_line(path))
            new_text = "".join(lines)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
            print("updated", path.relative_to(ROOT.parent.parent))


if __name__ == "__main__":
    main()
