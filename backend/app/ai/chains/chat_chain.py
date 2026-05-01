from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.ai.llm import llm


prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a helpful AI assistant. Keep responses concise and clear.",
        ),
        (
            "human",
            "Conversation history:\n{history}\n\nUser message:\n{message}",
        ),
    ]
)

chat_chain = prompt | llm | StrOutputParser()
