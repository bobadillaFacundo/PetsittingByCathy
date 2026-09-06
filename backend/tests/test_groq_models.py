from src.services.groq_models import (
    DEFAULT_NLP_MODEL,
    extract_groq_text,
    is_groq_model_unavailable,
    nlp_models_to_try,
    resolve_groq_model,
)


def test_replaces_decommissioned_llama():
    assert resolve_groq_model("llama-3.1-8b-instant") == DEFAULT_NLP_MODEL
    assert DEFAULT_NLP_MODEL == "openai/gpt-oss-20b"


def test_keeps_current_model():
    assert resolve_groq_model("openai/gpt-oss-20b") == "openai/gpt-oss-20b"


def test_nlp_fallback_list_includes_replacement():
    models = nlp_models_to_try("llama-3.1-8b-instant")
    assert models[0] == "openai/gpt-oss-20b"
    assert len(models) >= 1


def test_detects_decommissioned_error():
    assert is_groq_model_unavailable(400, '{"error":{"code":"model_decommissioned"}}')
    assert not is_groq_model_unavailable(429, "rate limit")


def test_extracts_plain_and_reasoning_content():
    assert extract_groq_text({"choices": [{"message": {"content": "hola"}}]}) == "hola"
    assert extract_groq_text({"choices": [{"message": {"content": "", "reasoning": "ok"}}]}) == "ok"
