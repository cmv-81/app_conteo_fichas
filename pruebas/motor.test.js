// Pruebas del motor de cálculo.  Ejecutar:  node pruebas/motor.test.js
"use strict";
const path = require("path");
const fs = require("fs");
const M = require("../public/motor.js");

let fallos = 0, pruebas = 0;
function ok(cond, msg) {
  pruebas++;
  if (!cond) { fallos++; if (fallos < 30) console.log("FALLO:", msg); }
}

// ---------- Fuerza bruta independiente (todas las combinaciones) ----------
function bruta(resto, tipos, valores) {
  const v = tipos.map((t) => valores[t]);
  const vMin = Math.min(...v);
  let mejor = null;
  const c = [];
  (function rec(i, queda) {
    if (i === v.length) {
      const dev = queda;
      if (dev >= vMin) return;
      const clave = [Math.max(...c) - Math.min(...c), dev, -c.reduce((a, b) => a + b, 0)];
      const j = mejor ? clave.findIndex((x, k) => x !== mejor.clave[k]) : -1;
      if (!mejor || (j >= 0 && clave[j] < mejor.clave[j])) {
        mejor = { c: c.slice(), clave, dev };
      }
      return;
    }
    for (let x = 1; x * v[i] <= queda; x++) { c[i] = x; rec(i + 1, queda - x * v[i]); }
  })(0, resto);
  return mejor;
}

// ---------- 1. mejorReparto = fuerza bruta ----------
const juegos = [[300, 500, 700], [200, 400, 900], [150, 250, 400], [100, 300, 1000]];
let relajados = 0;
for (const valores of juegos) {
  for (let euros = 1; euros <= 220; euros++) {
    const R = euros * 100 + (valores[0] % 100 ? 50 : 0);
    for (const tipos of M.SUBCONJUNTOS) {
      const r = M.mejorReparto(R, tipos, valores);
      const b = bruta(R, tipos, valores);
      if (b) {
        ok(r && r.dev === b.dev && tipos.every((t, j) => r.n[t] === b.c[j]),
          `valores ${valores} R=${R} tipos ${tipos}: motor ${JSON.stringify(r)} bruta ${JSON.stringify(b)}`);
      } else if (r) {
        relajados++;
        const vMax = Math.max(...tipos.map((t) => valores[t]));
        ok(r.dev >= 0 && r.dev <= vMax && tipos.every((t) => r.n[t] >= 1), `relajado incorrecto ${R} ${tipos}`);
      } else {
        const minimo = tipos.reduce((s, t) => s + valores[t], 0);
        ok(R < minimo, `sin solución pero cabe 1 de cada: ${R} ${tipos}`);
      }
      if (r) {
        ok(M.totalDe(r.n, valores) + r.dev === R, `no cuadra ${R} ${tipos}`);
        ok([0, 1, 2].every((t) => (tipos.includes(t) ? r.n[t] >= 1 : r.n[t] === 0)), `tipos incorrectos ${R} ${tipos}`);
      }
    }
  }
}

// ---------- 2. Valores del Excel (datos.js) ----------
global.window = {};
eval(fs.readFileSync(path.join(__dirname, "../public/datos.js"), "utf8"));
const D = window.FICHAS_DATOS;
const valores = D.fichas.map((f) => M.aCentimos(f.valor));
const { mapa, avisos } = M.prepararCartel(D, valores);
ok(avisos.length === 0, "avisos en el cartel: " + avisos.join(" | "));
for (const fila of D.cartel) {
  const A = M.aCentimos(fila.importe);
  const res = M.calcularOpciones({ recibido: A, n: [0, 0, 0], fijo: [false, false, false] }, valores, mapa);
  fila.casillas.forEach((cas, col) => {
    const op = res.opciones[col];
    if (cas.estado === "NO ES POSIBLE") ok(op.imposible, `${fila.importe}€ col ${col + 1} debería ser imposible`);
    else ok(op.origen === "cartel" && op.n.join() === cas.fichas.join() && op.dev === M.aCentimos(cas.devolucion),
      `${fila.importe}€ col ${col + 1}: web ${op.n} / Excel ${cas.fichas}`);
  });
}

// ---------- 3. Ejemplos concretos ----------
const est = (A, n, fijo) => ({ recibido: A * 100, n, fijo });
let r = M.calcularOpciones(est(40, [0, 0, 7], [false, false, true]), valores, mapa);
ok(r.modo === "excede" && r.resto === -900, "40€ con 7 cubatas: faltan 9€");
ok(r.opciones.length > 0 && r.opciones.every((o) => o.n[2] >= 1 && o.dev >= 0), "alternativas con cubata");

r = M.calcularOpciones(est(40, [0, 0, 3], [false, false, true]), valores, mapa);
ok(r.modo === "completar" && r.resto === 1900, "40€ con 3 cubatas: quedan 19€");
ok(r.opciones[0].origen === "nada" && r.opciones[0].dev === 1900, "opción 'nada más' devuelve 19€");
const cc = r.opciones.find((o) => o.tipos.join() === "0,1");
ok(cc && cc.anadido.join() === "3,2,0" && cc.dev === 0, "completar con 3 cervezas + 2 calimochos exacto: " + JSON.stringify(cc));

r = M.calcularOpciones(est(40, [0, 0, 0], [false, false, true]), valores, mapa);
ok(r.opciones.every((o) => o.n[2] === 0), "cubata fijada a 0 queda excluida");

r = M.calcularOpciones(est(50, [0, 0, 0], [false, false, false]), valores, mapa);
const tres = r.opciones[6];
ok(tres.n.join() === "3,4,3" && tres.dev === 0, "50€ las tres: 3+4+3 exacto → " + JSON.stringify(tres));

ok(M.formatear(4800) === "48 €" && M.formatear(250) === "2,50 €" && M.formatear(-900) === "-9 €", "formato de euros");

// ---------- 4. Invariantes con estados aleatorios ----------
let semilla = 12345;
const azar = (n) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
for (let i = 0; i < 20000; i++) {
  const A = azar(4) === 0 ? 0 : (1 + azar(250)) * 100;
  const fijo = [azar(3) === 0, azar(3) === 0, azar(3) === 0];
  const n = fijo.map((f) => (f ? azar(12) : 0));
  const res = M.calcularOpciones({ recibido: A, n, fijo }, valores, mapa);
  for (const o of res.opciones) {
    if (o.imposible) continue;
    const total = M.totalDe(o.n, valores);
    ok(Number.isInteger(total) && o.dev === A - total && o.dev >= 0, `cuenta ${A} ${n} ${fijo} → ${JSON.stringify(o)}`);
    ok(o.n.every((x) => Number.isInteger(x) && x >= 0), "cantidades enteras");
    if (res.modo === "completar") ok([0, 1, 2].every((t) => !fijo[t] || o.n[t] === n[t]), "respeta lo fijado");
    if (res.modo === "excede") {
      ok([0, 1, 2].every((t) => !fijo[t] || (n[t] > 0 ? o.n[t] >= 1 : o.n[t] === 0)), "excede respeta tipos pedidos/excluidos");
    }
  }
}

console.log(`${pruebas} comprobaciones · ${fallos} fallos · ${relajados} casos con regla relajada`);
process.exit(fallos ? 1 : 0);
