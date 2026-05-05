(function (root) {
  "use strict";

  var FIXED_FIELDS = {
    Responsable: "Andrea Carolina V\u00e9lez",
    "A\u00f1o": "2026",
    "Regi\u00f3n": "Oriente",
    Canal: "Todos",
    "Nombre CEDI": "",
  };

  var OUTPUT_COLUMNS = [
    "Responsable",
    "ID",
    "A\u00f1o",
    "Fecha inicio",
    "Fecha fin",
    "Cliente SAP",
    "Nombre cliente",
    "Nombre negocio",
    "NIT / C\u00e9dula",
    "Nombre CEDI",
    "Regi\u00f3n",
    "Canal",
    "Duraci\u00f3n de contrato en meses",
    "Ventas cajas f\u00edsicas por mes",
    "Aporte en efectivo",
    "Aporte en elementos",
    "Fondo promocional",
    "Reposici\u00f3n en bebidas",
    "% inversi\u00f3n",
    "Margen de contribuci\u00f3n",
  ];

  var RIME_SIGNALS = [
    "ficha rime",
    "datos del cliente",
    "informacion basica negociacion",
    "analisis financiero del proyecto",
    "reposicion de bebida",
    "venta mes cajas fisicas",
    "total egresos",
  ];

  var DEFAULT_RANGE = "22-04-2026 - 08-01-2027";
  var EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  var PDF_WORKER =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  function normalizeText(text) {
    return String(text || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function extractFirst(text, patterns) {
    var source = String(text || "");
    for (var i = 0; i < patterns.length; i += 1) {
      var match = patterns[i].exec(source);
      if (match) {
        for (var groupIndex = 1; groupIndex < match.length; groupIndex += 1) {
          var group = match[groupIndex];
          if (group && String(group).trim()) {
            return String(group).trim();
          }
        }
      }
    }
    return "";
  }

  function extractFields(text) {
    var normalized = normalizeText(text);
    return {
      "Cliente SAP": extractFirst(text, [
        /Codigo\s+Cliente\s*:\s*([0-9\-]+)/im,
        /Cliente\s*SAP\s*[:\-]\s*([^\n]+)/im,
      ]),
      "Nombre cliente": extractFirst(text, [
        /^\s*Cliente\s*:\s*([^\n]+)/im,
        /\nCliente\s*:\s*([^\n]+)/im,
      ]),
      "Nombre negocio": extractFirst(text, [/Nombre\s+Negocio\s*:\s*([^\n]+)/im]),
      "NIT / C\u00e9dula": extractFirst(text, [
        /Nit\s*:\s*([0-9\.\-]+)/im,
        /NIT\s*[:\-]\s*([0-9\.\-]+)/im,
      ]),
      "Duraci\u00f3n de contrato en meses": extractFirst(normalized, [
        /periodo contrato meses\s*:\s*([0-9]+)/im,
        /sin superar\s*([0-9]+)\s*meses/im,
      ]),
      "Ventas cajas f\u00edsicas por mes": extractFirst(normalized, [
        /venta mes cajas fisicas\s*:\s*([0-9\.,]+)/im,
        /objetivo de compra de\s*([0-9\.,]+)\s*cajas mensuales/im,
      ]),
      "Aporte en efectivo": extractFirst(normalized, [
        /aportes?\s+en\s+efectivo\s*:\s*\$?\s*([0-9\.,]+)/im,
      ]),
      "Aporte en elementos": extractFirst(normalized, [
        /aportes?\s+en\s+efectivo\s+elementos\s*:\s*\$?\s*([0-9\.,]+)/im,
        /descuento\s+en\s+especie\s*:\s*\$?\s*([0-9\.,]+)/im,
      ]),
      "Fondo promocional": extractFirst(normalized, [
        /descuento\s+fondo\s+promocional\s*:\s*\$?\s*([0-9\.,]+)/im,
      ]),
      "Reposici\u00f3n en bebidas": extractFirst(normalized, [
        /reposicion\s+en\s+bebida\s*:\s*\$?\s*([0-9\.,]+)/im,
        /reposicion\s+de\s+bebida\s*:\s*([0-9\.,]+)\s*cajas/im,
      ]),
      "% inversi\u00f3n": extractFirst(normalized, [
        /descuento\s+del\s*([0-9\.,]+)\s*%/im,
        /total\s+egresos\s*:\s*\$[^\n]*\s([0-9\.,]+)\s*$/im,
      ]),
      "Margen de contribuci\u00f3n": extractFirst(normalized, [
        /margen\s+contribucion\s+c\.?f\s*:\s*\$?\s*([0-9\.,]+)/im,
        /margen\s+contribucion\s*-\s*egresos\s*:\s*\$?\s*([0-9\.,]+)/im,
      ]),
    };
  }

  function scoreRimePage(text) {
    var normalized = normalizeText(text);
    return RIME_SIGNALS.reduce(function (score, signal) {
      return score + (normalized.indexOf(signal) >= 0 ? 1 : 0);
    }, 0);
  }

  function findBestTextPage(pageTexts) {
    var bestIndex = 0;
    var bestScore = -1;
    var bestText = pageTexts.length > 0 ? pageTexts[0] : "";

    pageTexts.forEach(function (text, index) {
      var score = scoreRimePage(text);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
        bestText = text;
      }
    });

    return {
      index: bestIndex,
      text: bestText,
      score: bestScore,
      usedOcr: false,
    };
  }

  function buildRow(text, fullText, activityId, fechaInicio, fechaFin) {
    var row = {};
    OUTPUT_COLUMNS.forEach(function (column) {
      row[column] = "";
    });

    Object.keys(FIXED_FIELDS).forEach(function (key) {
      row[key] = FIXED_FIELDS[key];
    });

    row.ID = String(activityId || "").trim();
    row["Fecha inicio"] = fechaInicio;
    row["Fecha fin"] = fechaFin;

    var fields = extractFields(text);
    Object.keys(fields).forEach(function (key) {
      row[key] = fields[key];
    });

    if (!row["Cliente SAP"]) {
      row["Cliente SAP"] = extractFirst(normalizeText(fullText), [
        /codigo\s+cliente\s*:\s*([0-9\-]+)/im,
      ]);
    }

    return row;
  }

  function extractRimeRowFromTexts(pageTexts, activityId, fechaInicio, fechaFin) {
    var target = findBestTextPage(pageTexts || []);
    return {
      selectedPage: target.index + 1,
      selectedPageText: target.text,
      row: buildRow(
        target.text,
        (pageTexts || []).join("\n"),
        activityId,
        fechaInicio,
        fechaFin
      ),
      usedOcr: false,
      ocrAvailable: false,
    };
  }

  function parseDateRange(value) {
    var match = String(value || "")
      .trim()
      .match(
        /^\s*(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s*-\s*(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s*$/
      );

    if (!match) {
      throw new Error("Usa formato: DD-MM-YYYY - DD-MM-YYYY");
    }

    var start = parseDateParts(match[1], match[2], match[3]);
    var end = parseDateParts(match[4], match[5], match[6]);

    if (!isValidDate(start) || !isValidDate(end)) {
      throw new Error("Fecha invalida.");
    }

    if (dateKey(start) > dateKey(end)) {
      throw new Error("La fecha inicio no puede ser mayor que la fecha fin.");
    }

    return {
      inicio: formatDateParts(start),
      fin: formatDateParts(end),
    };
  }

  function parseDateParts(day, month, year) {
    return {
      day: Number(day),
      month: Number(month),
      year: Number(year),
      dayText: day,
      monthText: month,
      yearText: year,
    };
  }

  function isValidDate(parts) {
    var date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    return (
      date.getUTCFullYear() === parts.year &&
      date.getUTCMonth() === parts.month - 1 &&
      date.getUTCDate() === parts.day
    );
  }

  function dateKey(parts) {
    return parts.year * 10000 + parts.month * 100 + parts.day;
  }

  function formatDateParts(parts) {
    return parts.dayText + "/" + parts.monthText + "/" + parts.yearText;
  }

  function getPdfJs() {
    var pdfjs = root.pdfjsLib;
    if (!pdfjs) {
      throw new Error("No se pudo cargar pdf.js.");
    }
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    }
    return pdfjs;
  }

  async function extractPdfFile(file, activityId, fechaInicio, fechaFin, onProgress) {
    var pdfjs = getPdfJs();
    var bytes = await file.arrayBuffer();
    var loadingTask = pdfjs.getDocument({ data: bytes });
    var pdf = await loadingTask.promise;
    var pages = [];

    for (var pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (onProgress) {
        onProgress({ phase: "text", pageNumber: pageNumber, totalPages: pdf.numPages });
      }
      var page = await pdf.getPage(pageNumber);
      var text = await extractTextFromPdfPage(page);
      pages.push({ page: page, pageNumber: pageNumber, text: text });
    }

    var target = findBestTextPage(
      pages.map(function (pageInfo) {
        return pageInfo.text;
      })
    );
    var usedOcr = false;
    var ocrAvailable = Boolean(root.Tesseract && root.document);

    if (target.score < 2 && ocrAvailable) {
      var currentOcrProgress = null;
      var worker = await createOcrWorker(function (detail) {
        if (currentOcrProgress) {
          currentOcrProgress(detail);
        }
      });

      try {
        for (var i = 0; i < pages.length; i += 1) {
          var pageInfo = pages[i];
          currentOcrProgress = function (detail) {
            if (onProgress) {
              onProgress({
                phase: "ocr",
                pageNumber: pageInfo.pageNumber,
                totalPages: pdf.numPages,
                detail: detail,
              });
            }
          };

          var ocrText = await ocrPdfPage(pageInfo.page, worker);
          var ocrScore = scoreRimePage(ocrText);
          if (ocrScore > target.score) {
            target = {
              index: i,
              text: ocrText,
              score: ocrScore,
              usedOcr: true,
            };
            usedOcr = true;
          }
        }
      } finally {
        currentOcrProgress = null;
        if (worker && typeof worker.terminate === "function") {
          await worker.terminate();
        }
      }
    }

    return {
      selectedPage: target.index + 1,
      selectedPageText: target.text,
      row: buildRow(
        target.text,
        pages
          .map(function (pageInfo) {
            return pageInfo.text;
          })
          .join("\n"),
        activityId,
        fechaInicio,
        fechaFin
      ),
      usedOcr: usedOcr,
      ocrAvailable: ocrAvailable,
    };
  }

  async function extractTextFromPdfPage(page) {
    var content = await page.getTextContent();
    return textContentToLines(content);
  }

  function textContentToLines(content) {
    var items = (content && content.items ? content.items : []).filter(function (item) {
      return item && String(item.str || "").trim();
    });

    if (!items.length) {
      return "";
    }

    var lines = [];
    var tolerance = 3;

    items.forEach(function (item) {
      var transform = item.transform || [0, 0, 0, 0, 0, 0];
      var x = Number(transform[4]) || 0;
      var y = Number(transform[5]) || 0;
      var line = null;

      for (var i = 0; i < lines.length; i += 1) {
        if (Math.abs(lines[i].y - y) <= tolerance) {
          line = lines[i];
          break;
        }
      }

      if (!line) {
        line = { y: y, items: [] };
        lines.push(line);
      }

      line.items.push({ x: x, text: String(item.str).trim() });
    });

    return lines
      .sort(function (a, b) {
        return b.y - a.y;
      })
      .map(function (line) {
        return line.items
          .sort(function (a, b) {
            return a.x - b.x;
          })
          .map(function (item) {
            return item.text;
          })
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      })
      .filter(Boolean)
      .join("\n");
  }

  async function createOcrWorker(logger) {
    if (!root.Tesseract) {
      throw new Error("OCR no disponible.");
    }

    if (typeof root.Tesseract.createWorker === "function") {
      try {
        return await root.Tesseract.createWorker("spa+eng", 1, { logger: logger });
      } catch (error) {
        var legacyWorker = await root.Tesseract.createWorker({ logger: logger });
        if (typeof legacyWorker.loadLanguage === "function") {
          await legacyWorker.loadLanguage("spa+eng");
        }
        if (typeof legacyWorker.initialize === "function") {
          await legacyWorker.initialize("spa+eng");
        }
        return legacyWorker;
      }
    }

    if (typeof root.Tesseract.recognize === "function") {
      return {
        recognize: function (image) {
          return root.Tesseract.recognize(image, "spa+eng", { logger: logger });
        },
        terminate: function () {
          return Promise.resolve();
        },
      };
    }

    throw new Error("OCR no disponible.");
  }

  async function ocrPdfPage(page, worker) {
    var viewport = page.getViewport({ scale: 2 });
    var canvas = root.document.createElement("canvas");
    var context = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({ canvasContext: context, viewport: viewport }).promise;

    var result = await worker.recognize(canvas);

    return (result && result.data && result.data.text) || (result && result.text) || "";
  }

  function renderTable(table, rows, columns) {
    table.textContent = "";

    var thead = table.createTHead();
    var headRow = thead.insertRow();
    columns.forEach(function (column) {
      var th = root.document.createElement("th");
      th.textContent = column;
      headRow.appendChild(th);
    });

    var tbody = table.createTBody();
    rows.forEach(function (row) {
      var tr = tbody.insertRow();
      columns.forEach(function (column) {
        var td = tr.insertCell();
        td.textContent = row[column] == null ? "" : String(row[column]);
      });
    });
  }

  function downloadExcel(rows) {
    if (!root.XLSX) {
      throw new Error("No se pudo cargar la libreria de Excel.");
    }

    var worksheet = root.XLSX.utils.json_to_sheet(rows, { header: OUTPUT_COLUMNS });
    var workbook = root.XLSX.utils.book_new();
    root.XLSX.utils.book_append_sheet(workbook, worksheet, "Fichas RIME");

    var data = root.XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    var blob = new Blob([data], { type: EXCEL_MIME });
    var url = URL.createObjectURL(blob);
    var link = root.document.createElement("a");
    link.href = url;
    link.download = "fichas_rime_consolidado.xlsx";
    root.document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function initBrowserApp() {
    var fileInput = root.document.getElementById("pdfFiles");
    var fileDropMeta = root.document.getElementById("fileDropMeta");
    var metadataForm = root.document.getElementById("metadataForm");
    var fileRows = root.document.getElementById("fileRows");
    var processButton = root.document.getElementById("processButton");
    var messages = root.document.getElementById("messages");
    var controlSection = root.document.getElementById("controlSection");
    var controlTable = root.document.getElementById("controlTable");
    var resultsSection = root.document.getElementById("resultsSection");
    var pageSummary = root.document.getElementById("pageSummary");
    var previewTable = root.document.getElementById("previewTable");
    var downloadButton = root.document.getElementById("downloadButton");
    var selectedFiles = [];
    var latestRows = [];

    if (!fileInput || !metadataForm) {
      return;
    }

    fileInput.addEventListener("change", function () {
      selectedFiles = Array.prototype.slice.call(fileInput.files || []);
      latestRows = [];
      downloadButton.disabled = true;
      resultsSection.hidden = true;
      controlSection.hidden = true;
      clearMessages(messages);

      fileDropMeta.textContent = selectedFiles.length
        ? selectedFiles.length + " archivo(s) seleccionado(s)"
        : "Ningun archivo seleccionado";

      renderFileRows(fileRows, selectedFiles);
      metadataForm.hidden = selectedFiles.length === 0;
    });

    metadataForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearMessages(messages);
      latestRows = [];
      downloadButton.disabled = true;
      resultsSection.hidden = true;

      var collected = collectMetadata(selectedFiles);
      if (collected.errors.length) {
        collected.errors.forEach(function (error) {
          showMessage(messages, "error", error);
        });
        return;
      }

      renderTable(
        controlTable,
        collected.items.map(function (item) {
          return {
            "Archivo PDF": item.file.name,
            "ID digitado": item.id,
            "Rango digitado": item.rangeText,
          };
        }),
        ["Archivo PDF", "ID digitado", "Rango digitado"]
      );
      controlSection.hidden = false;

      processButton.disabled = true;
      showMessage(messages, "info", "Leyendo " + collected.items.length + " PDF(s)...");

      try {
        var selectedPages = [];
        var usedOcrCount = 0;
        var ocrAvailable = true;

        for (var i = 0; i < collected.items.length; i += 1) {
          var item = collected.items[i];
          setLastMessage(
            messages,
            "info",
            "Procesando " + item.file.name + " (" + (i + 1) + "/" + collected.items.length + ")"
          );
          var result = await extractPdfFile(
            item.file,
            item.id,
            item.dates.inicio,
            item.dates.fin,
            function (progress) {
              updateProgress(messages, item.file.name, progress);
            }
          );

          latestRows.push(result.row);
          selectedPages.push(item.file.name + " -> pag " + result.selectedPage);
          ocrAvailable = result.ocrAvailable;
          if (result.usedOcr) {
            usedOcrCount += 1;
          }
        }

        clearMessages(messages);
        showMessage(
          messages,
          "success",
          "Se procesaron " +
            latestRows.length +
            " PDF(s). Cada archivo queda en su propia fila."
        );

        if (!ocrAvailable) {
          showMessage(messages, "info", "OCR no disponible. Solo se uso texto seleccionable.");
        } else if (usedOcrCount > 0) {
          showMessage(
            messages,
            "info",
            "Se uso OCR en " + usedOcrCount + " de " + latestRows.length + " archivo(s)."
          );
        }

        pageSummary.textContent = "Paginas detectadas por archivo: " + selectedPages.join(", ");
        renderTable(previewTable, latestRows, OUTPUT_COLUMNS);
        resultsSection.hidden = false;
        downloadButton.disabled = latestRows.length === 0;
      } catch (error) {
        clearMessages(messages);
        showMessage(messages, "error", error.message || String(error));
      } finally {
        processButton.disabled = false;
      }
    });

    downloadButton.addEventListener("click", function () {
      try {
        downloadExcel(latestRows);
      } catch (error) {
        showMessage(messages, "error", error.message || String(error));
      }
    });
  }

  function renderFileRows(container, files) {
    container.textContent = "";
    files.forEach(function (file, index) {
      var row = root.document.createElement("section");
      row.className = "file-row";
      row.dataset.index = String(index);

      var fileName = root.document.createElement("div");
      fileName.className = "file-name";
      fileName.textContent = index + 1 + ". " + file.name;
      row.appendChild(fileName);

      var fields = root.document.createElement("div");
      fields.className = "field-grid";

      fields.appendChild(
        createInputField("ID actividad #" + (index + 1) + " *", "id_" + index, "AIS22", "")
      );
      fields.appendChild(
        createInputField(
          "Rango fechas #" + (index + 1) + " *",
          "fr_" + index,
          "DD-MM-YYYY - DD-MM-YYYY",
          DEFAULT_RANGE
        )
      );

      row.appendChild(fields);
      container.appendChild(row);
    });
  }

  function createInputField(labelText, id, placeholder, value) {
    var wrapper = root.document.createElement("div");
    wrapper.className = "field";

    var label = root.document.createElement("label");
    label.htmlFor = id;
    label.textContent = labelText;

    var input = root.document.createElement("input");
    input.id = id;
    input.name = id;
    input.type = "text";
    input.placeholder = placeholder;
    input.value = value;

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }

  function collectMetadata(files) {
    var errors = [];
    var items = files.map(function (file, index) {
      var idInput = root.document.getElementById("id_" + index);
      var rangeInput = root.document.getElementById("fr_" + index);
      var id = idInput ? idInput.value.trim() : "";
      var rangeText = rangeInput ? rangeInput.value.trim() : "";
      var dates = null;

      if (!id) {
        errors.push("Falta el ID del archivo #" + (index + 1) + ": " + file.name);
      }

      try {
        dates = parseDateRange(rangeText);
      } catch (error) {
        errors.push(
          "Fecha invalida en archivo #" +
            (index + 1) +
            " (" +
            file.name +
            "): " +
            error.message
        );
      }

      return {
        file: file,
        id: id,
        rangeText: rangeText,
        dates: dates,
      };
    });

    return {
      errors: errors,
      items: items,
    };
  }

  function clearMessages(container) {
    container.textContent = "";
  }

  function showMessage(container, type, text) {
    var message = root.document.createElement("div");
    message.className = "message " + type;
    message.textContent = text;
    container.appendChild(message);
  }

  function setLastMessage(container, type, text) {
    if (!container.lastElementChild) {
      showMessage(container, type, text);
      return;
    }
    container.lastElementChild.className = "message " + type;
    container.lastElementChild.textContent = text;
  }

  function updateProgress(container, fileName, progress) {
    if (!progress) {
      return;
    }

    if (progress.phase === "text") {
      setLastMessage(
        container,
        "info",
        "Leyendo texto de " +
          fileName +
          " pag " +
          progress.pageNumber +
          "/" +
          progress.totalPages
      );
      return;
    }

    if (progress.phase === "ocr") {
      var detail = progress.detail || {};
      var percent =
        typeof detail.progress === "number" ? " " + Math.round(detail.progress * 100) + "%" : "";
      setLastMessage(
        container,
        "info",
        "OCR " +
          fileName +
          " pag " +
          progress.pageNumber +
          "/" +
          progress.totalPages +
          percent
      );
    }
  }

  var api = {
    FIXED_FIELDS: FIXED_FIELDS,
    OUTPUT_COLUMNS: OUTPUT_COLUMNS,
    normalizeText: normalizeText,
    extractFirst: extractFirst,
    extractFields: extractFields,
    scoreRimePage: scoreRimePage,
    findBestTextPage: findBestTextPage,
    buildRow: buildRow,
    extractRimeRowFromTexts: extractRimeRowFromTexts,
    parseDateRange: parseDateRange,
    textContentToLines: textContentToLines,
  };

  root.RimeApp = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root.document) {
    root.document.addEventListener("DOMContentLoaded", initBrowserApp);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
