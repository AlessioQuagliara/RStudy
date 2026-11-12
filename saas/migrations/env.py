"""Ambiente Alembic: applica le revisioni in migrations/versions al database di DATABASE_URL.

Connessione sincrona (psycopg supporta entrambe le modalità): le migrazioni non hanno bisogno di async.
"""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app.db import Base
from app import models  # noqa: F401  registra le tabelle su Base.metadata, serve ad --autogenerate

if context.config.config_file_name:
    fileConfig(context.config.config_file_name, disable_existing_loggers=False)

with create_engine(os.environ["DATABASE_URL"]).connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
