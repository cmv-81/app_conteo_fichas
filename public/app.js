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
  const PRECIO_VASO = M.aCentimos(D.vaso ? D.vaso.precio : 1);
  const MAX_VASOS = 99;

  COLORES.forEach((c, t) => document.documentElement.style.setProperty(`--c${t}`, c));

  // ---------- Estado ----------
  const estado = { recibido: 0, n: [0, 0, 0], fijo: [false, false, false], vasos: 0 };
  let opcionesActuales = [];

  const fmt = M.formatear;
  const etiquetaValor = (t) => fmt(VALORES[t]).replace(" ", "");
  const totalFichas = () => M.totalDe(estado.n, VALORES);
  const totalPedido = () => totalFichas() + M.totalVasos(estado, PRECIO_VASO); // fichas + vasos
  const numFichas = (n) => n.reduce((a, b) => a + b, 0);
  const vasosTexto = (v) => `${v} vaso${v === 1 ? "" : "s"}`;

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

  // Fila del vaso: se suma al total. No es una ficha, así que nunca se "fija".
  const filaVaso = document.createElement("div");
  filaVaso.className = "fila-ficha fila-vaso";
  filaVaso.innerHTML = `
    <svg class="vaso-icono" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M7 6h26l-3.4 28.6A3 3 0 0 1 26.6 37H13.4a3 3 0 0 1-3-2.4z" fill="#EAF1F3" stroke="#121212" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M8.3 12.5h23.4" stroke="#121212" stroke-width="2"/>
      <text x="20" y="27.5" text-anchor="middle" font-size="11" font-weight="900" fill="#07161A">${fmt(PRECIO_VASO).replace(" ", "")}</text>
    </svg>
    <span class="fila-nombre"><b>Vaso</b><span class="fila-precio">${fmt(PRECIO_VASO)} cada uno</span></span>
    <button type="button" class="paso" aria-label="Un vaso menos">−</button>
    <button type="button" class="cantidad" aria-label="Escribir número de vasos">0</button>
    <button type="button" class="paso" aria-label="Un vaso más">+</button>`;
  {
    const [menos, mas] = filaVaso.querySelectorAll(".paso");
    botonRepetible(menos, () => cambiarVasos(-1));
    botonRepetible(mas, () => cambiarVasos(+1));
    filaVaso.querySelector(".cantidad").addEventListener("click", () => abrirTeclado("vaso"));
  }
  contFilas.appendChild(filaVaso);

  function cambiarVasos(delta) {
    const nuevo = Math.min(MAX_VASOS, Math.max(0, estado.vasos + delta));
    if (nuevo === estado.vasos) return;
    estado.vasos = nuevo;
    vibrar();
    pintar();
  }

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
    filaVaso.querySelector(".cantidad").textContent = estado.vasos;
    filaVaso.classList.toggle("vacia", estado.vasos === 0);

    pintarOpciones();
    pintarResultado();
  }

  function devolucionHTML(dev) {
    return dev === 0
      ? '<span class="opcion-dev exacto">Exacto ✓</span>'
      : `<span class="opcion-dev">Devuelve ${fmt(dev)}</span>`;
  }

  function pintarOpciones() {
    const res = M.calcularOpciones(estado, VALORES, CARTEL.mapa, PRECIO_VASO);
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

    if (res.modo === "solo-vasos") {
      titulo.textContent = "Opciones";
      pista.textContent = res.paraFichas < 0
        ? "Con ese dinero no llega ni para los vasos."
        : "Ese dinero es justo lo de los vasos: no queda para fichas.";
      lista.innerHTML = "";
      return;
    }

    // Con vasos, las fichas se calculan con lo que queda después de pagarlos.
    const A = fmt(res.paraFichas);
    const notaVasos = estado.vasos
      ? `Recibido ${fmt(estado.recibido)} − ${vasosTexto(estado.vasos)} (${fmt(M.totalVasos(estado, PRECIO_VASO))}) = ${A} para fichas.`
      : "";
    if (res.modo === "libre") {
      const delCartel = res.opciones.some((o) => o.origen === "cartel");
      titulo.textContent = `Combinaciones para ${A}${delCartel ? " · como el cartel" : ""}`;
      pista.textContent = notaVasos || "Toca una opción. Para fijar fichas, usa + / − arriba.";
    } else if (res.modo === "completar") {
      titulo.textContent = `Quedan ${fmt(res.resto)} para completar`;
      pista.textContent = res.opciones.length ? notaVasos : "No queda dinero para más fichas.";
    } else {
      titulo.textContent = `Con ${A} le llega para`;
      pista.textContent = res.opciones.length ? notaVasos : "Con ese dinero no llega para lo fijado.";
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
    const partes = [];
    if (fichas > 0 || estado.vasos === 0) partes.push(`${fichas} ficha${fichas === 1 ? "" : "s"}`);
    if (estado.vasos > 0) partes.push(vasosTexto(estado.vasos));
    const resumen = `${partes.join(" + ")} · ${fmt(total)}`;
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
      : destino === "vaso"
        ? `Vasos (${fmt(PRECIO_VASO)} cada uno)`
        : `Fichas de ${NOMBRES[destino]} (${etiquetaValor(destino)})`;
    pintarTeclado();
    hojaTeclado.hidden = false;
    $("#teclado-ok").focus({ preventScroll: true });
  }
  function valorActualTeclado() {
    if (teclado.destino === "importe") return estado.recibido / 100;
    if (teclado.destino === "vaso") return estado.vasos;
    return estado.n[teclado.destino];
  }
  function pintarTeclado() {
    const pantalla = $("#teclado-pantalla");
    const vacio = teclado.texto === "";
    pantalla.classList.toggle("placeholder", vacio);
    const valor = vacio ? valorActualTeclado() : Number(teclado.texto);
    pantalla.textContent = teclado.destino === "importe" ? `${valor} €` : String(valor);
  }
  function pulsarTecla(k) {
    const max = teclado.destino === "importe" ? MAX_IMPORTE : teclado.destino === "vaso" ? MAX_VASOS : MAX_FICHAS;
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
      else if (teclado.destino === "vaso") estado.vasos = v;
      else {
        estado.n[teclado.destino] = v;
        estado.fijo[teclado.destino] = true;
      }
    } else if (typeof teclado.destino === "number") {
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

  // ---------- Siguiente cliente: se borra todo y listo ----------
  // No se guarda ningún registro de ventas en el móvil.
  try { localStorage.removeItem("fichas.caja.v1"); } catch (e) { /* versiones antiguas guardaban la caja */ }

  $("#btn-siguiente").addEventListener("click", () => {
    estado.recibido = 0;
    estado.n = [0, 0, 0];
    estado.fijo = [false, false, false];
    estado.vasos = 0;
    vibrar(15);
    pintar();
    window.scrollTo(0, 0);
  });

  // ---------- Funcionar sin conexión ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* sin modo offline */ });
    });
  }

  pintar();
})();
