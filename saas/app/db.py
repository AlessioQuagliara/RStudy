"""Database: SQLAlchemy async su psycopg, una sessione per richiesta (o per job del worker).

Uso: `await db().scalar(select(...))`. La sessione si apre al primo uso dentro un app context
e si chiude da sola a fine richiesta (vedi create_app).
"""

from quart import g
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

# expire_on_commit=False: dopo un commit gli oggetti restano leggibili nei template senza una nuova query
# (in async un caricamento implicito fallirebbe).
Session = async_sessionmaker(expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def init_db(url: str) -> None:
    Session.configure(bind=create_async_engine(url, pool_pre_ping=True))


def db() -> AsyncSession:
    if "db" not in g:
        g.db = Session()
    return g.db


async def close_db() -> None:
    if (session := g.pop("db", None)) is not None:
        await session.close()
