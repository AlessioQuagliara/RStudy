from sqlalchemy import select

from app.db import db
from app.models import User

from .conftest import login, register

ADMIN = "admin@example.com"


async def _user(app, email):
    async with app.app_context():
        return await db().scalar(select(User).where(User.email == email))


async def test_admin_panel_hidden_from_normal_users(db_app, db_client):
    db_app.config["ADMIN_EMAILS"] = {ADMIN}
    await register(db_client)
    assert (await db_client.get("/admin/")).status_code == 404


async def test_ban_logs_out_and_blocks_login(db_app):
    db_app.config["ADMIN_EMAILS"] = {ADMIN}
    victim, admin = db_app.test_client(), db_app.test_client()
    await register(victim)
    await register(admin, email=ADMIN)
    target = await _user(db_app, "a@example.com")

    page = await (await admin.get("/admin/?q=a@example")).get_data(as_text=True)
    assert "a@example.com" in page

    await admin.post(f"/admin/users/{target.id}/ban", form={"reason": "SQL injection"})
    assert (await _user(db_app, "a@example.com")).ban_reason == "SQL injection"
    # Sessione già aperta: esce subito. Nuovo login: rifiutato.
    assert (await victim.get("/settings/")).status_code == 302
    assert (await login(victim)).status_code == 403

    await admin.post(f"/admin/users/{target.id}/unban")
    assert (await login(victim)).status_code == 302


async def test_admin_cannot_be_banned_and_trial_extends(db_app, db_client):
    db_app.config["ADMIN_EMAILS"] = {ADMIN}
    await register(db_client, email=ADMIN)
    me = await _user(db_app, ADMIN)
    await db_client.post(f"/admin/users/{me.id}/ban")
    assert (await _user(db_app, ADMIN)).banned_at is None

    await db_client.post(f"/admin/users/{me.id}/trial", form={"days": "10"})
    assert (await _user(db_app, ADMIN)).trial_ends_at > me.trial_ends_at
    page = await (await db_client.get("/admin/?filter=trial")).get_data(as_text=True)
    assert ADMIN in page
