"use strict";

importScripts("./vendor/xlsx.full.min.js", "./ods-parser.js?v=20260921-upload");

self.addEventListener("message", (event) => {
  try {
    self.postMessage({ type: "progress", message: "Analizando la estructura del archivo..." });
    const parsed = self.ODSParser.parseWorkbook(event.data.buffer, {
      profitCenter: event.data.profitCenter,
    });
    self.postMessage({
      type: "progress",
      message: `Preparando ${parsed.rows.length.toLocaleString("es-CO")} registros de CARACARA...`,
    });
    self.postMessage({ type: "success", payload: parsed });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error?.message || "No se pudo procesar el archivo XLSX.",
    });
  }
});
