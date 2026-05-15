from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from app.ai.llm import llm


SYSTEM_PROMPT = (
    "You are a helpful AI assistant. Keep responses concise and clear. "
    "Answer questions using your training knowledge. "
    "However, your training data has a knowledge cutoff and may be outdated. "
    "For any question about a specific person's current role, title, or position "
    "(e.g. who is the CEO, founder, president, director of a company), "
    "do NOT state a name as a definitive fact. "
    "Instead, say something like: 'As of my training data, [name] held this role, "
    "but this may have changed. Please verify on the official website or LinkedIn.' "
    "If the user provides context via uploaded files or attachments, ALWAYS use that "
    "as the authoritative source instead of training knowledge — never claim you lack "
    "access to data that is already provided in the context. "
    "Do not invent statistics, citations, or facts you are not confident about. "
    "This assistant does not browse the web in real time unless a source is provided in context."
)


# {history} receives a list of HumanMessage / AIMessage objects (last N turns).
# {message} receives the current user message string.
# {attachment_context} receives parsed text/metadata from uploaded attachments.
prompt = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT),
        MessagesPlaceholder(variable_name="history"),
        (
            "human",
            "User message:\n{message}\n\nAttachment context (may be empty):\n{attachment_context}",
        ),
    ]
)

chat_chain = prompt | llm | StrOutputParser()
