from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _rate_limit_key(request: Request) -> str:
    """Per-user rate limiting via cookie; fall back to IP."""
    token = request.cookies.get("access_token")
    if token:
        return token
    return get_remote_address(request)


limiter = Limiter(key_func=_rate_limit_key)
