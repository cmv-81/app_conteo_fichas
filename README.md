# Cambio de dinero a fichas

Sistema del puesto de fichas del festival:

- **Excel** (`plantilla_cambio_fichas.xlsx`): la fuente de verdad. Valores de las fichas, bebidas, colores, importes y combinaciones por defecto.
- **Cartel** (`generador_cartel_fichas.py`): genera `cartel_cambio_fichas.png` para imprimir.
- **Web para el móvil** (`public/`): calculadora para los que cobran en el puesto.

```
EXCEL  ──►  python generador_cartel_fichas.py  ──►  cartel_cambio_fichas.png
   │
   └────►  python exportar_web.py  ──►  public/datos.js  ──►  web (Vercel)
```

La web y el cartel leen los mismos datos del Excel, así que siempre coinciden.

## Cambiar algo (precios, combinaciones, colores…)

1. Abre el Excel, cambia lo que quieras y **guarda**. No debe quedar ninguna casilla en *REVISAR*.
2. `python generador_cartel_fichas.py` → genera el cartel nuevo.
3. `python exportar_web.py` → actualiza `public/datos.js`.
   Pruébalo en local con `npm run dev` (ver abajo).
4. Sube los cambios a GitHub (`git add . && git commit -m "Nuevos precios" && git push`).
   Vercel publica solo en un minuto. Los móviles cogen los datos nuevos la próxima vez que abran la web con conexión.

Requisitos de Python: `python -m pip install openpyxl matplotlib numpy`

## Probar en local

Solo necesitas Node.js 18 o superior. No hace falta `npm install`, porque no hay dependencias.

```
npm run dev
```

- En el ordenador: http://localhost:3000
- **En tu móvil**: la terminal muestra una dirección como `http://192.168.1.41:3000`. Ábrela con el móvil conectado a la **misma Wi-Fi**. Si Windows pregunta por el firewall, permite el acceso en redes privadas.
- En local, el modo sin conexión solo funciona en `localhost`, no en la IP de la Wi-Fi (los navegadores exigen HTTPS). Todo lo demás funciona igual.
- Otro puerto: `PORT=3001 npm run dev` (en PowerShell: `$env:PORT=3001; npm run dev`).

## Publicar en Vercel

1. Sube esta carpeta a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com): **Add New → Project** → importa el repositorio → **Deploy**.
   No hay que tocar nada: `vercel.json` ya indica que se publica la carpeta `public/` sin compilar.
3. Tendrás una dirección `https://TU-PROYECTO.vercel.app`.
   Para tu dominio: **Project → Settings → Domains → Add**, y crea en tu proveedor de dominio el registro DNS que Vercel te indique.
4. A partir de ahí, **cada `git push` publica automáticamente**.

Solo se publica `public/`. El Excel, los scripts de Python y el cartel **no** quedan accesibles en la web.

## En el móvil del puesto

- Abre la web y usa **«Añadir a pantalla de inicio»** (Chrome: menú ⋮ · Safari: botón compartir).
  Se abre como una app, a pantalla completa.
- **Funciona sin conexión** una vez abierta, porque en un festival la cobertura falla.
- La pantalla no se apaga mientras se usa (en los móviles que lo permiten).

### Cómo se usa

| Situación | Qué tocar |
|---|---|
| «Te doy 50 €, todo cerveza» | `+50` → toca la opción de cerveza → lee **DEVUELVE** |
| «50 €, quiero de las tres» | `+50` → toca la última opción (las tres fichas) |
| «40 €, pero 7 cubatas sí o sí» | `+20 +20` → toca el número de Cubata, escribe `7` → sale **FALTAN 9 €** y lo que le llega con 40 € |
| «40 €, 3 cubatas y el resto lo que sea» | fija 3 cubatas → aparecen las formas de **completar** los 19 € que quedan |
| «Dame 2 cervezas y 1 cubata» (sin decir dinero) | `+` `+` en cerveza, `+` en cubata → **COBRA 13 €**; cuando pague, marca el billete → **DEVUELVE** |
| «Sin calimocho» | pulsa `−` en calimocho estando a 0 → queda fijado a 0 y no se propone |
| Siguiente cliente | **Siguiente** (guarda la venta en la caja y limpia). **Borrar** limpia sin guardar |

- Todo lo que tocas con `+` / `−` o escribes queda **FIJADO**. Las opciones respetan lo fijado y completan con el resto. Para soltar un tipo, toca *FIJADO ✕*.
- Para los importes del Excel (10, 20, 50, 100 y 200 €) las opciones son **exactamente las del cartel**.
  Para cualquier otro importe se calculan con la misma idea: nunca más fichas que dinero, no sobra dinero para otra ficha, número de fichas lo más igualado posible, menor devolución.
- **Caja**: cuenta las ventas, el dinero cobrado y las fichas entregadas de cada tipo. Se guarda solo en ese móvil. Sirve para cuadrar la caja al cerrar.

## Pruebas

```
npm test
```

Compara el motor de cálculo con una fuerza bruta independiente, comprueba que las opciones por defecto coinciden con el Excel y verifica en 20.000 situaciones aleatorias que todas las cuentas cuadran al céntimo.

## Estructura

```
plantilla_cambio_fichas.xlsx   Excel (fuente de verdad)
generador_cartel_fichas.py     Excel → cartel PNG
exportar_web.py                Excel → public/datos.js
servidor-local.js              Servidor para «npm run dev»
package.json, vercel.json      Configuración de npm y Vercel
public/                        Web (lo único que se publica)
  index.html, estilos.css, app.js
  motor.js                     Cálculo (céntimos enteros, sin decimales)
  datos.js                     Generado desde el Excel. No editar a mano
  sw.js, manifest.webmanifest  Funcionamiento sin conexión / instalable
pruebas/motor.test.js          Pruebas del motor
original/                      Copia de los archivos de partida
```
