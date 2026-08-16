from app.models.assist import ChatMessage, ElementDescriptor
from app.models.retrieval import Chunk

CONDENSE_PROMPT = """Given the conversation and a follow-up question, rewrite the
follow-up as a single standalone search query about the product. Return ONLY the
query text.

Conversation:
{history}

Follow-up question: {question}"""

ANSWER_SYSTEM = """You are Hint, an in-app guide for {company_name}.
Answer ONLY from the documentation excerpts and the current page snapshot below.
The user is currently on: {url} — "{title}".
Visible interactive elements:
{interactive_summary}

Documentation excerpts:
{chunks}

When the answer involves a UI action, point to the concrete on-screen element
by wrapping its exact visible label in double quotes — e.g. click the "Export
report" button, fill in the "Customer name" field. Copy labels verbatim from
the interactive elements list above. Write plain text only: no markdown, no
asterisks, no bold.
If the excerpts don't cover the question, say so briefly — do not invent features.
Keep answers under 120 words."""

HINT_PROMPT = """You are Hint, an in-app guide for a SaaS product.
The user is hovering this element on the page "{page_title}":
{element}

Documentation excerpts:
{chunks}

Write ONE sentence (max 140 characters) explaining what this element does,
grounded in the excerpts. If the excerpts don't mention it, describe it neutrally
from its label alone. No quotes, no markdown, no exclamation marks."""


def format_chunks(chunks: list[Chunk]) -> str:
    if not chunks:
        return "(no documentation uploaded for this product yet)"
    return "\n\n".join(
        f"[{i + 1}] ({c.filename})\n{c.text}" for i, c in enumerate(chunks)
    )


def format_interactive(elements: list[ElementDescriptor]) -> str:
    if not elements:
        return "(none captured)"
    return "\n".join(
        f'- <{e.tag}> "{e.text or e.attrs.get("aria-label", "")}" ({e.selector_path})'
        for e in elements
    )


def format_history(messages: list[ChatMessage]) -> str:
    return "\n".join(f"{m.role}: {m.content}" for m in messages[:-1])


def format_element(element: ElementDescriptor) -> str:
    label = element.text or element.attrs.get("aria-label") or "(unlabeled)"
    return (
        f'<{element.tag}> "{label}" role={element.role or "-"} '
        f"at {element.selector_path}"
    )
