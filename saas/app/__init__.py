import uuid
from functools import lru_cache
from pathlib import Path

from flask import Flask
from markupsafe import Markup
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import load_config
from .extensions import csrf, db, login_manager, migrate

ICONS_DIR = Path(__file__).parent / "static" / "dist" / "icons"

CONTENT_SECURITY_POLICY = (
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)


@lru_cache
def _icon_svg(name: str) -> str:
    return (ICONS_DIR / f"{name}.svg").read_text(encoding="utf-8")


def icon(name: str, cls: str = "size-4") -> Markup:
    """Icona Lucide inline (stroke=currentColor), come le icone lucide-react del desktop."""
    svg = _icon_svg(name).replace("<svg", f'<svg aria-hidden="true" class="{cls}"', 1)
    return Markup(svg)


def create_app(overrides: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(load_config())
    if overrides:
        app.config.update(overrides)

    proxy = {k: app.config[f"PROXY_FIX_X_{k.upper()}"] for k in ("for", "proto", "host")}
    if any(proxy.values()):
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=proxy["for"], x_proto=proxy["proto"], x_host=proxy["host"])

    db.init_app(app)
    migrate.init_app(app, db)
    csrf.init_app(app)
    login_manager.init_app(app)

    from . import models

    @login_manager.user_loader
    def load_user(user_id: str):
        try:
            return db.session.get(models.User, uuid.UUID(user_id))
        except ValueError:
            return None

    app.jinja_env.globals["icon"] = icon

    @app.after_request
    def security_headers(response):
        response.headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        return response

    from .auth import bp as auth_bp
    from .main import bp as main_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    return app
