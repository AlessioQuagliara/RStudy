from app import create_app

# Entrypoint ASGI: `hypercorn asgi:app` (produzione) o `quart --app asgi run` (sviluppo).
app = create_app()
