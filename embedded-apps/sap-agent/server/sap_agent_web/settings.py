"""Web-layer settings (the engine's own settings stay in sap_agent.config, read from the same .env)."""
from __future__ import annotations
import os
from dataclasses import dataclass, field

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # server/


def _list(v: str | None) -> list[str]:
    return [x.strip() for x in (v or "").split(",") if x.strip()]


@dataclass
class WebSettings:
    # The Emami Apps hub signs its session tokens with this secret (dev and prod hubs differ).
    hub_jwt_secret: str = ""
    # This server's own session tokens.
    session_secret: str = ""
    session_hours: int = 12
    # Manage Access lookup: GET {base}/access/me?email=... -> apps[].role. Only "Admin" may use the agent.
    hub_access_api_base: str = ""
    app_id: str = "sap-agent"
    allowed_origins: list[str] = field(default_factory=list)
    runs_dir: str = os.path.join(HERE, "runs")
    projects_dir: str = os.path.join(HERE, "projects")
    bootstrap_manifest: str = os.path.join(HERE, "abap_bootstrap", "manifest.yaml")
    approval_timeout_s: int = 900
    # Local development only: accept any email as an Admin without a hub token.
    allow_dev_login: bool = False

    @classmethod
    def from_env(cls) -> "WebSettings":
        e = os.environ
        return cls(
            hub_jwt_secret=e.get("HUB_AUTH_JWT_SECRET", ""),
            session_secret=e.get("SESSION_SECRET", ""),
            session_hours=int(e.get("SESSION_HOURS", "12")),
            hub_access_api_base=e.get("HUB_ACCESS_API_BASE", "").rstrip("/"),
            app_id=e.get("HUB_APP_ID", "sap-agent"),
            allowed_origins=_list(e.get("ALLOWED_ORIGINS")) or ["https://dev.emamiapps.in", "https://www.emamiapps.in", "https://emamiapps.in", "http://localhost:3220"],
            runs_dir=e.get("RUNS_DIR", os.path.join(HERE, "runs")),
            projects_dir=e.get("PROJECTS_DIR", os.path.join(HERE, "projects")),
            approval_timeout_s=int(e.get("APPROVAL_TIMEOUT_S", "900")),
            allow_dev_login=e.get("ALLOW_DEV_LOGIN", "").lower() == "true",
        )
