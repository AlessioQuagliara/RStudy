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


def _ai_config() -> dict:
    provider = os.environ.get("AI_PROVIDER", "").strip()
    if provider not in ("", "openai", "fake"):
        raise ConfigError(f"AI_PROVIDER non valido: {provider} (ammessi: openai, fake, vuoto)")
    cfg = {
        "AI_PROVIDER": provider,
        "AI_BASE_URL": os.environ.get("AI_BASE_URL", "").strip(),
        "AI_MODEL": os.environ.get("AI_MODEL", "").strip(),
        "AI_API_KEY": os.environ.get("AI_API_KEY", "").strip(),
        "AI_MAX_TOKENS": _int("AI_MAX_TOKENS", 12000),
        # Generazioni AI per utente al giorno (fuso Europe/Rome), come CLOUD_AI_DAILY_USAGE_LIMIT del desktop.
        "AI_DAILY_LIMIT": _int("AI_DAILY_LIMIT", 35),
    }
    if provider == "openai":
        for name in ("AI_BASE_URL", "AI_MODEL", "AI_API_KEY"):
            _required(name)
    return cfg


def _billing_config() -> dict:
    environment = os.environ.get("PADDLE_ENVIRONMENT", "").strip()
    if environment not in ("", "sandbox", "production"):
        raise ConfigError(f"PADDLE_ENVIRONMENT non valido: {environment} (ammessi: sandbox, production, vuoto)")
    names = ("PADDLE_CLIENT_TOKEN", "PADDLE_API_KEY", "PADDLE_WEBHOOK_SECRET", "PADDLE_PRICE_MONTHLY", "PADDLE_PRICE_YEARLY")
    # Vuoto = pagamenti disattivati (sviluppo): la prova scade lo stesso, ma non si può abbonarsi.
    cfg = {name: (_required(name) if environment else os.environ.get(name, "").strip()) for name in names}
    return {"PADDLE_ENVIRONMENT": environment, **cfg}


def load_config() -> dict:
    secure_cookies = os.environ.get("SESSION_COOKIE_SECURE", "1").strip() != "0"
    return {
        "SECRET_KEY": _required("SECRET_KEY"),
        "DATABASE_URL": _required("DATABASE_URL"),
        "CSRF_ENABLED": True,
        "SESSION_COOKIE_HTTPONLY": True,
        "SESSION_COOKIE_SAMESITE": "Lax",
        "SESSION_COOKIE_SECURE": secure_cookies,
        # Tetto assoluto di Quart: quello di backup e materiali. Il limite di 1 MB per il resto è in create_app.
        "MAX_CONTENT_LENGTH": 20 * 1024 * 1024,
        # File statici con max-age=0 (Quart di default: 12 ore): gli URL non hanno versione, quindi dopo un rilascio
        # il browser deve rivalidare con l'ETag (304 se invariati) invece di usare CSS e JS vecchi.
        "SEND_FILE_MAX_AGE_DEFAULT": 0,
        # Numero di proxy fidati davanti all'app per gli header X-Forwarded-For/Proto/Host.
        # 0 = nessuna fiducia negli header inoltrati. Va impostato al deploy dopo aver verificato la catena reale.
        "PROXY_TRUSTED_HOPS": _int("PROXY_TRUSTED_HOPS", 0),
        **_ai_config(),
        **_billing_config(),
    }
