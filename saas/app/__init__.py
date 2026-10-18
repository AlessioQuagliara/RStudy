import logging
import uuid
from functools import lru_cache
from pathlib import Path

from flask import Flask, request
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


_MONTHS_IT = ("gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic")


def date_it(value) -> str:
    """Data come formatDateIt del desktop: "05 ott 2026"."""
    return f"{value.day:02d} {_MONTHS_IT[value.month - 1]} {value.year}" if value else ""


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
    @app.before_request
    def upload_limits():
        # Registrato prima della CSRF, che legge il form: il limite va alzato prima che venga letto.
        if request.endpoint == "settings.import_":
            from .settings import MAX_BACKUP_BYTES

            request.max_content_length = MAX_BACKUP_BYTES

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
    app.jinja_env.filters["date_it"] = date_it

    @app.after_request
    def security_headers(response):
        response.headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        return response

    from .auth import bp as auth_bp
    from .billing import bp as billing_bp
    from .courses import bp as courses_bp
    from .flashcards import bp as flashcards_bp
    from .main import bp as main_bp
    from .settings import bp as settings_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(courses_bp)
    app.register_blueprint(flashcards_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(settings_bp)

    @app.cli.command("ai-worker")
    def ai_worker():
        """Esegue le generazioni AI in coda (processo separato dal web)."""
        from .ai import run_worker

        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
        run_worker()

    return app
