/*
 * Motor de cálculo del cambio de dinero a fichas.
 *
 * - Todo se calcula en CÉNTIMOS ENTEROS: nunca hay errores de redondeo.
 * - No toca la pantalla: la interfaz (app.js) solo pinta lo que devuelve este motor.
 * - Funciona en el navegador (window.Motor) y en Node (require) para las pruebas.
 *
 * Regla para repartir un importe entre varios tipos de ficha (la misma idea que
 * los valores por defecto del Excel):
 *   1. Nunca se entregan fichas por más dinero del que queda.
 *   2. Al menos 1 ficha de cada tipo elegido.
 *   3. No puede sobrar dinero para otra ficha más (devolución < ficha más barata).
 *   4. Número de fichas lo más igualado posible entre los tipos (6 + 6 mejor que 11 + 3).
 *   5. A igualdad, la menor devolución. 6. A igualdad, más fichas.
 * Si la regla 3 no se puede cumplir, se acepta la regla del cartel:
 * devolución ≤ ficha más cara de la combinación.
 */
(function (raiz) {
  "use strict";

  const TIPOS = [0, 1, 2];

  // Mismo orden que las columnas del cartel, más la combinación de los tres tipos.
  const SUBCONJUNTOS = [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]];

  function aCentimos(euros) {
    return Math.round(Number(euros) * 100);
  }

  function totalDe(n, valores) {
    return n.reduce((s, c, t) => s + c * valores[t], 0);
  }

  // Compara claves [desequilibrio, devolución, -fichas]: true si a es mejor que b.
  function mejorClave(a, b) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] < b[i];
    }
    return false;
  }

  /**
   * Mejor reparto de `resto` céntimos usando exactamente los tipos `tipos`.
   * Devuelve { n: [c0, c1, c2], dev } o null si no cabe ni 1 ficha de cada tipo.
   */
  function mejorReparto(resto, tipos, valores) {
    if (!tipos.length) return null;
    const v = tipos.map((t) => valores[t]);
    const k = v.length;
    const minimo = v.reduce((s, x) => s + x, 0);
    if (resto < minimo) return null;
    const vMin = Math.min(...v);
    const vMax = Math.max(...v);

    let estricta = null; // cumple devolución < ficha más barata
    let relajada = null; // cumple devolución ≤ ficha más cara
    const c = new Array(k).fill(0);

    // Los k-1 primeros tipos se recorren; el último se llena al máximo
    // (con devolución < ficha más barata, el último tipo SIEMPRE va al máximo).
    function recorrer(i, queda, minimoRestante) {
      if (i === k - 1) {
        const ultimo = Math.floor(queda / v[i]);
        if (ultimo < 1) return;
        c[i] = ultimo;
        const dev = queda - ultimo * v[i];
        let fichas = 0, mx = 0, mn = Infinity;
        for (let j = 0; j < k; j++) {
          fichas += c[j];
          if (c[j] > mx) mx = c[j];
          if (c[j] < mn) mn = c[j];
        }
        const clave = [mx - mn, dev, -fichas];
        if (dev < vMin) {
          if (!estricta || mejorClave(clave, estricta.clave)) estricta = { c: c.slice(), dev, clave };
        } else if (dev <= vMax) {
          if (!relajada || mejorClave(clave, relajada.clave)) relajada = { c: c.slice(), dev, clave };
        }
        return;
      }
      const resto2 = minimoRestante - v[i];
      const maxAqui = Math.floor((queda - resto2) / v[i]);
      for (let x = 1; x <= maxAqui; x++) {
        c[i] = x;
        recorrer(i + 1, queda - x * v[i], resto2);
      }
    }
    recorrer(0, resto, minimo);

    const elegido = estricta || relajada;
    if (!elegido) return null;
    const n = [0, 0, 0];
    tipos.forEach((t, j) => { n[t] = elegido.c[j]; });
    return { n, dev: elegido.dev };
  }

  /**
   * Prepara los valores por defecto del Excel (datos.js) y los comprueba.
   * Una casilla cuyas cuentas no cuadran se descarta (se calculará en su lugar).
   * Devuelve { mapa: { [importeCentimos]: [6 casillas] }, avisos: [texto] }.
   * Cada casilla es { n:[3], dev } , o { imposible: true }.
   */
  function prepararCartel(datos, valores) {
    const mapa = {};
    const avisos = [];
    for (const fila of (datos && datos.cartel) || []) {
      const importe = aCentimos(fila.importe);
      const casillas = [];
      fila.casillas.forEach((cas, col) => {
        const tipos = SUBCONJUNTOS[col];
        const donde = `${fila.importe} € · columna ${col + 1}`;
        if (cas.estado === "NO ES POSIBLE") {
          casillas[col] = { imposible: true };
          return;
        }
        if (cas.estado !== "OK") {
          avisos.push(`${donde}: estado ${cas.estado}`);
          return;
        }
        const n = TIPOS.map((t) => (tipos.includes(t) ? Math.round(cas.fichas[t]) : 0));
        const total = totalDe(n, valores);
        const dev = importe - total;
        const valido =
          tipos.every((t) => n[t] >= 1) &&
          dev >= 0 &&
          aCentimos(cas.devolucion) === dev;
        if (!valido) {
          avisos.push(`${donde}: las cuentas no cuadran, se calcula automáticamente`);
          return;
        }
        casillas[col] = { n, dev };
      });
      mapa[importe] = casillas;
    }
    return { mapa, avisos };
  }

  /**
   * Opciones a mostrar para el estado actual.
   *   estado = { recibido: céntimos, n: [3], fijo: [3 booleanos] }
   * Devuelve { modo, resto, opciones: [...] }
   *   modo: "sin-dinero" | "libre" | "completar" | "excede"
   *   opción: { tipos, n:[3] (pedido completo), anadido:[3], dev, origen, imposible }
   *     origen: "cartel" (valor del Excel) | "calculo" | "nada"
   */
  function calcularOpciones(estado, valores, cartel) {
    const A = estado.recibido;
    if (!(A > 0)) return { modo: "sin-dinero", resto: 0, opciones: [] };

    const fijos = TIPOS.filter((t) => estado.fijo[t]);
    const libres = TIPOS.filter((t) => !estado.fijo[t]);
    const base = TIPOS.map((t) => (estado.fijo[t] ? estado.n[t] : 0));
    const totalFijo = totalDe(base, valores);

    // 1) Sin nada fijado: las 6 columnas del cartel (valores del Excel si existen) + las tres.
    if (!fijos.length) {
      const delCartel = cartel && cartel[A];
      const opciones = SUBCONJUNTOS.map((tipos, col) => {
        const cas = delCartel && delCartel[col];
        if (cas && cas.imposible) return { tipos, imposible: true, origen: "cartel" };
        if (cas) return { tipos, n: cas.n.slice(), anadido: cas.n.slice(), dev: cas.dev, origen: "cartel" };
        const r = mejorReparto(A, tipos, valores);
        if (!r) return { tipos, imposible: true, origen: "calculo" };
        return { tipos, n: r.n, anadido: r.n.slice(), dev: r.dev, origen: "calculo" };
      });
      return { modo: "libre", resto: A, opciones };
    }

    // 2) Lo fijado ya supera lo recibido: alternativas que respetan los tipos pedidos.
    if (totalFijo > A) {
      const pedidos = fijos.filter((t) => estado.n[t] > 0);
      const excluidos = fijos.filter((t) => estado.n[t] === 0);
      const opciones = [];
      for (const tipos of SUBCONJUNTOS) {
        if (!pedidos.every((t) => tipos.includes(t))) continue;
        if (tipos.some((t) => excluidos.includes(t))) continue;
        const r = mejorReparto(A, tipos, valores);
        if (r) opciones.push({ tipos, n: r.n, anadido: r.n.slice(), dev: r.dev, origen: "calculo" });
      }
      return { modo: "excede", resto: A - totalFijo, opciones };
    }

    // 3) Completar lo fijado con los tipos libres.
    const resto = A - totalFijo;
    const opciones = [];
    if (totalFijo > 0 && resto > 0) {
      opciones.push({ tipos: [], n: base.slice(), anadido: [0, 0, 0], dev: resto, origen: "nada" });
    }
    for (const tipos of SUBCONJUNTOS) {
      if (!tipos.every((t) => libres.includes(t))) continue;
      const r = mejorReparto(resto, tipos, valores);
      if (!r) continue;
      opciones.push({
        tipos,
        n: TIPOS.map((t) => base[t] + r.n[t]),
        anadido: r.n,
        dev: r.dev,
        origen: "calculo",
      });
    }
    return { modo: "completar", resto, opciones };
  }

  /** "48 €" o "2,50 €" */
  function formatear(centimos) {
    const signo = centimos < 0 ? "-" : "";
    const c = Math.abs(centimos);
    if (c % 100 === 0) return `${signo}${c / 100} €`;
    return `${signo}${(c / 100).toFixed(2).replace(".", ",")} €`;
  }

  const Motor = {
    TIPOS,
    SUBCONJUNTOS,
    aCentimos,
    totalDe,
    mejorReparto,
    prepararCartel,
    calcularOpciones,
    formatear,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Motor;
  else raiz.Motor = Motor;
})(typeof window !== "undefined" ? window : globalThis);
