"""Corsi gratuiti offerti dalla piattaforma, uguali per tutti gli utenti e in sola lettura.

Contenuti copiati da studio-programmazione (corsi/generati/*.json) in data/: si aggiornano sostituendo i file, senza
migrazioni. Ogni lezione ha una verifica a crocette; la lezione successiva si sblocca rispondendo giusto a tutto.
I progressi sono legati alla posizione della lezione: se un corso cambia ordine, i progressi di quel corso slittano.
"""

import json
import re
from pathlib import Path

from markupsafe import Markup, escape
from quart import Blueprint, abort, g, redirect, render_template, request, url_for
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from ..db import db
from ..models import FreeCourseProgress
from ..web import login_required

bp = Blueprint("free_courses", __name__, url_prefix="/free-courses")

DATA = Path(__file__).with_name("data")
ORDER = ("web", "flask", "quart", "fastapi", "crow", "htmx", "react", "nextjs", "server", "saas")
COURSES = {slug: json.loads((DATA / f"{slug}.json").read_text(encoding="utf-8")) for slug in ORDER}


# ---------- mini-markdown dei testi (stesso formato di studio-programmazione) ----------

FENCE = re.compile(r"```(\w*)\n(.*?)```", re.S)


def inline(text: str) -> str:
    out = []
    for part in re.split(r"(`[^`]+`)", text):  # dentro `codice` nessuna formattazione
        if len(part) > 1 and part[0] == part[-1] == "`":
            out.append(f"<code>{escape(part[1:-1])}</code>")
            continue
        html = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", str(escape(part)))
        out.append(re.sub(r"(?<![*\w])\*([^*\s][^*]*?)\*(?![*\w])", r"<em>\1</em>", html))
    return "".join(out)


def _blocks(text: str) -> str:
    out = []
    for block in re.split(r"\n\s*\n", text.strip()):
        if not block.strip():
            continue
        lines = block.strip().splitlines()
        if block.startswith(("## ", "### ")):
            out.append(f"<h3>{inline(block.lstrip('#').strip())}</h3>")
        elif all(line.lstrip().startswith(("- ", "* ")) for line in lines):
            out.append("<ul>" + "".join(f"<li>{inline(line.lstrip()[2:])}</li>" for line in lines) + "</ul>")
        elif all(re.match(r"\s*\d+\. ", line) for line in lines):
            out.append("<ol>" + "".join(f"<li>{inline(line.split('. ', 1)[1])}</li>" for line in lines) + "</ol>")
        else:
            out.append(f"<p>{inline(' '.join(lines))}</p>")
    return "".join(out)


def render_md(text: str) -> Markup:
    """Tutto il testo passa da escape: i blocchi ```lang diventano <pre>, il resto paragrafi, titoli e liste."""
    out, pos = [], 0
    for m in FENCE.finditer(text):
        out.append(_blocks(text[pos : m.start()]))
        out.append(f"<pre><code>{escape(m.group(2).rstrip())}</code></pre>")
        pos = m.end()
    out.append(_blocks(text[pos:]))
    return Markup("".join(out))


@bp.app_template_filter("md")
def md_filter(text):
    return render_md(text)


@bp.app_template_filter("md_inline")
def md_inline_filter(text):
    return Markup(inline(text))


# ---------- progressi ----------


async def _passed() -> set[str]:
    query = select(FreeCourseProgress.lesson_key).where(FreeCourseProgress.user_id == g.user.id, FreeCourseProgress.passed)
    return set((await db().scalars(query)).all())


def _flags(slug: str, passed: set[str]) -> list[bool]:
    return [f"{slug}/{i}" in passed for i in range(len(COURSES[slug]["lessons"]))]


def _pct(done: int, total: int) -> int:
    return round(100 * done / total) if total else 0


async def _lesson(slug: str, idx: int):
    """Contesto della lezione, o None se è ancora bloccata (si sblocca superando la verifica della precedente)."""
    course = COURSES.get(slug)
    if not course or not 0 <= idx < len(course["lessons"]):
        abort(404)
    flags = _flags(slug, await _passed())
    if idx and not flags[idx - 1]:
        return None
    return {"slug": slug, "course": course, "lesson": course["lessons"][idx], "idx": idx, "passed": flags[idx],
            "pct": _pct(sum(flags), len(flags))}


# ---------- pagine ----------


@bp.get("/")
@login_required
async def index():
    passed = await _passed()
    cards = []
    for slug, course in COURSES.items():
        done = sum(_flags(slug, passed))
        cards.append({"slug": slug, "course": course, "done": done, "pct": _pct(done, len(course["lessons"]))})
    return await render_template("free_courses/index.html", cards=cards)


@bp.get("/<slug>")
@login_required
async def course(slug):
    if slug not in COURSES:
        abort(404)
    flags = _flags(slug, await _passed())
    return await render_template(
        "free_courses/course.html", slug=slug, course=COURSES[slug], flags=flags, pct=_pct(sum(flags), len(flags)),
        blocked=request.args.get("blocked", type=int),
    )


@bp.get("/<slug>/<int:idx>")
@login_required
async def lesson(slug, idx):
    if (ctx := await _lesson(slug, idx)) is None:
        return redirect(url_for("free_courses.course", slug=slug, blocked=idx + 1))
    return await render_template("free_courses/lesson.html", tab="lesson", **ctx)


@bp.route("/<slug>/<int:idx>/quiz", methods=["GET", "POST"])
@login_required
async def quiz(slug, idx):
    if (ctx := await _lesson(slug, idx)) is None:
        return redirect(url_for("free_courses.course", slug=slug, blocked=idx + 1))
    results = None
    if request.method == "POST":
        form = await request.form
        results = []
        for i, q in enumerate(ctx["lesson"]["quiz"]):
            raw = form.get(f"q{i}", "")
            chosen = int(raw) if raw.isdigit() else None
            results.append({"chosen": chosen, "ok": chosen == q["answer"]})
        score, total = sum(r["ok"] for r in results), len(results)
        stmt = insert(FreeCourseProgress).values(
            user_id=g.user.id, lesson_key=f"{slug}/{idx}", best_score=score, total=total, passed=score == total
        )
        # Il migliore risultato resta: un tentativo peggiore non richiude una lezione superata.
        await db().execute(stmt.on_conflict_do_update(
            index_elements=["user_id", "lesson_key"],
            set_={"best_score": func.greatest(FreeCourseProgress.best_score, stmt.excluded.best_score),
                  "total": stmt.excluded.total,
                  "passed": FreeCourseProgress.passed | stmt.excluded.passed,
                  "updated_at": stmt.excluded.updated_at},
        ))
        await db().commit()
        ctx = await _lesson(slug, idx)  # il superamento cambia barra e badge
    return await render_template("free_courses/quiz.html", tab="quiz", results=results, **ctx)
