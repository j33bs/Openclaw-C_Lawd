#!/usr/bin/env python3
"""Local Ollama embeddings driver for the KB backend."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from urllib import error, request

DEFAULT_OLLAMA_MODEL = "nomic-embed-text"
DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_TIMEOUT_SECONDS = 30.0


def _normalize_base_url(value: str | None) -> str:
    base_url = (value or DEFAULT_OLLAMA_BASE_URL).strip()
    if base_url and "://" not in base_url:
        base_url = f"http://{base_url}"
    base_url = base_url.rstrip("/")
    if base_url.endswith("/v1"):
        base_url = base_url[:-3]
    return base_url or DEFAULT_OLLAMA_BASE_URL


def _env_default(*names: str) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return None


@dataclass(slots=True)
class OllamaEmbeddingDriver:
    """Thin client around Ollama's native `/api/embeddings` endpoint."""

    base_url: str = DEFAULT_OLLAMA_BASE_URL
    model: str = DEFAULT_OLLAMA_MODEL
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS

    @property
    def embeddings_url(self) -> str:
        return f"{_normalize_base_url(self.base_url)}/api/embeddings"

    @property
    def tags_url(self) -> str:
        return f"{_normalize_base_url(self.base_url)}/api/tags"

    def _post_json(self, url: str, payload: dict[str, object]) -> dict[str, object]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = request.Request(
            url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
            raise RuntimeError(
                f"Ollama embeddings request failed with HTTP {exc.code}: {detail or exc.reason}"
            ) from exc
        except OSError as exc:
            raise RuntimeError(f"Unable to reach Ollama at {self.base_url}: {exc}") from exc

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Invalid Ollama response: {raw[:200]!r}") from exc
        if not isinstance(parsed, dict):
            raise RuntimeError("Ollama response was not a JSON object")
        return parsed

    def _get_json(self, url: str) -> dict[str, object]:
        req = request.Request(url, method="GET")
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
            raise RuntimeError(
                f"Ollama request failed with HTTP {exc.code}: {detail or exc.reason}"
            ) from exc
        except OSError as exc:
            raise RuntimeError(f"Unable to reach Ollama at {self.base_url}: {exc}") from exc

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Invalid Ollama response: {raw[:200]!r}") from exc
        if not isinstance(parsed, dict):
            raise RuntimeError("Ollama response was not a JSON object")
        return parsed

    def embed(self, text: str) -> list[float]:
        """Embed one text string through Ollama."""
        payload = self._post_json(self.embeddings_url, {"model": self.model, "prompt": text})
        embedding = payload.get("embedding")
        if not isinstance(embedding, list) or not embedding:
            raise RuntimeError("Ollama response missing embedding vector")
        vector: list[float] = []
        for value in embedding:
            try:
                vector.append(float(value))
            except (TypeError, ValueError) as exc:
                raise RuntimeError("Ollama embedding vector contained a non-numeric value") from exc
        return vector

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        return [self.embed(text) for text in texts]

    def status(self) -> dict[str, object]:
        """Probe the Ollama endpoint and report the configured embedding model."""
        try:
            parsed = self._get_json(self.tags_url)
            models = parsed.get("models")
            model_names: list[str] = []
            if isinstance(models, list):
                for item in models:
                    if isinstance(item, dict):
                        name = item.get("name") or item.get("model")
                        if name:
                            model_names.append(str(name))
            return {
                "status": "ready",
                "base_url": _normalize_base_url(self.base_url),
                "model": self.model,
                "available_models": model_names,
            }
        except Exception as exc:  # pragma: no cover - status is diagnostic only
            return {
                "status": "unavailable",
                "base_url": _normalize_base_url(self.base_url),
                "model": self.model,
                "error": str(exc),
            }


def build_ollama_driver(
    *,
    base_url: str | None = None,
    model: str | None = None,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> OllamaEmbeddingDriver:
    raw_base_url = base_url or _env_default("OLLAMA_BASE_URL", "OLLAMA_HOST")
    return OllamaEmbeddingDriver(
        base_url=_normalize_base_url(raw_base_url),
        model=(model or _env_default("OLLAMA_EMBEDDING_MODEL") or DEFAULT_OLLAMA_MODEL).strip(),
        timeout_seconds=timeout_seconds,
    )
