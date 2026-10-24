"""App Quart di RStudy web: `create_app()` monta configurazione, database, controlli comuni e blueprint."""

import asyncio
import logging
from functools import lru_cache
from pathlib import Path

from hypercorn.middleware import ProxyFixMiddleware
from markupsafe import Markup
from quart import Quart, abort, g, request

from .config import load_config
from .db import close_db, init_db
from .web import check_csrf, csrf_token, load_user

ICONS_DIR = Path(__file__).parent / "static" / "dist" / "icons"
MAX_REQUEST_BYTES = 1 * 1024 * 1024

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


def create_app(overrides: dict | None = None) -> Quart:
    app = Quart(__name__)
    app.config.update(load_config())
    if overrides:
        app.config.update(overrides)

    if hops := app.config["PROXY_TRUSTED_HOPS"]:
        app.asgi_app = ProxyFixMiddleware(app.asgi_app, mode="legacy", trusted_hops=hops)

    init_db(app.config["DATABASE_URL"])

    @app.teardown_appcontext
    async def close_session(_exc):
        await close_db()

    # Controlli eseguiti prima di ogni richiesta, in quest'ordine (il blocco a prova scaduta sta in billing).
    @app.before_request
    async def upload_limits():
        # Prima della CSRF, che legge il form. In Quart il limite si fissa alla creazione della richiesta (qui
        # MAX_CONTENT_LENGTH, quello di backup e materiali), quindi il limite di 1 MB per il resto dell'app si controlla qui.
        if request.endpoint in ("settings.import_", "courses.upload_materials"):
            return
        size = request.content_length
        if size is None:  # richiesta chunked: si misura il corpo (al più MAX_CONTENT_LENGTH, poi Quart risponde 413)
            size = len(await request.get_data())
        if size > MAX_REQUEST_BYTES:
            abort(413)

    app.before_request(load_user)
    app.before_request(check_csrf)

    app.jinja_env.globals.update(icon=icon, csrf_token=csrf_token)
    app.jinja_env.filters["date_it"] = date_it

    @app.context_processor
    async def user():
        return {"current_user": g.get("user")}

    @app.after_request
    async def security_headers(response):
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

    for bp in (auth_bp, billing_bp, courses_bp, flashcards_bp, main_bp, settings_bp):
        app.register_blueprint(bp)

    @app.cli.command("ai-worker")
    def ai_worker():
        """Esegue le generazioni AI in coda (processo separato dal web)."""
        from .ai import run_worker

        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
        asyncio.run(run_worker(app))

    return app
