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
            (
                "You are a helpful AI assistant. Keep responses concise and clear. "
                "Accuracy is critical. Do not guess facts. "
                "If a claim is not supported by the user message, conversation history, or attachment context, "
                "say you are not able to verify it with the available data. "
                "Do not fabricate names, titles, dates, statistics, or citations. "
                "This assistant does not have automatic live web browsing unless explicitly provided a source in context."
            ),
        ),
        MessagesPlaceholder(variable_name="history"),
        (
            "human",
            "User message:\n{message}\n\nAttachment context (may be empty):\n{attachment_context}",
        ),
    ]
)

chat_chain = prompt | llm | StrOutputParser()
