import io
import zipfile
from io import BytesIO

from sqlalchemy import select
from werkzeug.datastructures import FileStorage, MultiDict
from werkzeug.test import encode_multipart

from app.db import db
from app.materials import extract_text
from app.models import Material

from .conftest import register
from .test_courses import _create_course, _create_lesson



def _pdf(text: str) -> bytes:
    """PDF minimo di una pagina, con la tabella xref che pypdf richiede."""
    stream = f"BT /F1 12 Tf 10 50 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R"
        b" /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (i, body)
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer << /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(objects) + 1, xref)
    return bytes(out)


PDF = _pdf("Teorema del confronto")


def _docx(*paragraphs: str) -> bytes:
    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    body = "".join(f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("word/document.xml", f'<w:document xmlns:w="{ns}"><w:body>{body}</w:body></w:document>')
    return buf.getvalue()


def test_extract_text():
    assert extract_text("a.txt", b"riga  1\r\n\n\n\nriga\x002") == ("done", "riga 1\n\nriga2")
    assert extract_text("a.MD", "# Limiti".encode()) == ("done", "# Limiti")
    assert extract_text("a.docx", _docx("Primo", "Secondo")) == ("done", "Primo\nSecondo")
    status, text = extract_text("slide.pdf", PDF)
    assert status == "done" and "Teorema del confronto" in text
    assert extract_text("a.txt", b"   ") == ("unsupported", None)
    assert extract_text("foto.png", b"\x89PNG") == ("unsupported", None)
    assert extract_text("rotto.pdf", b"non un pdf") == ("failed", None)
    assert extract_text("rotto.docx", b"non uno zip") == ("failed", None)


async def _upload(client, url, *files, **form):
    # Il client di test di Quart accetta un solo file per campo: il corpo multipart si costruisce qui.
    values = MultiDict(form)
    for name, data in files:
        values.add("files", FileStorage(BytesIO(data), filename=name))
    boundary, body = encode_multipart(values)
    return await client.post(url, data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})


async def test_upload_list_delete(db_app, db_client):
    await register(db_client)
    course_id = await _create_course(db_client)
    lesson_id = await _create_lesson(db_client, course_id)
    response = await _upload(
        db_client, f"/courses/{course_id}/materials",
        ("../../Appunti limiti.txt", b"Il limite"), ("slide.pdf", PDF), ("foto.png", b"x"),
        material_type="notes", lesson_id=lesson_id,
    )
    assert response.status_code == 302 and response.headers["Location"].endswith("tab=materials")

    page = await (await db_client.get(f"/courses/{course_id}?tab=materials")).get_data(as_text=True)
    assert "Appunti limiti" in page and "Testo estratto" in page and "Testo non estraibile" in page
    async with db_app.app_context():
        rows = {m.original_filename: m for m in await db().scalars(select(Material))}
        assert set(rows) == {"Appunti limiti.txt", "slide.pdf", "foto.png"}  # niente percorso nel nome
        note = rows["Appunti limiti.txt"]
        assert note.extracted_text == "Il limite" and note.material_type == "notes" and str(note.lesson_id) == lesson_id
        assert note.mime_type == "text/plain" and note.file_size == 9

    # Il limite di 1 MB delle altre pagine non vale qui.
    big = await _upload(db_client, f"/courses/{course_id}/materials", ("grande.txt", b"a" * 2_000_000))
    assert big.status_code == 302

    assert (await db_client.post(f"/courses/{course_id}/materials/{note.id}/delete")).status_code == 302
    async with db_app.app_context():
        assert await db().get(Material, note.id) is None


async def test_upload_validation_and_ownership(db_app, db_client):
    await register(db_client)
    course_id = await _create_course(db_client)
    other_course = await _create_course(db_client, title="Fisica")
    other_lesson = await _create_lesson(db_client, other_course)
    url = f"/courses/{course_id}/materials"
    # Nessun file, tipo non valido, lezione di un altro corso.
    assert (await _upload(db_client, url)).status_code == 302
    assert (await _upload(db_client, url, ("a.txt", b"x"), material_type="boh")).status_code == 302
    assert (await _upload(db_client, url, ("a.txt", b"x"), lesson_id=other_lesson)).status_code == 404
    async with db_app.app_context():
        assert await db().scalar(select(Material)) is None

    await _upload(db_client, url, ("a.txt", b"x"))
    async with db_app.app_context():
        material_id = await db().scalar(select(Material.id))
    await db_client.post("/logout")
    await register(db_client, email="b@example.com")
    assert (await _upload(db_client, url, ("a.txt", b"x"))).status_code == 404
    assert (await db_client.post(f"{url}/{material_id}/delete")).status_code == 404
