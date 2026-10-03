import logging

from polar_sdk import Polar

logger = logging.getLogger(__name__)
USAGE_EVENT_NAME = "hint_usage"


class PolarUsageReporter:
    def __init__(self, client: Polar) -> None:
        self.client = client

    async def report(self, owner_id: str, billable_usd: float, kind: str) -> None:
        try:
            await self.client.events.ingest_async(
                request={
                    "events": [
                        {
                            "name": USAGE_EVENT_NAME,
                            "external_customer_id": owner_id,
                            "metadata": {"billable_usd": billable_usd, "kind": kind},
                        }
                    ]
                }
            )
        except Exception:  # noqa: BLE001 — metered reporting never breaks a request
            logger.warning("polar usage ingest failed", exc_info=True)
