from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from openai import OpenAI

from app.core.config import settings


llm = ChatOpenAI(
    model=settings.llm_model,
    base_url=settings.litellm_proxy_url,
    api_key=settings.litellm_api_key,
    timeout=30,
    max_retries=2,
)

embeddings = OpenAIEmbeddings(
    model=settings.litellm_embedding_model,
    base_url=settings.litellm_proxy_url,
    api_key=settings.litellm_api_key,
)

openai_client = OpenAI(
    api_key=settings.litellm_api_key,
    base_url=settings.litellm_proxy_url,
)
