import pytest

from app.services import auth_service, chat_service


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
