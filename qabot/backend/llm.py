"""Thin wrapper around the Anthropic SDK for Claude Sonnet 5.5."""
import logging
import os

import anthropic

logger = logging.getLogger(__name__)

MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5")
MAX_TOKENS = 16000

# Server-side fallback: if Sonnet 5.5's safety classifiers decline a benign request,
# the API retries it on Anthropic's recommended fallback model automatically.
FALLBACK_BETA = "server-side-fallback-2026-07-01"

_client: anthropic.Anthropic | None = None


class LLMConfigError(RuntimeError):
    """The API key is missing."""


class LLMRefusal(RuntimeError):
    """Claude declined the request (stop_reason == "refusal")."""


def _api_key() -> str | None:
    # ANTHROPIC_API_KEY is the SDK default; CLAUDE_API_KEY is kept for existing .env files.
    return os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        api_key = _api_key()
        if not api_key:
            raise LLMConfigError("ANTHROPIC_API_KEY (or CLAUDE_API_KEY) is not configured.")
        _client = anthropic.Anthropic(api_key=api_key, timeout=120.0, max_retries=2)
    return _client


def generate(system: str, prompt: str, effort: str = "low") -> str:
    """Send a single-turn request and return the concatenated text output.

    `effort` trades depth for latency/cost: "low" suits grounded Q&A,
    "medium" suits summarization over long text.
    """
    response = get_client().beta.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": effort},
        betas=[FALLBACK_BETA],
        fallbacks="default",
    )

    if response.stop_reason == "refusal":
        category = getattr(response.stop_details, "category", None) if response.stop_details else None
        logger.warning("Claude declined the request (category=%s)", category)
        raise LLMRefusal(category or "unspecified")

    if response.stop_reason == "max_tokens":
        logger.warning("Claude response hit max_tokens and may be truncated")

    # Read blocks by type: responses can start with (empty) thinking blocks.
    return "".join(block.text for block in response.content if block.type == "text").strip()
