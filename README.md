# Automatizacion de bitacora

Pagina estatica para extraer datos de Fichas RIME desde PDFs y descargar un Excel consolidado.

## Uso en GitHub Pages

Publica el repositorio desde la rama `main` y la carpeta raiz. La pagina principal es `index.html`.

## Validacion local

```powershell
node --check app.js
node tests/test_app_logic.js
python tests/test_python_reference.py
```

La version web usa:

- pdf.js para leer texto de PDFs en el navegador.
- Tesseract.js como fallback OCR cuando el PDF no tiene texto seleccionable.
- SheetJS para generar el archivo Excel.

Los scripts Python originales se conservan como referencia.
