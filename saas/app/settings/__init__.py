"""Impostazioni: porting di SettingsPage.tsx per ciò che ha senso sul web (account, utilizzo AI, tema, backup).

Provider AI, modello locale, cartella file, licenza e aggiornamenti sono gestiti dal server: niente da impostare.
"""

import json

from quart import Blueprint, current_app, flash, g, redirect, render_template, request, url_for

from ..ai import provider_label, used_today
from ..auth import SCHOOL_MAX, _clean
from ..db import db
from ..models import utcnow
from ..web import login_required
from .backup import BackupError, export_backup, import_backup

bp = Blueprint("settings", __name__, url_prefix="/settings")

# Il backup del desktop con molte flashcard e appunti supera il limite generale di 1 MB (applicato in create_app).
MAX_BACKUP_BYTES = 20 * 1024 * 1024


@bp.get("/")
@login_required
async def index():
    limit = current_app.config["AI_DAILY_LIMIT"]
    used = min(await used_today(g.user.id), limit)
    return await render_template("settings/index.html", ai_used=used, ai_limit=limit, ai_label=provider_label())


@bp.post("/profile")
@login_required
async def profile():
    form = await request.form
    university, faculty = _clean(form.get("university", "")), _clean(form.get("faculty", ""))
    if not (university and faculty) or max(len(university), len(faculty)) > SCHOOL_MAX:
        await flash(f"Indica università e facoltà (al massimo {SCHOOL_MAX} caratteri).", "error")
        return redirect(url_for("settings.index"))
    g.user.university, g.user.faculty = university, faculty
    await db().commit()
    await flash("Profilo salvato.", "success")
    return redirect(url_for("settings.index"))


@bp.get("/backup.json")
@login_required
async def export():
    body = json.dumps(await export_backup(g.user), ensure_ascii=False)
    return current_app.response_class(
        body,
        mimetype="application/json",
        headers={"Content-Disposition": f'attachment; filename="rstudy-backup-{utcnow().date().isoformat()}.json"'},
    )


@bp.post("/backup")
@login_required
async def import_():
    upload = (await request.files).get("backup")
    if not upload or not upload.filename:
        await flash("Scegli un file di backup JSON.", "error")
        return redirect(url_for("settings.index"))
    try:
        counts = await import_backup(g.user, upload.read())
    except BackupError as exc:
        await db().rollback()
        await flash(str(exc), "error")
        return redirect(url_for("settings.index"))
    message = (
        f"Importati {counts['courses']} corsi, {counts['lessons']} lezioni, {counts['materials']} materiali, "
        f"{counts['flashcards']} flashcard e {counts['studies']} studi AI."
    )
    if counts["skipped_course_summaries"]:
        message += (
            f" Non importati {counts['skipped_course_summaries']} riassunti del corso:"
            " non sono ancora disponibili nella versione web."
        )
    await flash(message, "success")
    return redirect(url_for("settings.index"))
