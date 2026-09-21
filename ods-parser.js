(function attachOdsParser(root) {
  "use strict";

  const REQUIRED_FIELDS = [
    "Fiscal_Year",
    "Period_Number",
    "Posting_Date",
    "Accounting_Document",
    "Accounting_Document_Line",
    "Document_Line_Description",
    "Profit_Center_Name",
    "Cost_Center",
    "Cost_Center_Name",
    "Account_Number",
    "Account_Name",
    "Functional_Area_Name",
    "Amount_In_Usd",
    "Wo_Number",
    "Wo_Description",
    "Wo_Type",
    "Wo_Activity_Type",
    "Functional_Location",
    "Functional_Location_Name",
    "Floc_System_Level4",
    "Floc_Segment_Level3",
    "Vendor_Number",
    "Vendor_Name",
    "Po_Number",
    "Ses_Number",
    "Invoice_Number",
    "Gross_Indicator",
    "Department",
    "ACTIVIDAD",
    "Wbs_Element_Code",
    "Field",
    "Asset",
  ];

  const REQUIRED_HEADERS = [
    "Profit_Center_Name",
    "Amount_In_Usd",
    "Level 3 (Summ FS)",
  ];

  if (!REQUIRED_FIELDS.includes("Level 3 (Summ FS)")) {
    REQUIRED_FIELDS.push("Level 3 (Summ FS)");
  }

  function normalizedHeader(value) {
    return String(value ?? "").replace(/^\uFEFF/, "").trim();
  }

  function worksheetMatrix(sheet) {
    if (Array.isArray(sheet)) return sheet;
    if (Array.isArray(sheet?.["!data"])) return sheet["!data"];
    return null;
  }

  function readCell(sheet, matrix, row, column) {
    const cell = matrix?.[row]?.[column] ?? sheet[XLSX.utils.encode_cell({ r: row, c: column })];
    return cell && Object.prototype.hasOwnProperty.call(cell, "v") ? cell.v : "";
  }

  function locateHeaders(sheet, range, matrix) {
    const lastCandidate = Math.min(range.e.r, range.s.r + 24);
    for (let row = range.s.r; row <= lastCandidate; row += 1) {
      const headers = new Map();
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const header = normalizedHeader(readCell(sheet, matrix, row, column));
        if (header && !headers.has(header)) headers.set(header, column);
      }
      if (REQUIRED_HEADERS.every((header) => headers.has(header))) {
        return { row, headers };
      }
    }
    throw new Error(
      `No se encontró una fila de encabezados válida. Se requieren: ${REQUIRED_HEADERS.join(", ")}.`,
    );
  }

  function extractRows(sheet, profitCenter) {
    if (!sheet?.["!ref"]) throw new Error("La hoja Data no contiene un rango de datos válido.");
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const matrix = worksheetMatrix(sheet);
    const { row: headerRow, headers } = locateHeaders(sheet, range, matrix);
    const availableFields = REQUIRED_FIELDS.filter((field) => headers.has(field));
    const targetProfitCenter = String(profitCenter || "").trim().toUpperCase();
    const output = [];
    let nonemptySourceRows = 0;

    for (let rowIndex = headerRow + 1; rowIndex <= range.e.r; rowIndex += 1) {
      const profitValue = readCell(
        sheet,
        matrix,
        rowIndex,
        headers.get("Profit_Center_Name"),
      );
      if (profitValue === "" || profitValue === null || profitValue === undefined) continue;
      nonemptySourceRows += 1;
      if (
        targetProfitCenter &&
        String(profitValue).trim().toUpperCase() !== targetProfitCenter
      ) {
        continue;
      }

      const row = {};
      for (const field of availableFields) {
        row[field] = readCell(sheet, matrix, rowIndex, headers.get(field));
      }
      output.push(row);
    }

    if (!output.length) {
      throw new Error(
        targetProfitCenter
          ? `La hoja Data no contiene registros para Profit_Center_Name = ${profitCenter}.`
          : "La hoja Data no contiene registros.",
      );
    }

    return {
      rows: output,
      sourceRows: nonemptySourceRows,
      headerRow: headerRow + 1,
      availableFields,
    };
  }

  function parseWorkbook(buffer, options = {}) {
    if (!root.XLSX) throw new Error("No se pudo iniciar el lector XLSX.");
    const workbook = root.XLSX.read(buffer, {
      type: "array",
      dense: true,
      raw: true,
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      cellText: false,
    });
    const dataSheetName = workbook.SheetNames.find(
      (name) => String(name).trim().toLowerCase() === "data",
    );
    if (!dataSheetName) throw new Error("El archivo no contiene una hoja llamada Data.");
    return extractRows(workbook.Sheets[dataSheetName], options.profitCenter || "CARACARA");
  }

  root.ODSParser = { parseWorkbook };
})(
  typeof self !== "undefined"
    ? self
    : typeof window !== "undefined"
      ? window
      : globalThis,
);
