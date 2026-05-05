const assert = require("node:assert/strict");
const RimeApp = require("../app.js");

const samples = [
  {
    name: "primary patterns",
    text: [
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
    ].join("\n"),
  },
  {
    name: "fallback patterns",
    text: [
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
    ].join("\n"),
  },
];

const expectedFields = [
  {
    "% inversi\u00f3n": "12,5",
    "Aporte en efectivo": "1.000.000",
    "Aporte en elementos": "250.000",
    "Cliente SAP": "123-45",
    "Duraci\u00f3n de contrato en meses": "12",
    "Fondo promocional": "99.000",
    "Margen de contribuci\u00f3n": "88.000",
    "NIT / C\u00e9dula": "900.123-4",
    "Nombre cliente": "Cliente Demo SAS",
    "Nombre negocio": "Tienda Demo",
    "Reposici\u00f3n en bebidas": "44.000",
    "Ventas cajas f\u00edsicas por mes": "1.234,56",
  },
  {
    "% inversi\u00f3n": "",
    "Aporte en efectivo": "123.000",
    "Aporte en elementos": "456.000",
    "Cliente SAP": "777888",
    "Duraci\u00f3n de contrato en meses": "18",
    "Fondo promocional": "789.000",
    "Margen de contribuci\u00f3n": "321.000",
    "NIT / C\u00e9dula": "800.222-1",
    "Nombre cliente": "Otro Cliente",
    "Nombre negocio": "Barra Norte",
    "Reposici\u00f3n en bebidas": "23",
    "Ventas cajas f\u00edsicas por mes": "300",
  },
];

for (const [index, sample] of samples.entries()) {
  const jsFields = RimeApp.extractFields(sample.text);
  assert.deepStrictEqual(jsFields, expectedFields[index], sample.name);
}

assert.equal(
  RimeApp.normalizeText("Reposici\u00f3n  en   bebidas"),
  "reposicion en bebidas"
);
assert.equal(RimeApp.scoreRimePage(samples[0].text), 4);

const result = RimeApp.extractRimeRowFromTexts(
  ["Documento sin senales", samples[0].text],
  " AIS22 ",
  "22/04/2026",
  "08/01/2027"
);

assert.equal(result.selectedPage, 2);
assert.equal(result.row.ID, "AIS22");
assert.equal(result.row.Responsable, "Andrea Carolina V\u00e9lez");
assert.equal(result.row["A\u00f1o"], "2026");
assert.equal(result.row["Cliente SAP"], "123-45");
assert.equal(result.row["Fecha inicio"], "22/04/2026");
assert.equal(result.row["Fecha fin"], "08/01/2027");

assert.deepStrictEqual(RimeApp.parseDateRange("22-04-2026 - 08-01-2027"), {
  inicio: "22/04/2026",
  fin: "08/01/2027",
});
assert.deepStrictEqual(RimeApp.parseDateRange("22/04/2026 - 08/01/2027"), {
  inicio: "22/04/2026",
  fin: "08/01/2027",
});
assert.throws(() => RimeApp.parseDateRange("2026-04-22 - 2027-01-08"), /Usa formato/);
assert.throws(() => RimeApp.parseDateRange("09-01-2027 - 08-01-2027"), /mayor/);
assert.throws(() => RimeApp.parseDateRange("31-02-2026 - 08-01-2027"), /invalida/);

const textContent = {
  items: [
    { str: "Cliente:", transform: [1, 0, 0, 1, 10, 700] },
    { str: "Cliente Demo", transform: [1, 0, 0, 1, 100, 700] },
    { str: "Nit:", transform: [1, 0, 0, 1, 10, 680] },
    { str: "900.123-4", transform: [1, 0, 0, 1, 100, 680] },
  ],
};

assert.equal(
  RimeApp.textContentToLines(textContent),
  "Cliente: Cliente Demo\nNit: 900.123-4"
);

console.log("All app logic tests passed.");
