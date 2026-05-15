from __future__ import annotations

import base64
import json
import re
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm import openai_client
from app.core.config import settings
from app.models.message import Message
from app.models.user import User
from app.services.chat_service import get_or_create_thread


class ImageRuleValidationError(Exception):
    pass


_INJECTION_PATTERN = re.compile(
    r"(ignore\s+(previous|above|all|prior)|forget\s+(all|previous)|system\s*:|<\s*system\s*>|"
    r"you\s+are\s+now|pretend\s+(you|to)|disregard|new\s+instruction)",
    flags=re.IGNORECASE,
)
_MAX_RULES = 50
_MAX_RULE_LEN = 500


def _sanitize_rule(rule: str) -> str:
    """Remove control characters and truncate."""
    sanitized = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", rule).strip()
    return sanitized[:_MAX_RULE_LEN]


def _parse_rules_text(raw: str) -> list[str]:
    text = raw.strip()
    if not text:
        raise ImageRuleValidationError("Rules text cannot be empty.")
    if len(text) > 20000:
        raise ImageRuleValidationError("Rules text is too long (max 20,000 characters).")

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            rules = [_sanitize_rule(str(item)) for item in parsed if str(item).strip()]
            rules = [r for r in rules if r]
            if rules:
                return rules[:_MAX_RULES]
    except Exception:
        pass

    rules = [_sanitize_rule(line.strip(" -\t")) for line in text.splitlines() if line.strip()]
    rules = [r for r in rules if r]
    if not rules:
        raise ImageRuleValidationError("No valid rules were found.")

    for rule in rules:
        if _INJECTION_PATTERN.search(rule):
            raise ImageRuleValidationError(
                "Rules contain disallowed instructions. Please provide compliance rules only."
            )

    return rules[:_MAX_RULES]


def _extract_json_payload(text: str) -> dict[str, object]:
    raw = text.strip()
    fenced = re.findall(r"```(?:json)?\\s*(.*?)```", raw, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        raw = fenced[0].strip()

    try:
        payload = json.loads(raw)
        if isinstance(payload, dict):
            return payload
    except Exception as exc:
        raise ImageRuleValidationError(f"Model returned non-JSON validation output: {exc}") from exc

    raise ImageRuleValidationError("Model returned invalid validation output.")


def _build_messages(image_b64: str, image_mime: str, rules: list[str]) -> list[dict[str, object]]:
    rules_text = "\\n".join(f"- {rule}" for rule in rules)
    instructions = (
        "You are an image compliance validator. Extract key data from the image and evaluate each rule. "
        "Return ONLY valid JSON with shape: "
        "{\"extracted_data\": { ... }, \"results\": [{\"rule\": str, \"passed\": bool, \"evidence\": str}]}."
    )
    return [
        {"role": "system", "content": instructions},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": f"Validate this image against these rules:\n{rules_text}"},
                {"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{image_b64}"}},
            ],
        },
    ]


async def validate_image_against_rules(
    db: AsyncSession,
    current_user: User,
    image_bytes: bytes,
    image_mime: str,
    image_name: str,
    rules_text: str,
    thread_id: uuid.UUID | None = None,
) -> tuple[uuid.UUID, dict[str, object], list[dict[str, object]]]:
    rules = _parse_rules_text(rules_text)
    if not image_bytes:
        raise ImageRuleValidationError("Image payload is empty.")

    thread = await get_or_create_thread(db, current_user.id, thread_id, f"Image rules: {image_name}")

    user_msg = Message(
        user_id=current_user.id,
        thread_id=thread.id,
        role="user",
        content=f"Validate image '{image_name}' with {len(rules)} rule(s).",
        attachments=[],
    )
    db.add(user_msg)
    await db.commit()

    messages = _build_messages(base64.b64encode(image_bytes).decode("ascii"), image_mime, rules)

    try:
        completion = openai_client.chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            stream=False,
        )
        content = ""
        if completion.choices:
            content = completion.choices[0].message.content or ""
        payload = _extract_json_payload(content)
    except ImageRuleValidationError:
        raise
    except Exception as exc:
        raise ImageRuleValidationError(f"Image rule validation failed: {exc}") from exc

    extracted_data = payload.get("extracted_data", {})
    results_raw = payload.get("results", [])
    if not isinstance(extracted_data, dict):
        extracted_data = {}
    if not isinstance(results_raw, list):
        results_raw = []

    results: list[dict[str, object]] = []
    for item in results_raw:
        if not isinstance(item, dict):
            continue
        rule = str(item.get("rule", "")).strip()
        if not rule:
            continue
        results.append(
            {
                "rule": rule,
                "passed": bool(item.get("passed", False)),
                "evidence": str(item.get("evidence", "")),
            }
        )

    summary_lines = ["Image rule validation completed."]
    for row in results:
        mark = "PASS" if row["passed"] else "FAIL"
        summary_lines.append(f"[{mark}] {row['rule']} - {row['evidence']}")

    assistant_msg = Message(
        user_id=current_user.id,
        thread_id=thread.id,
        role="assistant",
        content="\n".join(summary_lines),
        attachments=[],
    )
    db.add(assistant_msg)
    await db.commit()

    return thread.id, extracted_data, results
