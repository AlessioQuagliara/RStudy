from app.free_courses import COURSES, render_md

from .conftest import register


def test_all_lessons_render_and_quizzes_are_valid():
    for course in COURSES.values():
        for lesson in course["lessons"]:
            assert render_md(lesson["body"])
            for q in lesson["quiz"]:
                assert 0 <= q["answer"] < len(q["options"])


def test_markdown_escapes_html():
    html = render_md("<script>x</script> e `<b>`\n\n```html\n<p>ciao</p>\n```")
    assert "<script>" not in html and "&lt;b&gt;" in html and "&lt;p&gt;ciao" in html


def _answers(lesson, wrong=False):
    return {f"q{i}": str((q["answer"] + wrong) % len(q["options"])) for i, q in enumerate(lesson["quiz"])}


async def test_quiz_unlocks_next_lesson_and_keeps_best(db_client):
    await register(db_client)
    web = COURSES["web"]["lessons"]
    assert "Basi del Web" in await (await db_client.get("/free-courses/")).get_data(as_text=True)

    assert (await db_client.get("/free-courses/web/1")).headers["Location"] == "/free-courses/web?blocked=2"
    page = await (await db_client.post("/free-courses/web/0/quiz", form=_answers(web[0], wrong=True))).get_data(as_text=True)
    assert "Nessun problema" in page
    assert (await db_client.get("/free-courses/web/1")).status_code == 302

    page = await (await db_client.post("/free-courses/web/0/quiz", form=_answers(web[0]))).get_data(as_text=True)
    assert "Lezione completata" in page
    assert (await db_client.get("/free-courses/web/1")).status_code == 200

    # Un tentativo peggiore dopo il superamento non richiude la lezione.
    await db_client.post("/free-courses/web/0/quiz", form=_answers(web[0], wrong=True))
    assert (await db_client.get("/free-courses/web/1")).status_code == 200
    assert (await db_client.get("/free-courses/nope")).status_code == 404
    assert (await db_client.get("/free-courses/web/99")).status_code == 404
