from __future__ import annotations

import io
import re
import unicodedata
from dataclasses import dataclass
from typing import Dict

import fitz  # PyMuPDF
from PIL import Image

try:
    import pytesseract
except Exception:  # pragma: no cover
    pytesseract = None


FIXED_FIELDS: Dict[str, str] = {
    "Responsable": "Andrea Carolina Vélez",
    "Año": "2026",
    "Región": "Oriente",
    "Canal": "Todos",
    "Nombre CEDI": "",
}

OUTPUT_COLUMNS = [
    "Responsable",
    "ID",
    "Año",
    "Fecha inicio",
    "Fecha fin",
    "Cliente SAP",
    "Nombre cliente",
    "Nombre negocio",
    "NIT / Cédula",
    "Nombre CEDI",
    "Región",
    "Canal",
    "Duración de contrato en meses",
    "Ventas cajas físicas por mes",
    "Aporte en efectivo",
    "Aporte en elementos",
    "Fondo promocional",
    "Reposición en bebidas",
    "% inversión",
    "Margen de contribución",
]


def _extract_first(text: str, patterns: list[str]) -> str:
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE | re.MULTILINE)
        if m:
            for g in m.groups():
                if g and str(g).strip():
                    return str(g).strip()
    return ""


@dataclass
class ExtractionResult:
    selected_page: int
    selected_page_text: str
    row: Dict[str, str]
    used_ocr: bool
    ocr_available: bool


def _normalize(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", folded).strip().lower()


def _ocr_page(page: fitz.Page, zoom: float = 2.0) -> str:
    if pytesseract is None:
        return ""
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    text = pytesseract.image_to_string(img, lang="spa+eng")
    return text or ""


def _extract_page_text(page: fitz.Page) -> str:
    return page.get_text("text") or ""


def _score_rime_page(text: str) -> int:
    n = _normalize(text)
    signals = [
        "ficha rime",
        "datos del cliente",
        "informacion basica negociacion",
        "analisis financiero del proyecto",
        "reposicion de bebida",
        "venta mes cajas fisicas",
        "total egresos",
    ]
    return sum(1 for s in signals if s in n)


def _find_target_page(doc: fitz.Document) -> tuple[int, str, bool]:
    best_idx = 0
    best_score = -1
    best_text = _extract_page_text(doc[0]) if len(doc) > 0 else ""
    used_ocr = False

    for i in range(len(doc)):
        text = _extract_page_text(doc[i])
        score = _score_rime_page(text)
        if score > best_score:
            best_score = score
            best_idx = i
            best_text = text
            used_ocr = False

    if best_score >= 2:
        return best_idx, best_text, used_ocr

    for i in range(len(doc)):
        text = _ocr_page(doc[i])
        score = _score_rime_page(text)
        if score > best_score:
            best_score = score
            best_idx = i
            best_text = text
            used_ocr = True

    return best_idx, best_text, used_ocr


def _extract_fields(text: str) -> Dict[str, str]:
    normalized = _normalize(text)
    row = {
        "Cliente SAP": _extract_first(
            text,
            [r"Codigo\s+Cliente\s*:\s*([0-9\-]+)", r"Cliente\s*SAP\s*[:\-]\s*([^\n]+)"],
        ),
        "Nombre cliente": _extract_first(
            text, [r"^\s*Cliente\s*:\s*([^\n]+)", r"\nCliente\s*:\s*([^\n]+)"]
        ),
        "Nombre negocio": _extract_first(text, [r"Nombre\s+Negocio\s*:\s*([^\n]+)"]),
        "NIT / Cédula": _extract_first(text, [r"Nit\s*:\s*([0-9\.\-]+)", r"NIT\s*[:\-]\s*([0-9\.\-]+)"]),
        "Duración de contrato en meses": _extract_first(
            normalized,
            [r"periodo contrato meses\s*:\s*([0-9]+)", r"sin superar\s*([0-9]+)\s*meses"],
        ),
        "Ventas cajas físicas por mes": _extract_first(
            normalized,
            [r"venta mes cajas fisicas\s*:\s*([0-9\.,]+)", r"objetivo de compra de\s*([0-9\.,]+)\s*cajas mensuales"],
        ),
        "Aporte en efectivo": _extract_first(
            normalized, [r"aportes?\s+en\s+efectivo\s*:\s*\$?\s*([0-9\.,]+)"]
        ),
        "Aporte en elementos": _extract_first(
            normalized,
            [r"aportes?\s+en\s+efectivo\s+elementos\s*:\s*\$?\s*([0-9\.,]+)", r"descuento\s+en\s+especie\s*:\s*\$?\s*([0-9\.,]+)"],
        ),
        "Fondo promocional": _extract_first(
            normalized, [r"descuento\s+fondo\s+promocional\s*:\s*\$?\s*([0-9\.,]+)"]
        ),
        "Reposición en bebidas": _extract_first(
            normalized,
            [r"reposicion\s+en\s+bebida\s*:\s*\$?\s*([0-9\.,]+)", r"reposicion\s+de\s+bebida\s*:\s*([0-9\.,]+)\s*cajas"],
        ),
        "% inversión": _extract_first(
            normalized,
            [r"descuento\s+del\s*([0-9\.,]+)\s*%", r"total\s+egresos\s*:\s*\$[^\n]*\s([0-9\.,]+)\s*$"],
        ),
        "Margen de contribución": _extract_first(
            normalized, [r"margen\s+contribucion\s+c\.?f\s*:\s*\$?\s*([0-9\.,]+)", r"margen\s+contribucion\s*-\s*egresos\s*:\s*\$?\s*([0-9\.,]+)"]
        ),
    }
    return row


def extract_rime_row(
    pdf_bytes: bytes,
    activity_id: str,
    fecha_inicio: str,
    fecha_fin: str,
) -> ExtractionResult:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_index, text, used_ocr = _find_target_page(doc)
    full_text = "\n".join(_extract_page_text(doc[i]) for i in range(len(doc)))

    row: Dict[str, str] = {col: "" for col in OUTPUT_COLUMNS}
    row.update(FIXED_FIELDS)
    row["ID"] = activity_id.strip()
    row["Fecha inicio"] = fecha_inicio
    row["Fecha fin"] = fecha_fin

    row.update(_extract_fields(text))
    if not row["Cliente SAP"]:
        row["Cliente SAP"] = _extract_first(_normalize(full_text), [r"codigo\s+cliente\s*:\s*([0-9\-]+)"])

    return ExtractionResult(
        selected_page=page_index + 1,
        selected_page_text=text,
        row=row,
        used_ocr=used_ocr,
        ocr_available=pytesseract is not None,
    )
