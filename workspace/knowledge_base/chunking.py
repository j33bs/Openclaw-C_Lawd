#!/usr/bin/env python3
"""Chunk refreshed KB documents into embedding-sized records."""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Iterable, Mapping

DEFAULT_MAX_CHARS = 1200
DEFAULT_OVERLAP_CHARS = 160


@dataclass(slots=True)
class ChunkRecord:
    """A single chunk ready for embedding and storage."""

    document_id: str
    source_path: str
    title: str
    entity_type: str
    chunk_index: int
    text: str
    start_char: int
    end_char: int

    def as_metadata(self) -> dict[str, Any]:
        return {
            "document_id": self.document_id,
            "source_path": self.source_path,
            "title": self.title,
            "entity_type": self.entity_type,
            "chunk_index": self.chunk_index,
            "start_char": self.start_char,
            "end_char": self.end_char,
        }


def normalize_text(text: str) -> str:
    """Normalize whitespace while keeping markdown structure readable."""
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip()


def _split_long_block(block: str, max_chars: int) -> list[str]:
    if len(block) <= max_chars:
        return [block]

    sentences = re.split(r"(?<=[.!?])\s+", block)
    pieces: list[str] = []
    current = ""
    for sentence in sentences:
        candidate = f"{current} {sentence}".strip() if current else sentence
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            pieces.append(current)
        if len(sentence) <= max_chars:
            current = sentence
            continue
        start = 0
        while start < len(sentence):
            pieces.append(sentence[start : start + max_chars])
            start += max_chars
        current = ""
    if current:
        pieces.append(current)
    return pieces


def chunk_text(
    text: str,
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap_chars: int = DEFAULT_OVERLAP_CHARS,
) -> list[str]:
    """Split text into chunks with a small overlap between neighbors."""
    normalized = normalize_text(text)
    if not normalized:
        return []

    blocks: list[str] = []
    for raw_block in re.split(r"\n{2,}", normalized):
        block = raw_block.strip()
        if not block:
            continue
        blocks.extend(_split_long_block(block, max_chars))

    chunks: list[str] = []
    current = ""
    for block in blocks:
        candidate = f"{current}\n\n{block}".strip() if current else block
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            chunks.append(current)
        if overlap_chars and chunks:
            overlap = chunks[-1][-overlap_chars:].strip()
            current = f"{overlap}\n\n{block}".strip() if overlap else block
        else:
            current = block
    if current:
        chunks.append(current)
    return [chunk for chunk in chunks if chunk]


def _document_text(entity: Mapping[str, Any]) -> str:
    title = str(entity.get("name") or "").strip()
    content = str(entity.get("content") or "").strip()
    source_path = str(entity.get("source_path") or "").strip()
    parts = [part for part in (title, source_path, content) if part]
    return normalize_text("\n\n".join(parts))


def chunk_entity(
    entity: Mapping[str, Any],
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap_chars: int = DEFAULT_OVERLAP_CHARS,
) -> list[ChunkRecord]:
    """Create chunk records for a refreshed KB entity."""
    document_id = str(entity.get("id") or entity.get("source_path") or "").strip()
    if not document_id:
        raise ValueError("entity is missing an id or source_path")

    source_path = str(entity.get("source_path") or document_id).strip()
    title = str(entity.get("name") or source_path).strip()
    entity_type = str(entity.get("entity_type") or "doc").strip()
    text = _document_text(entity)
    chunks = chunk_text(text, max_chars=max_chars, overlap_chars=overlap_chars)
    if not chunks:
        return []

    records: list[ChunkRecord] = []
    cursor = 0
    for index, chunk in enumerate(chunks):
        start = text.find(chunk, cursor)
        if start < 0:
            start = cursor
        end = min(len(text), start + len(chunk))
        cursor = end
        records.append(
            ChunkRecord(
                document_id=document_id,
                source_path=source_path,
                title=title,
                entity_type=entity_type,
                chunk_index=index,
                text=chunk,
                start_char=start,
                end_char=end,
            )
        )
    return records


def chunk_entities(
    entities: Iterable[Mapping[str, Any]],
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap_chars: int = DEFAULT_OVERLAP_CHARS,
) -> list[ChunkRecord]:
    """Chunk a collection of entities."""
    records: list[ChunkRecord] = []
    for entity in entities:
        records.extend(chunk_entity(entity, max_chars=max_chars, overlap_chars=overlap_chars))
    return records

