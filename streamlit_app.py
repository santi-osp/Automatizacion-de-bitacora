from __future__ import annotations

import io
from datetime import date
import re

import pandas as pd
import streamlit as st

from rime_extractor import OUTPUT_COLUMNS, extract_rime_row

st.set_page_config(page_title="Extractor Ficha RIME", page_icon=":page_facing_up:", layout="wide")
st.title("Extractor de Ficha RIME -> Excel")
st.caption(
    "Cada PDF se diligencia por separado (ID + fechas + archivo) para evitar cruces de informacion."
)

pdf_files = st.file_uploader("Archivos PDF *", type=["pdf"], accept_multiple_files=True)


def _to_ddmmyyyy(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def _parse_fecha_rango(value: str) -> tuple[str, str]:
    text = (value or "").strip()
    pattern = r"^\s*(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s*-\s*(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s*$"
    m = re.match(pattern, text)
    if not m:
        raise ValueError("Usa formato: DD-MM-YYYY - DD-MM-YYYY")
    d1, m1, y1, d2, m2, y2 = m.groups()
    inicio = date(int(y1), int(m1), int(d1))
    fin = date(int(y2), int(m2), int(d2))
    if inicio > fin:
        raise ValueError("La fecha inicio no puede ser mayor que la fecha fin.")
    return inicio.strftime("%d/%m/%Y"), fin.strftime("%d/%m/%Y")


if pdf_files:
    st.markdown("### Diligenciamiento por archivo")
    with st.form("rime-per-file-form"):
        metadata = []
        for idx, pdf_file in enumerate(pdf_files):
            st.markdown(f"**{idx + 1}. {pdf_file.name}**")
            c1, c2 = st.columns([1.1, 1.4])
            with c1:
                activity_id = st.text_input(
                    f"ID actividad #{idx + 1} *",
                    value="",
                    key=f"id_{idx}",
                    placeholder="Ejemplo: AIS22",
                )
                st.caption("Ejemplo ID manual: AIS22")
            with c2:
                fecha_rango_texto = st.text_input(
                    f"Rango fechas #{idx + 1} *",
                    value="22-04-2026 - 08-01-2027",
                    key=f"fr_{idx}",
                    help="Formato: DD-MM-YYYY - DD-MM-YYYY",
                )
                st.caption("Formato: DD-MM-YYYY - DD-MM-YYYY")
            st.markdown(
                "<small>La app separa automaticamente este rango en fecha inicio y fecha fin.</small>",
                unsafe_allow_html=True,
            )
            metadata.append(
                {
                    "file": pdf_file,
                    "id": activity_id,
                    "fecha_rango_texto": fecha_rango_texto,
                }
            )
            st.divider()

        submitted = st.form_submit_button("Procesar PDFs")

    if submitted:
        errors = []
        parsed_ranges: list[tuple[str, str]] = []
        for idx, item in enumerate(metadata):
            if not str(item["id"]).strip():
                errors.append(f"Falta el ID del archivo #{idx + 1}: {item['file'].name}")
            try:
                parsed_ranges.append(_parse_fecha_rango(str(item["fecha_rango_texto"])))
            except ValueError as e:
                errors.append(
                    f"Fecha invalida en archivo #{idx + 1} ({item['file'].name}): {e}"
                )

        if errors:
            for err in errors:
                st.error(err)
            st.stop()

        # Tabla de control para validar que cada PDF quede con su ID y rango correcto.
        st.subheader("Control antes de extraer")
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "Archivo PDF": item["file"].name,
                        "ID digitado": str(item["id"]).strip(),
                        "Rango digitado": str(item["fecha_rango_texto"]).strip(),
                    }
                    for item in metadata
                ]
            ),
            use_container_width=True,
            hide_index=True,
        )

        rows = []
        used_ocr_count = 0
        selected_pages = []
        ocr_available = True

        with st.spinner(f"Leyendo {len(metadata)} PDF(s) y extrayendo datos de Ficha RIME..."):
            for item, (fecha_inicio_txt, fecha_fin_txt) in zip(metadata, parsed_ranges):
                result = extract_rime_row(
                    pdf_bytes=item["file"].getvalue(),
                    activity_id=str(item["id"]).strip(),
                    fecha_inicio=fecha_inicio_txt,
                    fecha_fin=fecha_fin_txt,
                )
                rows.append(result.row)
                selected_pages.append((item["file"].name, result.selected_page))
                ocr_available = result.ocr_available
                if result.used_ocr:
                    used_ocr_count += 1

        st.success(
            f"Se procesaron {len(rows)} PDF(s). Cada archivo queda en su propia fila con su propio ID y fechas."
        )
        st.caption(
            "Paginas detectadas por archivo: "
            + ", ".join([f"{name} -> pag {page}" for name, page in selected_pages])
        )

        if rows and not ocr_available:
            st.info("OCR no disponible (pytesseract no instalado o no accesible). Solo se uso texto seleccionable.")
        elif used_ocr_count > 0:
            st.info(f"Se uso OCR en {used_ocr_count} de {len(rows)} archivo(s).")

        df = pd.DataFrame(rows, columns=OUTPUT_COLUMNS)
        st.subheader("Vista previa")
        st.dataframe(df, use_container_width=True, hide_index=True)

        excel_buffer = io.BytesIO()
        df.to_excel(excel_buffer, index=False, engine="openpyxl")
        excel_buffer.seek(0)

        st.download_button(
            "Descargar Excel",
            data=excel_buffer,
            file_name="fichas_rime_consolidado.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

st.divider()
st.markdown(
    """
- Campos fijos: Responsable, Ano, Region, Canal y Nombre CEDI.
- Si un dato no aparece en el PDF, queda en blanco.
- Cada PDF se diligencia individualmente con su propio ID y fechas.
- Para correr la app: `streamlit run streamlit_app.py`
"""
)
