import asyncio
import os
from pathlib import Path

import asyncpg


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


async def try_connect(host: str, user: str, password: str) -> tuple[bool, str]:
    try:
        conn = await asyncpg.connect(
            user=user,
            password=password,
            database="postgres",
            host=host,
            port=6543,
            ssl="require",
            timeout=8,
        )
        try:
            val = await conn.fetchval("select 1")
            return True, f"ok select={val}"
        finally:
            await conn.close()
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {exc}"


async def main() -> None:
    env = read_env(Path(__file__).resolve().parents[2] / ".env")
    password = env.get("DATABASE_URL", "")
    # Extract password and project ref from current DATABASE_URL heuristically.
    # Expected current pattern:
    # postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
    ref = ""
    pwd = ""
    db_url = env.get("DATABASE_URL", "")
    if "@db." in db_url and "://" in db_url:
        before_host = db_url.split("@db.", 1)[0]
        ref = db_url.split("@db.", 1)[1].split(".supabase.co", 1)[0]
        if ":" in before_host:
            pwd = before_host.rsplit(":", 1)[1]

    if not ref or not pwd:
        print("Could not infer project ref/password from DATABASE_URL.")
        print("DATABASE_URL currently:", db_url)
        return

    regions = [
        "us-east-1",
        "us-east-2",
        "us-west-1",
        "us-west-2",
        "ca-central-1",
        "eu-west-1",
        "eu-west-2",
        "eu-west-3",
        "eu-central-1",
        "eu-north-1",
        "ap-south-1",
        "ap-southeast-1",
        "ap-southeast-2",
        "ap-northeast-1",
        "sa-east-1",
    ]
    hosts = [f"aws-0-{region}.pooler.supabase.com" for region in regions]
    users = [f"postgres.{ref}", "postgres"]

    for host in hosts:
        for user in users:
            ok, message = await try_connect(host, user, pwd)
            print(f"host={host} user={user} ok={ok} detail={message}")


if __name__ == "__main__":
    asyncio.run(main())
