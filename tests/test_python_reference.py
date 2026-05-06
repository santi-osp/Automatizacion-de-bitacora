from __future__ import annotations

import sys
import types
from pathlib import Path

fitz = types.ModuleType("fitz")
pil = types.ModuleType("PIL")
pil_image = types.ModuleType("PIL.Image")
sys.modules["fitz"] = fitz
sys.modules["PIL"] = pil
sys.modules["PIL.Image"] = pil_image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import rime_extractor


SAMPLES = [
    "\n".join(
        [
            "Ficha RIME",
            "Datos del Cliente",
            "Codigo Cliente : 123-45",
            "Cliente: Cliente Demo SAS",
            "Nombre Negocio: Tienda Demo",
            "Nit: 900.123-4",
            "Informacion Basica Negociacion",
            "Periodo Contrato Meses : 12",
            "Venta Mes Cajas Fisicas : 1.234,56",
            "Aporte en efectivo : $ 1.000.000",
            "Aporte en efectivo elementos : $ 250.000",
            "Descuento fondo promocional : $ 99.000",
            "Reposicion en bebida : $ 44.000",
            "Descuento del 12,5%",
            "Margen Contribucion C.F : $ 88.000",
        ]
    ),
    "\n".join(
        [
            "Analisis financiero del proyecto",
            "Cliente SAP: 777888",
            "Cliente: Otro Cliente",
            "Nombre Negocio: Barra Norte",
            "NIT: 800.222-1",
            "El periodo no debe sin superar 18 meses",
            "Objetivo de compra de 300 cajas mensuales",
            "Aportes en efectivo: $123.000",
            "Descuento en especie: $456.000",
            "Descuento fondo promocional: $789.000",
            "Reposicion de bebida: 23 cajas",
            "Total egresos: $ 999.000 8,4",
            "Margen contribucion - egresos: $321.000",
        ]
    ),
]

EXPECTED_FIELDS = [
    {
        "% inversión": "12,5",
        "Aporte en efectivo": "1.000.000",
        "Aporte en elementos": "250.000",
        "Cliente SAP": "123-45",
        "Duración de contrato en meses": "12",
        "Fondo promocional": "99.000",
        "Margen de contribución": "88.000",
        "NIT / Cédula": "900.123-4",
        "Nombre cliente": "Cliente Demo SAS",
        "Nombre negocio": "Tienda Demo",
        "Reposición en bebidas": "44.000",
        "Ventas cajas físicas por mes": "1.234,56",
    },
    {
        "% inversión": "",
        "Aporte en efectivo": "123.000",
        "Aporte en elementos": "456.000",
        "Cliente SAP": "777888",
        "Duración de contrato en meses": "18",
        "Fondo promocional": "789.000",
        "Margen de contribución": "321.000",
        "NIT / Cédula": "800.222-1",
        "Nombre cliente": "Otro Cliente",
        "Nombre negocio": "Barra Norte",
        "Reposición en bebidas": "23",
        "Ventas cajas físicas por mes": "300",
    },
]


for sample, expected in zip(SAMPLES, EXPECTED_FIELDS):
    assert rime_extractor._extract_fields(sample) == expected

assert rime_extractor._normalize("Reposición  en   bebidas") == "reposicion en bebidas"
assert rime_extractor._score_rime_page(SAMPLES[0]) == 4

print("Python reference tests passed.")
