import pytest
from pydantic import ValidationError

from app.models.assist import ChatRequest, ElementDescriptor, PageContext


def _page(**kwargs) -> PageContext:
    return PageContext(url="https://app.acme.com/reports", title="Reports", **kwargs)


@pytest.mark.parametrize(
    "factory",
    [
        lambda: _page(
            interactive=[
                ElementDescriptor(tag="button", selector_path=f"b{i}")
                for i in range(61)
            ]
        ),
        lambda: _page(visible_text_excerpt="x" * 2001),
        lambda: ChatRequest(company_id="cmp_x", messages=[], page_context=_page()),
    ],
    ids=["61-interactive", "excerpt-over-2000", "empty-messages"],
)
def test_assist_contract_rejects_over_cap(factory) -> None:
    with pytest.raises(ValidationError):
        factory()
