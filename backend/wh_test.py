"""One-off: send a correctly signed webhook to the local backend to verify
signature validation. Safe to delete."""
import asyncio
import base64
import hashlib
import hmac
import json
import time

import httpx

from app.config import get_settings

s = get_settings()
secret = s.polar_webhook_secret
key = base64.b64decode(secret[len("whsec_"):])
body = json.dumps({"type": "order.created", "data": {}}).encode()
msg_id = "msg_test123"
ts = str(int(time.time()))
to_sign = f"{msg_id}.{ts}.".encode() + body
sig = base64.b64encode(hmac.new(key, to_sign, hashlib.sha256).digest()).decode()


async def main() -> None:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(
            "http://localhost:8000/api/v1/webhooks/polar",
            content=body,
            headers={
                "webhook-id": msg_id,
                "webhook-timestamp": ts,
                "webhook-signature": f"v1,{sig}",
                "content-type": "application/json",
            },
        )
    print("status:", r.status_code, r.text[:100])


asyncio.run(main())
