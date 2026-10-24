"""Estrazione del testo dai materiali caricati: porting di documentParser.ts del desktop (txt, md, pdf, docx).

Funzione sincrona e CPU-bound: le pagine la chiamano con asyncio.to_thread.
"""

import io
import re
import zipfile
from pathlib import PurePath
from xml.etree import ElementTree

from pypdf import PdfReader

MIME_BY_EXT = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
# Stesso tetto degli appunti nel backup: oltre, il testo viene troncato.
TEXT_MAX = 500_000
# Un docx è uno zip: si legge al più questo dal suo XML, contro gli zip "bomba".
DOCX_XML_MAX = 50 * 1024 * 1024
_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _normalize(raw: str) -> str:
    text = raw.replace("\r\n", "\n").replace("\x00", "")  # Postgres rifiuta NUL nei campi di testo
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()[:TEXT_MAX]


def _docx_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as zf, zf.open("word/document.xml") as f:
        xml = f.read(DOCX_XML_MAX + 1)
    if len(xml) > DOCX_XML_MAX:
        raise ValueError("document.xml troppo grande")
    root = ElementTree.fromstring(xml)
    return "\n".join("".join(t.text or "" for t in p.iter(f"{_W}t")) for p in root.iter(f"{_W}p"))


def extract_text(filename: str, data: bytes) -> tuple[str, str | None]:
    """(stato, testo) con gli stati del desktop: done, unsupported (formato o testo assente), failed."""
    ext = PurePath(filename).suffix.lower()
    try:
        if ext in (".txt", ".md", ".markdown"):
            raw = data.decode("utf-8", errors="replace")
        elif ext == ".pdf":
            raw = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(data)).pages)
        elif ext == ".docx":
            raw = _docx_text(data)
        else:
            return "unsupported", None
    except Exception:
        return "failed", None
    text = _normalize(raw)
    return ("done", text) if text else ("unsupported", None)
