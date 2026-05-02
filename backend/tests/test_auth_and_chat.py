import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.services import auth_service, chat_service
from app.services.chat_service import MEMORY_TURNS, _build_memory_messages
from app.ai.image_rules import validator as image_rules_validator
from app.services import nl2sql_service
from app.ai.tabular import tabular_qa
from app.ai.rag import pdf_rag


async def _login(client, monkeypatch: pytest.MonkeyPatch, email: str, sub: str = "sub-1") -> None:
    def fake_verify_oauth2_token(*_args, **_kwargs):
        return {"email": email, "name": "Test User", "sub": sub}

    monkeypatch.setattr(auth_service.id_token, "verify_oauth2_token", fake_verify_oauth2_token)
    response = await client.post("/api/auth/google/login", json={"credential": "fake-token"})
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_employee_domain_auth_enforced(client, monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_verify_oauth2_token(*_args, **_kwargs):
        return {"email": "user@gmail.com", "name": "External", "sub": "ext-1"}

    monkeypatch.setattr(auth_service.id_token, "verify_oauth2_token", fake_verify_oauth2_token)

    response = await client.post("/api/auth/google/login", json={"credential": "fake-token"})

    assert response.status_code == 403
    assert response.json()["detail"]["error"] == "domain_not_allowed"


@pytest.mark.asyncio
async def test_jwt_cookie_auth_success_path(client, monkeypatch: pytest.MonkeyPatch) -> None:
    await _login(client, monkeypatch, "employee@amzur.com", "amz-1")

    me_response = await client.get("/api/auth/me")

    assert me_response.status_code == 200
    assert me_response.json()["email"] == "employee@amzur.com"


@pytest.mark.asyncio
async def test_manual_signup_and_login_success(client) -> None:
    signup_response = await client.post(
        "/api/auth/signup",
        json={"email": "manual@amzur.com", "name": "Manual User", "password": "Password123"},
    )
    assert signup_response.status_code == 200

    logout_response = await client.post("/api/auth/logout")
    assert logout_response.status_code == 200

    login_response = await client.post(
        "/api/auth/login",
        json={"email": "manual@amzur.com", "password": "Password123"},
    )
    assert login_response.status_code == 200

    me_response = await client.get("/api/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "manual@amzur.com"


@pytest.mark.asyncio
async def test_manual_login_invalid_credentials(client) -> None:
    await client.post(
        "/api/auth/signup",
        json={"email": "wrongpass@amzur.com", "name": "Wrong Pass", "password": "Password123"},
    )
    await client.post("/api/auth/logout")

    login_response = await client.post(
        "/api/auth/login",
        json={"email": "wrongpass@amzur.com", "password": "WrongPassword456"},
    )
    assert login_response.status_code == 401
    assert login_response.json()["detail"]["error"] == "invalid_credentials"


@pytest.mark.asyncio
async def test_chat_message_persistence(client, monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeChain:
        async def astream(self, *_args, **_kwargs):
            yield "Hello"
            yield " there"

    monkeypatch.setattr(chat_service, "chat_chain", FakeChain())

    await _login(client, monkeypatch, "employee@amzur.com", "amz-2")

    send_response = await client.post("/api/chat/send", json={"message": "How are you?"})
    assert send_response.status_code == 200

    threads_response = await client.get("/api/chat/threads")
    assert threads_response.status_code == 200
    threads = threads_response.json()["threads"]
    assert len(threads) == 1

    thread_id = threads[0]["id"]
    history_response = await client.get("/api/chat/history", params={"thread_id": thread_id})
    assert history_response.status_code == 200

    messages = history_response.json()["messages"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_chat_history_scoped_to_authenticated_user(client, monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeChain:
        async def astream(self, *_args, **_kwargs):
            yield "ok"

    monkeypatch.setattr(chat_service, "chat_chain", FakeChain())

    await _login(client, monkeypatch, "first@amzur.com", "amz-3")
    await client.post("/api/chat/send", json={"message": "first message"})

    await _login(client, monkeypatch, "second@amzur.com", "amz-4")
    await client.post("/api/chat/send", json={"message": "second message"})

    threads_response = await client.get("/api/chat/threads")
    assert threads_response.status_code == 200
    threads = threads_response.json()["threads"]
    assert len(threads) == 1

    thread_id = threads[0]["id"]
    history_response = await client.get("/api/chat/history", params={"thread_id": thread_id})
    assert history_response.status_code == 200
    messages = history_response.json()["messages"]

    assert messages[0]["content"] == "second message"
    assert messages[1]["content"] == "ok"


@pytest.mark.asyncio
async def test_thread_can_be_renamed_and_deleted(client, monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeChain:
        async def astream(self, *_args, **_kwargs):
            yield "renamed"

    monkeypatch.setattr(chat_service, "chat_chain", FakeChain())

    await _login(client, monkeypatch, "rename-delete@amzur.com", "amz-5")
    send_response = await client.post("/api/chat/send", json={"message": "original title"})
    assert send_response.status_code == 200

    threads_response = await client.get("/api/chat/threads")
    assert threads_response.status_code == 200
    thread_id = threads_response.json()["threads"][0]["id"]

    rename_response = await client.patch(
        f"/api/chat/threads/{thread_id}",
        json={"title": "Renamed Thread"},
    )
    assert rename_response.status_code == 200
    assert rename_response.json()["title"] == "Renamed Thread"

    delete_response = await client.delete(f"/api/chat/threads/{thread_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "ok"

    threads_after_delete = await client.get("/api/chat/threads")
    assert threads_after_delete.status_code == 200
    assert threads_after_delete.json()["threads"] == []


# ── Project 4: memory window ──────────────────────────────────

from dataclasses import dataclass


@dataclass
class _FakeMsg:
    """Lightweight stand-in for a DB Message row used in unit tests."""
    role: str
    content: str


def test_build_memory_messages_empty() -> None:
    assert _build_memory_messages([]) == []  # type: ignore[arg-type]


def test_build_memory_messages_fewer_than_limit() -> None:
    msgs = [_FakeMsg("user", "hi"), _FakeMsg("assistant", "hello")]
    result = _build_memory_messages(msgs)  # type: ignore[arg-type]
    assert len(result) == 2
    assert isinstance(result[0], HumanMessage)
    assert result[0].content == "hi"
    assert isinstance(result[1], AIMessage)
    assert result[1].content == "hello"


def test_build_memory_messages_caps_at_memory_turns() -> None:
    # Build 7 complete turns (14 messages) — only last MEMORY_TURNS should appear.
    msgs: list[_FakeMsg] = []
    for i in range(7):
        msgs.append(_FakeMsg("user", f"user-{i}"))
        msgs.append(_FakeMsg("assistant", f"assistant-{i}"))

    result = _build_memory_messages(msgs)  # type: ignore[arg-type]

    assert len(result) <= MEMORY_TURNS * 2
    human_contents = [m.content for m in result if isinstance(m, HumanMessage)]
    assert len(human_contents) == MEMORY_TURNS
    assert human_contents[-1] == f"user-{7 - 1}"
    assert human_contents[0] == f"user-{7 - MEMORY_TURNS}"


def test_build_memory_messages_preserves_chronological_order() -> None:
    msgs = [
        _FakeMsg("user", "first"),
        _FakeMsg("assistant", "a1"),
        _FakeMsg("user", "second"),
        _FakeMsg("assistant", "a2"),
    ]
    result = _build_memory_messages(msgs)  # type: ignore[arg-type]
    contents = [m.content for m in result]
    assert contents == ["first", "a1", "second", "a2"]


@pytest.mark.asyncio
async def test_memory_window_in_live_chat(client, monkeypatch: pytest.MonkeyPatch) -> None:
    """Send more messages than MEMORY_TURNS and verify the chain only sees the last N turns."""
    received_histories: list[list] = []

    class FakeChain:
        async def astream(self, inputs: dict, **_kwargs):
            received_histories.append(inputs.get("history", []))
            yield "ok"

    monkeypatch.setattr(chat_service, "chat_chain", FakeChain())
    await _login(client, monkeypatch, "memory@amzur.com", "amz-6")

    # Send MEMORY_TURNS + 2 messages so we exceed the window.
    total = MEMORY_TURNS + 2
    thread_id: str | None = None
    for i in range(total):
        payload: dict = {"message": f"msg-{i}"}
        if thread_id:
            payload["thread_id"] = thread_id
        resp = await client.post("/api/chat/send", json=payload)
        assert resp.status_code == 200

        if thread_id is None:
            threads = (await client.get("/api/chat/threads")).json()["threads"]
            thread_id = threads[0]["id"]

    # The last chain call's history should contain at most MEMORY_TURNS * 2 messages.
    last_history = received_histories[-1]
    assert len(last_history) <= MEMORY_TURNS * 2, (
        f"Expected at most {MEMORY_TURNS * 2} history messages, got {len(last_history)}"
    )
    # The current user message is passed via {message}, NOT inside history.
    human_in_history = [m for m in last_history if isinstance(m, HumanMessage)]
    assert len(human_in_history) <= MEMORY_TURNS


# ── Project 5: attachments ───────────────────────────────────


@pytest.mark.asyncio
async def test_upload_attachment_endpoint(client, monkeypatch: pytest.MonkeyPatch) -> None:
    await _login(client, monkeypatch, "upload@amzur.com", "amz-7")

    response = await client.post(
        "/api/chat/upload",
        files={"file": ("example.txt", b"hello attachment", "text/plain")},
    )
    assert response.status_code == 200
    payload = response.json()["attachment"]
    assert payload["file_name"] == "example.txt"
    assert payload["mime_type"] == "text/plain"
    assert payload["size_bytes"] > 0
    assert payload["url"].startswith("/uploads/")


@pytest.mark.asyncio
async def test_message_attachment_persistence(client, monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeChain:
        async def astream(self, *_args, **_kwargs):
            yield "Processed attachment"

    monkeypatch.setattr(chat_service, "chat_chain", FakeChain())

    await _login(client, monkeypatch, "attach@amzur.com", "amz-8")

    upload_response = await client.post(
        "/api/chat/upload",
        files={"file": ("table.csv", b"col1,col2\n1,2\n", "text/csv")},
    )
    assert upload_response.status_code == 200
    attachment = upload_response.json()["attachment"]

    send_response = await client.post(
        "/api/chat/send",
        json={
            "message": "Analyze this table",
            "attachments": [attachment],
        },
    )
    assert send_response.status_code == 200

    thread_id = (await client.get("/api/chat/threads")).json()["threads"][0]["id"]
    history = (await client.get("/api/chat/history", params={"thread_id": thread_id})).json()
    messages = history["messages"]
    assert messages[0]["role"] == "user"
    assert messages[0]["attachments"]
    assert messages[0]["attachments"][0]["file_name"] == "table.csv"


@pytest.mark.asyncio
async def test_attachment_context_is_injected_into_chain(client, monkeypatch: pytest.MonkeyPatch) -> None:
    observed_contexts: list[str] = []

    class FakeChain:
        async def astream(self, inputs: dict, **_kwargs):
            observed_contexts.append(str(inputs.get("attachment_context", "")))
            yield "Attachment context received"

    monkeypatch.setattr(chat_service, "chat_chain", FakeChain())

    await _login(client, monkeypatch, "attach-context@amzur.com", "amz-9")

    upload_response = await client.post(
        "/api/chat/upload",
        files={"file": ("notes.txt", b"Quarterly revenue is 42 and margin is 18%", "text/plain")},
    )
    assert upload_response.status_code == 200
    attachment = upload_response.json()["attachment"]

    send_response = await client.post(
        "/api/chat/send",
        json={
            "message": "Summarize the attachment",
            "attachments": [attachment],
        },
    )
    assert send_response.status_code == 200

    assert observed_contexts, "Expected attachment context to be passed to chain"
    context = observed_contexts[-1]
    assert "notes.txt" in context
    assert "Quarterly revenue is 42" in context


@pytest.mark.asyncio
async def test_image_attachment_uses_vision_path(client, monkeypatch: pytest.MonkeyPatch) -> None:
    captured_messages: list[dict] = []

    class _Delta:
        def __init__(self, content: str):
            self.content = content

    class _Choice:
        def __init__(self, content: str):
            self.delta = _Delta(content)

    class _Event:
        def __init__(self, content: str):
            self.choices = [_Choice(content)]

    class _Completions:
        def create(self, **kwargs):
            captured_messages.extend(kwargs.get("messages", []))
            return [_Event("Vision "), _Event("OK")]

    class _Chat:
        def __init__(self):
            self.completions = _Completions()

    class _OpenAIClient:
        def __init__(self):
            self.chat = _Chat()

    class UnexpectedChain:
        async def astream(self, *_args, **_kwargs):
            raise AssertionError("Text-only chain should not run for image attachments")

    monkeypatch.setattr(chat_service, "openai_client", _OpenAIClient())
    monkeypatch.setattr(chat_service, "chat_chain", UnexpectedChain())

    await _login(client, monkeypatch, "vision@amzur.com", "amz-10")

    # Minimal JPEG header/footer bytes are sufficient for this path test.
    upload_response = await client.post(
        "/api/chat/upload",
        files={"file": ("photo.jpg", b"\xff\xd8\xff\xd9", "image/jpeg")},
    )
    assert upload_response.status_code == 200
    attachment = upload_response.json()["attachment"]

    send_response = await client.post(
        "/api/chat/send",
        json={
            "message": "What is in this image?",
            "attachments": [attachment],
        },
    )
    assert send_response.status_code == 200

    # Ensure the multimodal user message contains an image_url item.
    user_msg = next(msg for msg in captured_messages if msg.get("role") == "user")
    content = user_msg["content"]
    assert isinstance(content, list)
    assert any(part.get("type") == "image_url" for part in content)

    # Assistant response from streamed vision path should persist.
    thread_id = (await client.get("/api/chat/threads")).json()["threads"][0]["id"]
    history = (await client.get("/api/chat/history", params={"thread_id": thread_id})).json()
    assert history["messages"][1]["content"] == "Vision OK"


@pytest.mark.asyncio
async def test_generate_image_endpoint_persists_image_message(client, monkeypatch: pytest.MonkeyPatch) -> None:
    class _ImageData:
        b64_json = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgN8l5nMAAAAASUVORK5CYII="

    class _ImageResponse:
        data = [_ImageData()]

    class _Images:
        def generate(self, **_kwargs):
            return _ImageResponse()

    class _OpenAIClient:
        images = _Images()

    monkeypatch.setattr(chat_service, "openai_client", _OpenAIClient())

    await _login(client, monkeypatch, "img-gen@amzur.com", "amz-11")

    response = await client.post(
        "/api/chat/generate-image",
        json={"prompt": "A small red square"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["attachment"]["mime_type"] == "image/png"
    assert payload["attachment"]["url"].startswith("/uploads/generated_")

    thread_id = payload["thread_id"]
    history = (await client.get("/api/chat/history", params={"thread_id": thread_id})).json()
    assert history["messages"][1]["role"] == "assistant"
    assert history["messages"][1]["attachments"]
    assert history["messages"][1]["attachments"][0]["mime_type"] == "image/png"


# ── Project 7: RAG with PDF/Chroma ───────────────────────────


@pytest.mark.asyncio
async def test_rag_upload_endpoint(client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_ingest(*_args, **_kwargs):
        return "doc-123", 7

    monkeypatch.setattr(pdf_rag, "ingest_pdf_for_user", fake_ingest)
    await _login(client, monkeypatch, "rag-upload@amzur.com", "amz-12")

    response = await client.post(
        "/api/rag/upload",
        files={"file": ("guide.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["document_id"] == "doc-123"
    assert payload["chunk_count"] == 7


@pytest.mark.asyncio
async def test_rag_query_endpoint(client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_answer(*_args, **_kwargs):
        return (
            __import__("uuid").uuid4(),
            "RAG answer",
            [{"document_id": "doc-123", "file_name": "guide.pdf", "chunk_index": 2}],
        )

    monkeypatch.setattr(pdf_rag, "answer_rag_question", fake_answer)
    await _login(client, monkeypatch, "rag-query@amzur.com", "amz-13")

    response = await client.post(
        "/api/rag/query",
        json={"question": "What is this PDF about?", "document_ids": ["doc-123"], "top_k": 3},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["answer"] == "RAG answer"
    assert payload["citations"][0]["document_id"] == "doc-123"


# ── Project 8: NL2SQL ────────────────────────────────────────


@pytest.mark.asyncio
async def test_nl2sql_schema_endpoint(client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_schema(*_args, **_kwargs):
        return [
            {
                "name": "messages",
                "columns": [
                    {"name": "id", "type": "UUID"},
                    {"name": "content", "type": "TEXT"},
                ],
            }
        ]

    monkeypatch.setattr(nl2sql_service, "get_accessible_schema", fake_schema)
    await _login(client, monkeypatch, "nl2sql-schema@amzur.com", "amz-14")

    response = await client.get("/api/nl2sql/schema")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["tables"][0]["name"] == "messages"
    assert payload["tables"][0]["columns"][0]["name"] == "id"


@pytest.mark.asyncio
async def test_nl2sql_query_endpoint(client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_query(*_args, **_kwargs):
        return {
            "sql": "SELECT content FROM messages WHERE user_id = :current_user_id",
            "columns": ["content"],
            "rows": [{"content": "hello"}],
            "row_count": 1,
        }

    monkeypatch.setattr(nl2sql_service, "run_nl2sql_query", fake_query)
    await _login(client, monkeypatch, "nl2sql-query@amzur.com", "amz-15")

    response = await client.post(
        "/api/nl2sql/query",
        json={"question": "Show my messages", "max_rows": 25},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["row_count"] == 1
    assert payload["rows"][0]["content"] == "hello"


# ── Project 8: Excel/GSheet QA ───────────────────────────────


@pytest.mark.asyncio
async def test_tabular_upload_excel_endpoint(client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_ingest_excel(*_args, **_kwargs):
        return "tab-doc-1", 4, ["name", "amount"]

    monkeypatch.setattr(tabular_qa, "ingest_excel_for_user", fake_ingest_excel)
    await _login(client, monkeypatch, "tabular-excel@amzur.com", "amz-16")

    response = await client.post(
        "/api/tabular/upload-excel",
        files={"file": ("sales.xlsx", b"fake-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["document_id"] == "tab-doc-1"
    assert payload["row_count"] == 4
    assert payload["columns"] == ["name", "amount"]


@pytest.mark.asyncio
async def test_tabular_upload_gsheet_endpoint(client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_ingest_gsheet(*_args, **_kwargs):
        return "tab-doc-2", 3, ["employee", "hours"], "Team Hours:May"

    monkeypatch.setattr(tabular_qa, "ingest_gsheet_for_user", fake_ingest_gsheet)
    await _login(client, monkeypatch, "tabular-gsheet@amzur.com", "amz-17")

    response = await client.post(
        "/api/tabular/upload-gsheet",
        json={"spreadsheet": "https://docs.google.com/spreadsheets/d/fake-id/edit", "worksheet": "May"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["document_id"] == "tab-doc-2"
    assert payload["source_name"] == "Team Hours:May"


@pytest.mark.asyncio
async def test_tabular_query_endpoint(client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_answer(*_args, **_kwargs):
        return (
            __import__("uuid").uuid4(),
            "Top employee is Alex with 40 hours.",
            [{"document_id": "tab-doc-2", "source_name": "Team Hours:May", "row_index": 1}],
        )

    monkeypatch.setattr(tabular_qa, "answer_tabular_question", fake_answer)
    await _login(client, monkeypatch, "tabular-query@amzur.com", "amz-18")

    response = await client.post(
        "/api/tabular/query",
        json={"question": "Who has most hours?", "document_ids": ["tab-doc-2"], "top_k": 5},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["answer"] == "Top employee is Alex with 40 hours."
    assert payload["citations"][0]["document_id"] == "tab-doc-2"


# ── Project 8: Image rule validation ─────────────────────────


@pytest.mark.asyncio
async def test_image_rule_validation_endpoint(client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_validate(*_args, **_kwargs):
        return (
            __import__("uuid").uuid4(),
            {"invoice_number": "INV-123", "total": "120.00"},
            [
                {"rule": "Invoice number must be present", "passed": True, "evidence": "INV-123 found"},
                {"rule": "Total must be <= 100", "passed": False, "evidence": "Detected total 120.00"},
            ],
        )

    monkeypatch.setattr(image_rules_validator, "validate_image_against_rules", fake_validate)
    await _login(client, monkeypatch, "image-rules@amzur.com", "amz-19")

    response = await client.post(
        "/api/image-rules/validate",
        data={"rules_text": "[\"Invoice number must be present\", \"Total must be <= 100\"]"},
        files={"file": ("invoice.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["extracted_data"]["invoice_number"] == "INV-123"
    assert payload["results"][0]["passed"] is True
    assert payload["results"][1]["passed"] is False


@pytest.mark.asyncio
async def test_image_rule_validation_rejects_non_image(client, monkeypatch: pytest.MonkeyPatch) -> None:
    await _login(client, monkeypatch, "image-rules-non-image@amzur.com", "amz-20")

    response = await client.post(
        "/api/image-rules/validate",
        data={"rules_text": "rule one"},
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400
    assert response.json()["detail"]["error"] == "invalid_file_type"
