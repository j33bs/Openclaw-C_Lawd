from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def write_text_atomic_verified(
    path: Path | str,
    text: str,
    *,
    encoding: str = "utf-8",
) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{target.name}.",
        suffix=".tmp",
        dir=str(target.parent),
        text=True,
    )
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding=encoding) as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, target)
        observed = target.read_text(encoding=encoding)
        if _sha256_text(observed) != _sha256_text(text):
            raise IOError(f"verification read-back mismatch for {target}")
        return target
    except Exception:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except OSError:
            pass
        raise


def write_json_atomic_verified(
    path: Path | str,
    payload: Any,
    *,
    indent: int = 2,
    ensure_ascii: bool = True,
    trailing_newline: bool = True,
) -> Path:
    text = json.dumps(payload, indent=indent, ensure_ascii=ensure_ascii)
    if trailing_newline:
        text += "\n"
    return write_text_atomic_verified(path, text)


__all__ = ["write_json_atomic_verified", "write_text_atomic_verified"]
