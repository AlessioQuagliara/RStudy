import pytest
from werkzeug.middleware.proxy_fix import ProxyFix

from app import create_app
from app.config import ConfigError


@pytest.mark.parametrize("missing", ["SECRET_KEY", "DATABASE_URL"])
def test_refuses_to_start_without_required_config(monkeypatch, missing):
    monkeypatch.setenv("SECRET_KEY", "x")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u@h/db")
    monkeypatch.delenv(missing)
    with pytest.raises(ConfigError, match=missing):
        create_app()


def test_healthz(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_dashboard_requires_login(client):
    response = client.get("/dashboard")
    assert response.status_code == 302
    assert response.headers["Location"].startswith("/login")


def test_landing_is_public_and_links_to_auth(client):
    response = client.get("/")
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert 'href="/login"' in html and 'href="/register"' in html
    assert "<script>" not in html  # la CSP vieta gli script inline


def test_login_page_renders_with_security_headers(client):
    response = client.get("/login")
    html = response.get_data(as_text=True)
    assert response.status_code == 200
    assert "<svg" in html  # icone inline compilate da npm run build
    assert 'name="csrf_token"' in html
    assert "salvati sul server" in html
    assert "script-src 'self'" in response.headers["Content-Security-Policy"]
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_secure_cookies_by_default(app):
    assert app.config["SESSION_COOKIE_SECURE"] is True
    assert app.config["SESSION_COOKIE_HTTPONLY"] is True


def test_proxy_headers_ignored_unless_configured(app, monkeypatch):
    assert not isinstance(app.wsgi_app, ProxyFix)
    client = app.test_client()

    @app.get("/_ip")
    def _ip():
        from flask import request

        return request.remote_addr

    assert client.get("/_ip", headers={"X-Forwarded-For": "6.6.6.6"}).text != "6.6.6.6"

    monkeypatch.setenv("PROXY_FIX_X_FOR", "1")
    proxied = create_app({"TESTING": True})
    assert isinstance(proxied.wsgi_app, ProxyFix)
