/*
 * Interfaz de la calculadora de fichas.
 * Toda la aritmética está en motor.js (céntimos enteros); aquí solo se pinta.
 */
(function () {
  "use strict";

  const M = window.Motor;
  const D = window.FICHAS_DATOS;
  const $ = (sel) => document.querySelector(sel);

  if (!D || !D.fichas || D.fichas.length !== 3) {
    document.body.innerHTML = '<p style="padding:24px;font:18px system-ui">Faltan los datos (datos.js). ' +
      "Ejecuta <b>python exportar_web.py</b> y vuelve a subir la carpeta public.</p>";
    return;
  }

  // ---------- Datos del Excel ----------
  const VALORES = D.fichas.map((f) => M.aCentimos(f.valor));
  const NOMBRES = D.fichas.map((f) => String(f.nombre));
  const COLORES = D.fichas.map((f) => String(f.color));
  const CARTEL = M.prepararCartel(D, VALORES);
  const BILLETES = [5, 10, 20, 50, 100];
  const MAX_IMPORTE = 2000; // €
  const MAX_FICHAS = 999;

  COLORES.forEach((c, t) => document.documentElement.style.setProperty(`--c${t}`, c));

  // ---------- Estado ----------
  const estado = { recibido: 0, n: [0, 0, 0], fijo: [false, false, false] };
  let opcionesActuales = [];

  const fmt = M.formatear;
  const etiquetaValor = (t) => fmt(VALORES[t]).replace(" ", "");
  const totalPedido = () => M.totalDe(estado.n, VALORES);
  const numFichas = (n) => n.reduce((a, b) => a + b, 0);

  function fichaHTML(t, mini) {
    return `<span class="ficha${mini ? " mini" : ""}" style="--c:${COLORES[t]}">${etiquetaValor(t)}</span>`;
  }

  // ---------- Pequeñas ayudas ----------
  function vibrar(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) { /* sin vibración */ }
  }
  let temporizadorAviso;
  function aviso(texto) {
    const el = $("#aviso");
    el.textContent = texto;
    el.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { el.hidden = true; }, 1800);
  }

  // Mantener la pantalla encendida mientras se usa (si el móvil lo permite).
  let bloqueoPantalla = null;
  async function pantallaEncendida() {
    try {
      if ("wakeLock" in navigator && !bloqueoPantalla && document.visibilityState === "visible") {
        bloqueoPantalla = await navigator.wakeLock.request("screen");
        bloqueoPantalla.addEventListener("release", () => { bloqueoPantalla = null; });
      }
    } catch (e) { /* no disponible */ }
  }
  document.addEventListener("visibilitychange", pantallaEncendida);
  document.addEventListener("pointerdown", pantallaEncendida, { once: true });

  // Botón con repetición al mantener pulsado (+ / −). Un toque = 1 paso.
  function botonRepetible(btn, accion) {
    let espera, repeticion, repetido = false;
    const parar = () => { clearTimeout(espera); clearInterval(repeticion); };
    btn.addEventListener("pointerdown", () => {
      repetido = false;
      parar();
      espera = setTimeout(() => {
        repetido = true;
        accion();
        repeticion = setInterval(accion, 110);
      }, 450);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => btn.addEventListener(ev, parar));
    btn.addEventListener("click", () => {
      if (repetido) { repetido = false; return; }
      accion();
    });
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // ---------- Construcción de la pantalla ----------
  const contBilletes = $("#billetes");
  BILLETES.forEach((b) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "billete";
    btn.textContent = `+${b}`;
    btn.setAttribute("aria-label", `Sumar ${b} euros`);
    btn.addEventListener("click", () => {
      const nuevo = estado.recibido + b * 100;
      if (nuevo > MAX_IMPORTE * 100) return aviso(`Máximo ${MAX_IMPORTE} €`);
      estado.recibido = nuevo;
      vibrar();
      pintar();
    });
    contBilletes.appendChild(btn);
  });

  const filas = [];
  const contFilas = $("#filas-fichas");
  M.TIPOS.forEach((t) => {
    const fila = document.createElement("div");
    fila.className = "fila-ficha";
    fila.innerHTML = `
      <span class="ficha" style="--c:${COLORES[t]}">${etiquetaValor(t)}</span>
      <span class="fila-nombre">
        <b>${NOMBRES[t]}</b>
        <button type="button" class="fila-fijo" hidden aria-label="Quitar fijado de ${NOMBRES[t]}">FIJADO ✕</button>
      </span>
      <button type="button" class="paso" aria-label="Una ficha menos de ${NOMBRES[t]}">−</button>
      <button type="button" class="cantidad" aria-label="Escribir fichas de ${NOMBRES[t]}">0</button>
      <button type="button" class="paso" aria-label="Una ficha más de ${NOMBRES[t]}">+</button>`;
    const [menos, mas] = fila.querySelectorAll(".paso");
    botonRepetible(menos, () => cambiarCantidad(t, -1));
    botonRepetible(mas, () => cambiarCantidad(t, +1));
    fila.querySelector(".cantidad").addEventListener("click", () => abrirTeclado(t));
    fila.querySelector(".fila-fijo").addEventListener("click", () => {
      estado.fijo[t] = false;
      vibrar();
      pintar();
    });
    contFilas.appendChild(fila);
    filas.push(fila);
  });

  function cambiarCantidad(t, delta) {
    const nuevo = Math.min(MAX_FICHAS, Math.max(0, estado.n[t] + delta));
    if (nuevo === estado.n[t] && estado.fijo[t]) return;
    estado.n[t] = nuevo;
    estado.fijo[t] = true; // lo que toca el usuario queda FIJADO
    vibrar();
    pintar();
  }

  // ---------- Pintado ----------
  function pintar() {
    // Dinero recibido
    $("#importe-valor").textContent = fmt(estado.recibido);
    $("#importe").classList.toggle("con-valor", estado.recibido > 0);

    // Filas de fichas
    filas.forEach((fila, t) => {
      fila.querySelector(".cantidad").textContent = estado.n[t];
      fila.querySelector(".fila-fijo").hidden = !estado.fijo[t];
      fila.classList.toggle("fijada", estado.fijo[t]);
      fila.classList.toggle("vacia", estado.n[t] === 0);
    });

    pintarOpciones();
    pintarResultado();
  }

  function devolucionHTML(dev) {
    return dev === 0
      ? '<span class="opcion-dev exacto">Exacto ✓</span>'
      : `<span class="opcion-dev">Devuelve ${fmt(dev)}</span>`;
  }

  function pintarOpciones() {
    const res = M.calcularOpciones(estado, VALORES, CARTEL.mapa);
    opcionesActuales = res.opciones;
    const titulo = $("#t-opciones");
    const pista = $("#pista-opciones");
    const lista = $("#lista-opciones");

    if (res.modo === "sin-dinero") {
      titulo.textContent = "Opciones";
      pista.textContent = totalPedido() > 0
        ? "Marca el dinero recibido para ver la devolución."
        : "Marca el dinero recibido para ver todas las combinaciones.";
      lista.innerHTML = "";
      return;
    }

    const A = fmt(estado.recibido);
    if (res.modo === "libre") {
      const delCartel = res.opciones.some((o) => o.origen === "cartel");
      titulo.textContent = `Combinaciones para ${A}${delCartel ? " · como el cartel" : ""}`;
      pista.textContent = "Toca una opción. Para fijar fichas, usa + / − arriba.";
    } else if (res.modo === "completar") {
      titulo.textContent = `Quedan ${fmt(res.resto)} para completar`;
      pista.textContent = res.opciones.length ? "" : "No queda dinero para más fichas.";
    } else {
      titulo.textContent = `Con ${A} le llega para`;
      pista.textContent = res.opciones.length ? "" : "Con ese dinero no llega para lo fijado.";
    }

    const grupos = (op) => op.tipos
      .map((t) => `<span class="grupo"><b>${op.anadido[t]}</b>${fichaHTML(t, true)}</span>`)
      .join('<span class="signo">+</span>');
    lista.innerHTML = res.opciones.map((op, i) => {
      if (op.imposible) {
        const fichas = op.tipos.map((t) => fichaHTML(t, true)).join('<span class="signo">+</span>');
        return `<div class="opcion imposible">${fichas}<span class="opcion-texto">No es posible</span></div>`;
      }
      const activa = op.n.every((x, t) => x === estado.n[t]);
      const cuerpo = op.origen === "nada"
        ? '<span class="opcion-texto">Nada más</span>'
        : (res.modo === "completar" ? '<span class="signo">+</span>' : "") + grupos(op);
      return `<button type="button" class="opcion${activa ? " activa" : ""}" data-i="${i}"
        aria-label="${textoOpcion(op, res.modo)}">${cuerpo}${devolucionHTML(op.dev)}</button>`;
    }).join("");
  }

  // Texto para lectores de pantalla: "16 Cerveza, devuelve 2 €"
  function textoOpcion(op, modo) {
    if (op.origen === "nada") return `Nada más, devuelve ${fmt(op.dev)}`;
    const partes = op.tipos.map((t) => `${op.anadido[t]} ${NOMBRES[t]}`).join(" y ");
    return `${modo === "completar" ? "Añadir " : ""}${partes}, ${op.dev ? "devuelve " + fmt(op.dev) : "exacto"}`;
  }

  $("#lista-opciones").addEventListener("click", (e) => {
    const btn = e.target.closest(".opcion[data-i]");
    if (!btn) return;
    const op = opcionesActuales[Number(btn.dataset.i)];
    if (!op || op.imposible) return;
    estado.n = op.n.slice();
    vibrar(12);
    pintar();
  });

  function pintarResultado() {
    const el = $("#resultado");
    const principal = $("#resultado-principal");
    const detalle = $("#resultado-detalle");
    const total = totalPedido();
    const fichas = numFichas(estado.n);
    const resumen = `${fichas} ficha${fichas === 1 ? "" : "s"} · ${fmt(total)}`;
    const A = estado.recibido;

    let tipo, texto, sub;
    if (A === 0 && total === 0) {
      tipo = "vacio"; texto = "Marca el dinero"; sub = "o las fichas que pide";
    } else if (A === 0) {
      tipo = "cobrar"; texto = `COBRA ${fmt(total)}`; sub = resumen;
    } else if (total === 0) {
      tipo = "vacio"; texto = "Elige las fichas"; sub = `Recibido ${fmt(A)}`;
    } else if (total > A) {
      tipo = "faltan"; texto = `FALTAN ${fmt(total - A)}`; sub = `${resumen} · recibido ${fmt(A)}`;
    } else {
      tipo = "devuelve"; texto = `DEVUELVE ${fmt(A - total)}`;
      sub = A === total ? `${resumen} · cuenta exacta` : resumen;
    }
    el.dataset.tipo = tipo;
    principal.textContent = texto;
    detalle.textContent = sub;
    ajustarTexto(principal);
  }

  // Reduce la letra lo justo para que la cifra quepa SIEMPRE en una línea.
  function ajustarTexto(el) {
    el.style.fontSize = "";
    let tam = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth && tam > 16) {
      tam -= 1;
      el.style.fontSize = tam + "px";
    }
  }
  window.addEventListener("resize", () => ajustarTexto($("#resultado-principal")));

  // ---------- Teclado numérico ----------
  const teclado = { destino: null, texto: "" };
  const hojaTeclado = $("#hoja-teclado");

  function abrirTeclado(destino) {
    teclado.destino = destino;
    teclado.texto = "";
    $("#teclado-titulo").textContent = destino === "importe"
      ? "Dinero recibido (€)"
      : `Fichas de ${NOMBRES[destino]} (${etiquetaValor(destino)})`;
    pintarTeclado();
    hojaTeclado.hidden = false;
    $("#teclado-ok").focus({ preventScroll: true });
  }
  function valorActualTeclado() {
    return teclado.destino === "importe" ? estado.recibido / 100 : estado.n[teclado.destino];
  }
  function pintarTeclado() {
    const pantalla = $("#teclado-pantalla");
    const vacio = teclado.texto === "";
    pantalla.classList.toggle("placeholder", vacio);
    const valor = vacio ? valorActualTeclado() : Number(teclado.texto);
    pantalla.textContent = teclado.destino === "importe" ? `${valor} €` : String(valor);
  }
  function pulsarTecla(k) {
    const max = teclado.destino === "importe" ? MAX_IMPORTE : MAX_FICHAS;
    if (k === "C") teclado.texto = "";
    else if (k === "B") teclado.texto = teclado.texto.slice(0, -1);
    else {
      const nuevo = (teclado.texto + k).replace(/^0+(?=\d)/, "");
      if (Number(nuevo) > max) { vibrar(60); return aviso(`Máximo ${max}`); }
      teclado.texto = nuevo;
    }
    vibrar(6);
    pintarTeclado();
  }
  function aceptarTeclado() {
    if (teclado.texto !== "") {
      const v = Number(teclado.texto);
      if (teclado.destino === "importe") estado.recibido = v * 100;
      else {
        estado.n[teclado.destino] = v;
        estado.fijo[teclado.destino] = true;
      }
    } else if (teclado.destino !== "importe") {
      estado.fijo[teclado.destino] = true; // aceptar sin escribir = fijar la cantidad actual
    }
    cerrarHojas();
    pintar();
  }
  hojaTeclado.querySelectorAll("[data-tecla]").forEach((b) =>
    b.addEventListener("click", () => pulsarTecla(b.dataset.tecla)));
  $("#teclado-ok").addEventListener("click", aceptarTeclado);

  function cerrarHojas() {
    document.querySelectorAll(".hoja").forEach((h) => { h.hidden = true; });
  }
  document.querySelectorAll("[data-cerrar]").forEach((el) => el.addEventListener("click", cerrarHojas));

  // Teclado físico (útil en tablet u ordenador).
  document.addEventListener("keydown", (e) => {
    if (!hojaTeclado.hidden) {
      if (/^\d$/.test(e.key)) pulsarTecla(e.key);
      else if (e.key === "Backspace") pulsarTecla("B");
      else if (e.key === "Enter") { e.preventDefault(); aceptarTeclado(); }
      else if (e.key === "Escape") cerrarHojas();
      return;
    }
    if (e.key === "Escape") cerrarHojas();
  });

  $("#importe").addEventListener("click", () => abrirTeclado("importe"));
  $("#btn-limpiar-importe").addEventListener("click", () => {
    estado.recibido = 0;
    vibrar();
    pintar();
  });

  // ---------- Caja (solo en este móvil) ----------
  const CLAVE_CAJA = "fichas.caja.v1";
  function leerCaja() {
    try {
      const c = JSON.parse(localStorage.getItem(CLAVE_CAJA));
      return c && Array.isArray(c.ventas) ? c : { ventas: [] };
    } catch (e) { return { ventas: [] }; }
  }
  function guardarCaja(caja) {
    try { localStorage.setItem(CLAVE_CAJA, JSON.stringify(caja)); return true; } catch (e) { return false; }
  }
  function hora(ms) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  function pintarCaja() {
    const { ventas } = leerCaja();
    const dinero = ventas.reduce((s, v) => s + v.total, 0);
    const porTipo = M.TIPOS.map((t) => ventas.reduce((s, v) => s + (v.n[t] || 0), 0));
    $("#caja-resumen").innerHTML = `
      <div class="caja-dato"><span class="lbl">Ventas</span><div class="caja-num"><b>${ventas.length}</b></div></div>
      <div class="caja-dato"><span class="lbl">Cobrado</span><div class="caja-num"><b>${fmt(dinero)}</b></div></div>
      ${M.TIPOS.map((t) => `<div class="caja-dato"><span class="lbl">Fichas ${NOMBRES[t]}</span>
        <div class="caja-num">${fichaHTML(t, true)}<b>${porTipo[t]}</b></div></div>`).join("")}`;
    $("#caja-lista").innerHTML = ventas.slice(-15).reverse().map((v) => {
      const partes = M.TIPOS.filter((t) => v.n[t] > 0).map((t) => `${v.n[t]}×${etiquetaValor(t)}`).join(" + ");
      return `<li><span>${hora(v.t)}</span><span>${partes}</span><b>${fmt(v.total)}</b></li>`;
    }).join("");
    $("#btn-deshacer").disabled = ventas.length === 0;
    const avisos = CARTEL.avisos.length ? `<br>⚠ ${CARTEL.avisos.join("<br>⚠ ")}` : "";
    $("#caja-info").innerHTML =
      `La caja se guarda solo en este móvil. Fichas: ${M.TIPOS.map((t) => `${NOMBRES[t]} ${etiquetaValor(t)}`).join(" · ")}.` +
      `<br>Datos del Excel del ${D.generado || "—"}.${avisos}`;
  }
  $("#btn-caja").addEventListener("click", () => {
    pintarCaja();
    $("#hoja-caja").hidden = false;
  });
  $("#btn-deshacer").addEventListener("click", () => {
    const caja = leerCaja();
    const ultima = caja.ventas.pop();
    if (!ultima) return;
    if (!confirm(`¿Deshacer la última venta de ${fmt(ultima.total)} (${hora(ultima.t)})?`)) return;
    guardarCaja(caja);
    pintarCaja();
  });
  $("#btn-caja-cero").addEventListener("click", () => {
    if (!confirm("¿Poner la caja a cero? Se borrarán todas las ventas guardadas en este móvil.")) return;
    guardarCaja({ ventas: [] });
    pintarCaja();
  });

  // ---------- Siguiente cliente / borrar ----------
  function reiniciar() {
    estado.recibido = 0;
    estado.n = [0, 0, 0];
    estado.fijo = [false, false, false];
    pintar();
    window.scrollTo(0, 0);
  }
  $("#btn-siguiente").addEventListener("click", () => {
    const total = totalPedido();
    if (total > 0) {
      const recibido = estado.recibido || total;
      if (recibido < total) {
        vibrar(80);
        return aviso(`Faltan ${fmt(total - recibido)}`);
      }
      const caja = leerCaja();
      caja.ventas.push({ t: Date.now(), recibido, total, n: estado.n.slice() });
      if (caja.ventas.length > 5000) caja.ventas.shift();
      aviso(guardarCaja(caja) ? `✓ Venta de ${fmt(total)} guardada` : "✓ Listo (no se pudo guardar la caja)");
    }
    vibrar(15);
    reiniciar();
  });
  $("#btn-borrar").addEventListener("click", () => {
    vibrar();
    reiniciar();
  });

  // ---------- Funcionar sin conexión ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* sin modo offline */ });
    });
  }

  pintar();
})();
