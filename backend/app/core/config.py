from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = ""
    environment: str = ""

    secret_key: str = ""
    jwt_expire_minutes: int = 0

    database_url: str = ""

    litellm_proxy_url: str = ""
    litellm_api_key: str = ""
    llm_model: str = ""
    litellm_embedding_model: str = ""
    image_gen_model: str = ""

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""
    allowed_employee_email_domains: str = "amzur.com"

    frontend_url: str = "http://localhost:5173"

    chroma_persist_dir: str = ""
    nl2sql_allowed_tables: str = "messages,chat_threads"
    nl2sql_max_rows: int = 100

    google_service_account_json: str = ""

    max_upload_mb: int = 0
    upload_dir: str = ""


settings = Settings()
