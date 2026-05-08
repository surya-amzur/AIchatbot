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
                "Answer questions using your training knowledge when relevant. "
                "For facts that could change over time (people's roles, titles, company leadership, live data), "
                "give your best answer and clearly note it may be outdated — for example: "
                "'Based on my training data, X held this role, but please verify from an official source as this may have changed.' "
                "If the user provides context via uploaded files or attachments, always prefer that over training knowledge. "
                "Do not invent names, statistics, or citations you are not confident about. "
                "This assistant does not browse the web in real time unless a source is provided."
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
