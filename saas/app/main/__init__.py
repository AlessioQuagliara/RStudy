from flask import Blueprint, render_template
from flask_login import login_required

bp = Blueprint("main", __name__)


@bp.get("/")
@login_required
def dashboard():
    return render_template("main/dashboard.html")


@bp.get("/healthz")
def healthz():
    # Solo liveness del processo: non tocca il database.
    return {"status": "ok"}
