"""Vehicle number from a photo, for Gate Entry (and any other hub app that needs it).

POST /api/vision/vehicle-number  {image: <base64>, mediaType: "image/jpeg"}  Authorization: Bearer <hub token>
-> {plate, confidence, valid, candidates, source, notes, agreed}

Any person signed in to the Emami Apps hub may call it (the hub token is verified with the hub's secret; no
Manage Access role needed). The Anthropic key comes from the person (header X-Anthropic-Key, typed into the app
and kept only in that browser tab) or, when none is sent, from this server (VISION_ANTHROPIC_API_KEY). A key sent
by the browser is used for that request only - never stored or logged.
The photo is read twice in parallel and the two readings are compared: if they disagree the answer is marked
low confidence and both are offered, so a misread is never filled in silently.
"""
from __future__ import annotations
import base64
import os
import re
import threading
import time
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor

import jwt
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter()

MEDIA = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_BYTES = 5 * 1024 * 1024
RATE = 30                     # readings per person per minute
_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()

# Indian registration formats (spaces/hyphens removed):
#   standard  WB 25 F 4521, MH 12 AB 1234, DL 1C AB 1234   -> SS + 1-2 digit RTO + 0-3 letters + 1-4 digits
#   Bharat    22 BH 1234 AA                                 -> YY BH NNNN X(X)
PLATE_RES = [re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$"), re.compile(r"^\d{2}BH\d{4}[A-Z]{1,2}$")]
STATES = set("AN AP AR AS BR CH CG DD DL DN GA GJ HP HR JH JK KA KL LA LD MH ML MN MP MZ NL OD OR PB PY RJ SK TN TR TS UK UA UP WB".split())

PROMPT = """You read vehicle registration numbers (Indian number plates) from photos taken at a factory gate, where
trucks, tempos and cars arrive with goods.

Read the registration number of the vehicle in the photo, character by character.
- Prefer the number plate (front or rear). If no plate is readable, use the registration number painted on the
  vehicle body or cabin, and say so in `source`.
- Indian formats: standard `SS NN X(XX) NNNN` (state code, RTO number, optional series letters, number) such as
  WB 25 F 4521, MH 12 AB 1234, OD 02 K 9911, DL 1C AB 1234; Bharat series `YY BH NNNN X(X)` such as 22 BH 1234 AA.
- Use the format to settle look-alike characters: the state code and series are letters, the RTO and final number
  are digits, so 0/O, 1/I, 8/B, 5/S, 2/Z, 6/G, 4/A are decided by position. Never invent characters you cannot see.
- If several vehicles are visible, read the one nearest the camera / most central and mention the others in notes.
- Ignore transporter names, phone numbers, "GOODS CARRIER", "ON TEST", dealer stickers and similar text.
- If the plate is partly hidden, blurred or not in the photo, give your best reading with low confidence and put the
  unclear positions in notes; if there is no vehicle number at all, return an empty plate.

Report through the `report_vehicle_number` tool. `plate` is uppercase without spaces or hyphens."""

TOOL = {
    "name": "report_vehicle_number",
    "description": "Report the vehicle registration number read from the photo.",
    "input_schema": {
        "type": "object",
        "properties": {
            "plate": {"type": "string", "description": "uppercase, no spaces or hyphens; empty if none is readable"},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
            "candidates": {"type": "array", "items": {"type": "string"}, "description": "other plausible readings, best first"},
            "source": {"type": "string", "enum": ["front plate", "rear plate", "painted on vehicle", "other", "none"]},
            "notes": {"type": "string", "description": "short: unclear characters, other vehicles, why confidence is not high"},
        },
        "required": ["plate", "confidence", "source"],
    },
}


class PlateRequest(BaseModel):
    image: str
    mediaType: str = "image/jpeg"


def _clean(p: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (p or "").upper())


def _valid(p: str) -> bool:
    return any(r.match(p) for r in PLATE_RES) and (p[:2] in STATES or "BH" in p[2:4])


def _who(authorization: str) -> str:
    secret = os.environ.get("HUB_AUTH_JWT_SECRET", "")
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not secret:
        raise HTTPException(503, "Sign-in is not configured on the server.")
    if not token:
        raise HTTPException(401, "Sign in to Emami Apps first.")
    try:
        p = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Your Emami Apps session has expired. Sign in again.")
    except jwt.PyJWTError:
        raise HTTPException(401, "Could not verify your Emami Apps session.")
    email = str(p.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(401, "Invalid Emami Apps session.")
    return email


def _rate(email: str):
    now = time.time()
    with _lock:
        q = _hits[email]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= RATE:
            raise HTTPException(429, "Too many photos in a minute. Wait a moment and try again.")
        q.append(now)


def _read_once(client, model: str, media: str, data: str) -> dict:
    msg = client.messages.create(
        model=model,
        max_tokens=600,
        tools=[TOOL],
        tool_choice={"type": "tool", "name": "report_vehicle_number"},
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": media, "data": data}},
            {"type": "text", "text": PROMPT},
        ]}],
    )
    for b in msg.content:
        if getattr(b, "type", "") == "tool_use":
            return dict(b.input)
    return {"plate": "", "confidence": "low", "source": "none", "notes": "no reading returned"}


def combine(a: dict, b: dict) -> dict:
    """Two independent readings -> one answer. Agreement keeps the model's confidence; disagreement is low."""
    pa, pb = _clean(a.get("plate", "")), _clean(b.get("plate", ""))
    agreed = bool(pa) and pa == pb
    plate = pa or pb
    rank = {"high": 2, "medium": 1, "low": 0}
    conf = min(a.get("confidence", "low"), b.get("confidence", "low"), key=lambda c: rank.get(c, 0)) if agreed else "low"
    cands: list[str] = []
    for c in [pb if pb != plate else "", *a.get("candidates", []), *b.get("candidates", [])]:
        c = _clean(c)
        if c and c != plate and c not in cands:
            cands.append(c)
    notes = [n for n in (a.get("notes", ""), b.get("notes", "")) if n]
    valid = _valid(plate) if plate else False
    if plate and not valid:
        conf = "low"
        notes.insert(0, "does not match an Indian registration format - check it")
    if not agreed and pa and pb:
        notes.insert(0, f"two readings differ: {pa} / {pb}")
    return {"plate": plate, "confidence": conf if plate else "low", "valid": valid, "candidates": cands[:4],
            "source": a.get("source") or b.get("source") or "none", "notes": "; ".join(dict.fromkeys(notes))[:300], "agreed": agreed}


@router.post("/api/vision/vehicle-number")
def vehicle_number(body: PlateRequest, authorization: str = Header(default=""), x_anthropic_key: str = Header(default="")):
    email = _who(authorization)
    own = x_anthropic_key.strip()
    if own and not re.fullmatch(r"sk-ant-[A-Za-z0-9_\-]{20,}", own):
        raise HTTPException(400, "That does not look like an Anthropic API key (it starts with sk-ant-).")
    key = own or os.environ.get("VISION_ANTHROPIC_API_KEY", "")
    if not key:
        raise HTTPException(428, "Enter an Anthropic API key to read vehicle numbers from photos.")
    media = body.mediaType.lower()
    if media not in MEDIA:
        raise HTTPException(400, "Send a JPEG, PNG or WebP photo.")
    data = body.image.split(",", 1)[1] if body.image.startswith("data:") else body.image
    try:
        raw = base64.b64decode(data, validate=True)
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "The photo could not be read.")
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "The photo is too large (max 5 MB).")
    _rate(email)
    import anthropic
    client = anthropic.Anthropic(api_key=key, timeout=60)
    model = os.environ.get("VISION_MODEL", "claude-opus-5-5")
    try:
        with ThreadPoolExecutor(2) as ex:
            a, b = ex.map(lambda _: _read_once(client, model, media, data), range(2))
    except anthropic.AuthenticationError:
        raise HTTPException(401 if own else 503, "Anthropic rejected the API key. Check it and enter it again." if own else "The server's Anthropic key was rejected.")
    except anthropic.PermissionDeniedError:
        raise HTTPException(403, "This Anthropic API key may not use the vision model.")
    except anthropic.APIError as e:
        raise HTTPException(502, f"The photo reader is not available right now ({e.__class__.__name__}).")
    out = combine(a, b)
    print(f"vision plate by={email} key={'user' if own else 'server'} plate={out['plate']} conf={out['confidence']} agreed={out['agreed']}", flush=True)
    return out
