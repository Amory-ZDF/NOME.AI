"""Unified LLM client — single adapter for all OpenAI-compatible providers.

Design:
    - One httpx.AsyncClient per provider, reused across requests.
    - chat(): free-text response → (content, usage_dict).
    - chat_structured(): JSON-mode constrained output → validated Pydantic model.

Supported providers:
    - deepseek: https://api.deepseek.com/v1
    - qwen:     Alibaba Cloud DashScope / token-plan compatible-mode endpoint

All providers speak OpenAI-compatible /v1/chat/completions.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx
from pydantic import BaseModel, ValidationError

from app.config import AppConfig, ProviderConfig

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class LLMError(Exception):
    """Raised when the provider returns an error, times out, or fails to parse."""


class LLMConfigError(LLMError):
    """Raised when the provider configuration is invalid."""


class LLMAPIError(LLMError):
    """Raised when the provider API returns a non-2xx status."""

    def __init__(self, message: str, *, status: int = 0, response_body: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.response_body = response_body


class LLMParseError(LLMError):
    """Raised when the LLM response cannot be parsed or validated."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Markdown code-fence pattern: ```json ... ```  or  ``` ... ```
_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def _extract_json(text: str) -> str:
    """Extract a JSON object/array from text that may be wrapped in markdown.

    Tries multiple strategies in order:
        1. Direct parse — the text is already valid JSON.
        2. Extract from ```json ... ``` code fence.
        3. Extract from ``` ... ``` code fence.
        4. Find first { ... } or [ ... ] in the text.
    """
    stripped = text.strip()

    # Strategy 1: direct
    if stripped.startswith("{") or stripped.startswith("["):
        return stripped

    # Strategy 2: ```json fence
    m = _JSON_FENCE_RE.search(stripped)
    if m:
        return m.group(1).strip()

    # Strategy 3: find JSON-like substring
    for start_char, end_char in ("{}", "[]"):
        start = stripped.find(start_char)
        end = stripped.rfind(end_char)
        if start != -1 and end != -1 and end > start:
            return stripped[start : end + 1]

    return stripped


def _build_messages(system: str, messages: list[dict[str, str]]) -> list[dict[str, str]]:
    """Build the full message list with system prompt."""
    return [{"role": "system", "content": system}, *messages]


def _build_request_body(
    *,
    messages: list[dict[str, str]],
    model: str,
    temperature: float,
    max_tokens: int,
    json_mode: bool = False,
) -> dict[str, Any]:
    """Build the JSON body for a /v1/chat/completions request."""
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    return body


# ---------------------------------------------------------------------------
# LLMClient
# ---------------------------------------------------------------------------


class LLMClient:
    """Thin wrapper around OpenAI-compatible /v1/chat/completions.

    Usage:
        config = AppConfig()
        client = LLMClient(config.providers)

        content, usage = await client.chat("deepseek", system="...", messages=[...])

        result = await client.chat_structured(
            "qwen", system="...", messages=[...], output_model=MyPydanticModel
        )
    """

    def __init__(self, providers: dict[str, ProviderConfig]) -> None:
        """Initialise one httpx.AsyncClient per provider.

        Args:
            providers: provider_name → ProviderConfig mapping.
                       E.g. {"deepseek": ProviderConfig(...), "qwen": ProviderConfig(...)}

        Raises:
            LLMConfigError: if providers is empty.
        """
        if not providers:
            raise LLMConfigError("At least one provider is required")

        self._providers = providers
        self._clients: dict[str, httpx.AsyncClient] = {}

        for name, cfg in providers.items():
            self._clients[name] = httpx.AsyncClient(
                base_url=cfg.base_url,
                headers={
                    "Authorization": f"Bearer {cfg.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=httpx.Timeout(60.0, connect=10.0),
            )

    # ---- Public API ----------------------------------------------------------

    async def chat(
        self,
        provider: str,
        *,
        system: str,
        messages: list[dict[str, str]],
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 1024,
    ) -> tuple[str, dict[str, Any]]:
        """Single-turn chat. Returns (content_text, usage_dict).

        Args:
            provider: provider name registered at init (e.g. "deepseek").
            system: system prompt.
            messages: user/assistant messages [{"role": "...", "content": "..."}].
            model: override the provider's default model.
            temperature: 0.0–2.0, lower = more deterministic.
            max_tokens: max output tokens.

        Returns:
            (content, usage) where content is the model's text reply and
            usage is a dict like {"prompt_tokens": N, "completion_tokens": M, "total_tokens": T}.

        Raises:
            LLMConfigError: unknown provider.
            LLMAPIError: non-2xx response from the API.
            LLMError: timeout, network error, or malformed response.
        """
        cfg = self._resolve_provider(provider)
        model = model or cfg.default_model
        http_client = self._clients[provider]

        body = _build_request_body(
            messages=_build_messages(system, messages),
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            json_mode=False,
        )

        response = await self._post(http_client, provider, cfg.chat_url, body)
        return self._parse_chat_response(response)

    async def chat_structured(
        self,
        provider: str,
        *,
        system: str,
        messages: list[dict[str, str]],
        output_model: type[BaseModel],
        model: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 2048,
        max_retries: int = 2,
    ) -> BaseModel:
        """Chat with JSON-mode constraint. Returns a validated Pydantic instance.

        Uses response_format: {"type": "json_object"} (supported by both
        DeepSeek and Qwen DashScope). The output_model's field descriptions
        are injected into the system prompt to guide the LLM.

        If JSON parsing or Pydantic validation fails, retries up to max_retries
        times with an error message appended to the conversation.

        Args:
            provider: provider name.
            system: system prompt (JSON-output instructions are appended).
            messages: user/assistant messages.
            output_model: Pydantic model subclass to validate against.
            model: override default model.
            temperature: keep low for structured output (default 0.1).
            max_tokens: max output tokens.
            max_retries: retry count on parse/validation failure.

        Returns:
            A validated instance of output_model.

        Raises:
            LLMParseError: if parsing/validation fails after all retries.
            LLMAPIError: non-2xx response.
            LLMError: timeout or network error.
        """
        cfg = self._resolve_provider(provider)
        model = model or cfg.default_model
        http_client = self._clients[provider]

        # Build the full system prompt with JSON instructions
        full_system = self._build_json_system_prompt(system, output_model)

        chat_messages = _build_messages(full_system, messages)

        last_error: str | None = None

        for attempt in range(max_retries + 1):
            # If we had a previous failure, append an error message
            if last_error:
                chat_messages.append({
                    "role": "user",
                    "content": (
                        f"The previous response was invalid. Error: {last_error}\n"
                        "Please output VALID JSON matching the required schema."
                    ),
                })

            body = _build_request_body(
                messages=chat_messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                json_mode=True,
            )

            try:
                response = await self._post(http_client, provider, cfg.chat_url, body)
                content, usage = self._parse_chat_response(response)
                json_str = _extract_json(content)

                instance = output_model.model_validate_json(json_str)
                logger.debug(
                    "chat_structured success (attempt %d/%d, tokens=%s)",
                    attempt + 1,
                    max_retries + 1,
                    usage.get("total_tokens", "?"),
                )
                return instance

            except (json.JSONDecodeError, ValidationError) as exc:
                last_error = str(exc)
                logger.warning(
                    "chat_structured parse/validation failure (attempt %d/%d): %s",
                    attempt + 1,
                    max_retries + 1,
                    last_error,
                )
                if attempt == max_retries:
                    raise LLMParseError(
                        f"Failed to get valid structured output after {max_retries + 1} attempts. "
                        f"Last error: {last_error}"
                    ) from exc

        # Unreachable — kept for type checker
        raise LLMParseError("Unexpected: no retries exhausted but no result")

    async def close(self) -> None:
        """Close all underlying httpx clients."""
        for name, client in self._clients.items():
            await client.aclose()
            logger.debug("Closed httpx client for provider %r", name)
        self._clients.clear()

    # ---- Internal helpers ----------------------------------------------------

    def _resolve_provider(self, name: str) -> ProviderConfig:
        """Look up a provider by name. Raises LLMConfigError if unknown."""
        cfg = self._providers.get(name)
        if cfg is None:
            raise LLMConfigError(
                f"Unknown provider {name!r}. Available: {list(self._providers)}"
            )
        return cfg

    async def _post(
        self,
        client: httpx.AsyncClient,
        provider_name: str,
        url: str,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        """POST to the chat completions endpoint. Returns the JSON response dict.

        Raises LLMAPIError on non-2xx, LLMError on timeout/network failure.
        """
        try:
            resp = await client.post(url, json=body)
        except httpx.TimeoutException as exc:
            raise LLMError(
                f"Request to {provider_name!r} timed out: {exc}"
            ) from exc
        except httpx.NetworkError as exc:
            raise LLMError(
                f"Network error contacting {provider_name!r}: {exc}"
            ) from exc

        if resp.status_code >= 400:
            raise LLMAPIError(
                f"{provider_name!r} returned HTTP {resp.status_code}: {resp.text[:500]}",
                status=resp.status_code,
                response_body=resp.text,
            )

        try:
            return resp.json()
        except ValueError as exc:
            raise LLMError(
                f"{provider_name!r} returned non-JSON response: {resp.text[:300]}"
            ) from exc

    @staticmethod
    def _parse_chat_response(data: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        """Extract (content, usage) from a chat completion response.

        Raises LLMError if the response structure is unexpected.
        """
        try:
            choices = data["choices"]
            message = choices[0]["message"]
            content = message["content"]
            usage = data.get("usage", {})
            return content, usage
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(
                f"Unexpected response structure from provider: {str(exc)[:200]}"
            ) from exc

    @staticmethod
    def _build_json_system_prompt(
        system: str, output_model: type[BaseModel]
    ) -> str:
        """Append JSON output instructions and schema to the system prompt.

        Uses the model's field names and descriptions (if any) to generate
        a JSON schema the LLM can follow.

        NOTE: This injects the schema into the prompt text rather than relying
        on native json_schema in response_format, because DeepSeek's and Qwen's
        OpenAI-compatible JSON mode only accepts {"type": "json_object"} without
        a schema field.
        """
        # Build a human-readable schema representation
        fields_desc: list[str] = []
        for field_name, field_info in output_model.model_fields.items():
            ft = field_info.annotation
            type_name = getattr(ft, "__name__", str(ft)) if ft else "any"
            desc = field_info.description or ""
            fields_desc.append(f'    "{field_name}": {type_name}  // {desc}')

        schema_block = (
            "You MUST respond with a single JSON object that matches this exact structure:\n"
            "{\n"
            + "\n".join(fields_desc)
            + "\n}\n\n"
            "Rules:\n"
            "- Output ONLY valid JSON — no markdown, no preamble, no explanation outside the JSON.\n"
            "- All required fields must be present.\n"
            "- Do not include additional fields not listed above.\n"
        )

        return f"{system}\n\n{schema_block}"


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def create_llm_client(config: AppConfig | None = None) -> LLMClient:
    """Factory — reads provider configs from AppConfig.

    If no config is passed, creates a default AppConfig (reads .env).
    """
    if config is None:
        config = AppConfig()
    return LLMClient(config.providers)
