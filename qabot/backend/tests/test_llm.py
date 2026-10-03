from types import SimpleNamespace

import pytest

import llm

# conftest's fake_llm fixture isn't used here: these tests exercise the real llm.generate.


class FakeMessages:
    def __init__(self, response):
        self.response = response
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return self.response


def make_client(monkeypatch, response):
    messages = FakeMessages(response)
    client = SimpleNamespace(beta=SimpleNamespace(messages=messages))
    monkeypatch.setattr(llm, "_client", client)
    return messages


def response(blocks, stop_reason="end_turn", stop_details=None):
    return SimpleNamespace(content=blocks, stop_reason=stop_reason, stop_details=stop_details)


def text(t):
    return SimpleNamespace(type="text", text=t)


def test_uses_sonnet_5_5_with_server_side_fallback(monkeypatch):
    messages = make_client(monkeypatch, response([text("ok")]))
    llm.generate("sys", "prompt", effort="medium")

    kw = messages.kwargs
    assert kw["model"] == "claude-sonnet-5-5"
    assert kw["system"] == "sys"
    assert kw["messages"] == [{"role": "user", "content": "prompt"}]
    assert kw["output_config"] == {"effort": "medium"}
    assert kw["fallbacks"] == "default"
    assert kw["betas"] == ["server-side-fallback-2026-07-01"]
    # Sonnet 5.5 rejects sampling params and disabled thinking — make sure we send neither.
    assert "temperature" not in kw
    assert "thinking" not in kw


def test_joins_text_blocks_and_skips_thinking(monkeypatch):
    blocks = [SimpleNamespace(type="thinking", thinking=""), text("Hello "), text("world")]
    make_client(monkeypatch, response(blocks))
    assert llm.generate("s", "p") == "Hello world"


def test_refusal_raises(monkeypatch):
    details = SimpleNamespace(category="cyber")
    make_client(monkeypatch, response([], stop_reason="refusal", stop_details=details))
    with pytest.raises(llm.LLMRefusal, match="cyber"):
        llm.generate("s", "p")


def test_refusal_without_details(monkeypatch):
    make_client(monkeypatch, response([], stop_reason="refusal", stop_details=None))
    with pytest.raises(llm.LLMRefusal):
        llm.generate("s", "p")


def test_truncated_response_still_returns_text(monkeypatch):
    make_client(monkeypatch, response([text("partial")], stop_reason="max_tokens"))
    assert llm.generate("s", "p") == "partial"


def test_missing_api_key(monkeypatch):
    monkeypatch.setattr(llm, "_client", None)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("CLAUDE_API_KEY", raising=False)
    with pytest.raises(llm.LLMConfigError):
        llm.get_client()


def test_legacy_claude_api_key_is_accepted(monkeypatch):
    monkeypatch.setattr(llm, "_client", None)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("CLAUDE_API_KEY", "sk-ant-test")
    client = llm.get_client()
    assert client.api_key == "sk-ant-test"
    monkeypatch.setattr(llm, "_client", None)
