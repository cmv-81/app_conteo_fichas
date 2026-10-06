#!/usr/bin/env node
/*
 * Servidor local para probar la web antes de subirla:   npm run dev
 *
 * - Sirve la carpeta public/ (lo mismo que publica Vercel).
 * - Sin dependencias: no hace falta "npm install".
 * - Escucha también en la red Wi-Fi, para abrirla desde el móvil.
 * - Sin caché: cada recarga muestra los últimos cambios.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const RAIZ = path.join(__dirname, "public");
const PUERTO = Number(process.env.PORT) || 3000;
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const servidor = http.createServer((req, res) => {
  let ruta;
  try {
    ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch (e) {
    res.writeHead(400).end("Petición no válida");
    return;
  }
  if (ruta.endsWith("/")) ruta += "index.html";
  const archivo = path.normalize(path.join(RAIZ, ruta));
  if (!archivo.startsWith(RAIZ + path.sep)) {
    res.writeHead(403).end("Prohibido");
    return;
  }
  fs.readFile(archivo, (err, datos) => {
    const hora = new Date().toLocaleTimeString("es-ES");
    if (err) {
      console.log(`${hora}  404  ${ruta}`);
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("No encontrado");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TIPOS[path.extname(archivo).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(datos);
  });
});

servidor.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`El puerto ${PUERTO} está ocupado. Prueba con otro:  PORT=3001 npm run dev`);
  } else {
    console.error(e.message);
  }
  process.exit(1);
});

servidor.listen(PUERTO, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
  console.log("\n  Web de fichas en marcha (Ctrl+C para parar)\n");
  console.log(`  En este ordenador:  http://localhost:${PUERTO}`);
  ips.forEach((ip) => console.log(`  Desde el móvil:     http://${ip}:${PUERTO}   (misma Wi-Fi)`));
  console.log("");
});
