# Pingüé Split — gastos a dos (PWA + Pages + Firestore + Settlements)

App simple para que **dos personas** registren gastos, vean quién debe a quién y guarden **historial en la nube** gratis. Funciona como **PWA** (webAPK), **offline**, y **sincroniza en tiempo real** con Firestore.  
Ahora incluye **settlements** para “quedar a mano” **en cualquier momento** (no solo mensual).

## Novedades
- UI renovada (degradados, glass, sombras suaves).
- Botón **Saldar ahora** que propone el monto exacto para dejar el saldo en cero.
- Registro de **settlements** (A→B o B→A), con nota y fecha.

## Estructura
```
index.html
app.js
styles.css
manifest.json
sw.js
config.template.js  // renombrar a config.js y completar
icons/
  icon-192.png
  icon-512.png
firestore.rules
README.md
```

## Paso a paso rápido
1. Firebase → proyecto Spark → Authentication (Google + Email/Password) + Firestore.
2. Auth → Authorized domains: agregá `tuusuario.github.io`.
3. Firestore → Rules: pegá `firestore.rules` con **tus 2 emails** y publicá.
4. Editá `config.template.js` con tu `firebaseConfig` y emails/nombres → renombrá a `config.js`.
5. Subí al repo y activá **GitHub Pages** (main, root).

> Las keys en `config.js` pueden ser públicas; las **reglas** son las que restringen por email a solo ustedes dos.

## Uso
- Agregá gastos normalmente.
- **Quedar a mano**: en *Quedar a mano (settlement)*
  - Elegí dirección **A→B** o **B→A** y montó (o usá **Saldar ahora**).
  - Guardá. No se suma al total de gastos; solo ajusta el saldo.

## Exportar
- CSV del período actual (incluye gastos y settlements, con tipo).
