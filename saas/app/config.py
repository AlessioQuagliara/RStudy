import os


class ConfigError(RuntimeError):
    pass


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        # Nessun valore di riserva: un SECRET_KEY o un DATABASE_URL "di default" finirebbero in produzione.
        raise ConfigError(f"Variabile d'ambiente obbligatoria mancante: {name}")
    return value


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else default


def load_config() -> dict:
    secure_cookies = os.environ.get("SESSION_COOKIE_SECURE", "1").strip() != "0"
    return {
        "SECRET_KEY": _required("SECRET_KEY"),
        "SQLALCHEMY_DATABASE_URI": _required("DATABASE_URL"),
        "SQLALCHEMY_ENGINE_OPTIONS": {"pool_pre_ping": True},
        "SESSION_COOKIE_HTTPONLY": True,
        "SESSION_COOKIE_SAMESITE": "Lax",
        "SESSION_COOKIE_SECURE": secure_cookies,
        "REMEMBER_COOKIE_SECURE": secure_cookies,
        "MAX_CONTENT_LENGTH": 1 * 1024 * 1024,
        # Numero di proxy fidati davanti all'app, per ciascun header X-Forwarded-*.
        # 0 = nessuna fiducia negli header inoltrati. Va impostato al deploy dopo aver verificato la catena reale.
        "PROXY_FIX_X_FOR": _int("PROXY_FIX_X_FOR", 0),
        "PROXY_FIX_X_PROTO": _int("PROXY_FIX_X_PROTO", 0),
        "PROXY_FIX_X_HOST": _int("PROXY_FIX_X_HOST", 0),
    }
