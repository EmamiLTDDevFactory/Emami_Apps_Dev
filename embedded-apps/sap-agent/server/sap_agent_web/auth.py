"""Who may use the agent: a person signed in to the Emami Apps hub (its token is verified with the hub's
secret) who holds the Admin role on this app in Manage Access. The result is this server's own short
session token, sent back as `Authorization: Bearer` (or ?token= for the event stream)."""
from __future__ import annotations
import time
from typing import Callable, Optional

import jwt
import requests

from .settings import WebSettings


class AuthError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def hub_role(s: WebSettings, email: str, get: Optional[Callable] = None) -> Optional[str]:
    """The person's Manage Access role on this app ('Admin' | 'User' | None)."""
    get = get or requests.get
    if not s.hub_access_api_base:
        raise AuthError(503, "Sign-in is not configured (HUB_ACCESS_API_BASE).")
    try:
        r = get(f"{s.hub_access_api_base}/access/me", params={"email": email}, timeout=15)
        data = r.json()
    except Exception as e:  # noqa: BLE001
        raise AuthError(502, f"Could not check your access in Manage Access ({e.__class__.__name__}).")
    for a in data.get("apps") or []:
        if a.get("appId") == s.app_id:
            return a.get("role")
    return None


def login_with_hub_token(s: WebSettings, hub_token: str, get: Optional[Callable] = None) -> dict:
    if not s.hub_jwt_secret or not s.session_secret:
        raise AuthError(503, "Sign-in is not configured (HUB_AUTH_JWT_SECRET / SESSION_SECRET).")
    if not hub_token:
        raise AuthError(401, "No Emami Apps session found. Sign in to Emami Apps first.")
    try:
        payload = jwt.decode(hub_token, s.hub_jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise AuthError(401, "Your Emami Apps session has expired. Sign in to Emami Apps again.")
    except jwt.PyJWTError:
        raise AuthError(401, "Could not verify your Emami Apps session. Please contact IT.")
    email = str(payload.get("email") or "").strip().lower()
    if not email:
        raise AuthError(401, "Invalid Emami Apps session.")
    role = hub_role(s, email, get)
    if role != "Admin":
        raise AuthError(403, "SAP Agent is for admins only. Ask your Emami Apps admin for the Admin role on SAP Agent in Manage Access.")
    return issue(s, email)


def dev_login(s: WebSettings, email: str) -> dict:
    if not s.allow_dev_login:
        raise AuthError(404, "Not found.")
    return issue(s, (email or "developer@example.com").strip().lower())


def issue(s: WebSettings, email: str) -> dict:
    import uuid
    exp = int(time.time()) + s.session_hours * 3600
    sid = uuid.uuid4().hex  # session id: the key of this person's typed-in SAP / Anthropic credentials
    token = jwt.encode({"sub": email, "email": email, "role": "Admin", "sid": sid, "exp": exp}, s.session_secret, algorithm="HS256")
    return {"token": token, "email": email, "expiresAt": exp * 1000}


class SessionUser(str):
    """The signed-in email, carrying the session id and expiry."""
    session_id: str = ""
    expires: float = 0.0


def verify_session(s: WebSettings, token: str) -> SessionUser:
    if not token:
        raise AuthError(401, "Not signed in.")
    try:
        p = jwt.decode(token, s.session_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise AuthError(401, "Your session has expired. Reload the page.")
    if p.get("role") != "Admin":
        raise AuthError(403, "Admins only.")
    u = SessionUser(str(p["email"]))
    u.session_id = str(p.get("sid") or "")
    u.expires = float(p.get("exp") or 0)
    return u


def verify(s: WebSettings, token: str) -> str:
    if not token:
        raise AuthError(401, "Not signed in.")
    try:
        p = jwt.decode(token, s.session_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise AuthError(401, "Your session has expired. Reload the page.")
    if p.get("role") != "Admin":
        raise AuthError(403, "Admins only.")
    return str(p["email"])
