from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from app.ai.llm import llm


# {history} receives a list of HumanMessage / AIMessage objects (last N turns).
# {message} receives the current user message string.
# {attachment_context} receives parsed text/metadata from uploaded attachments.
prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a helpful AI assistant. Keep responses concise and clear.",
        ),
        MessagesPlaceholder(variable_name="history"),
        (
            "human",
            "User message:\n{message}\n\nAttachment context (may be empty):\n{attachment_context}",
        ),
    ]
)

chat_chain = prompt | llm | StrOutputParser()
