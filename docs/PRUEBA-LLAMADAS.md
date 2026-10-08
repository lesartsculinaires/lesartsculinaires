# Plan de prueba — contestar llamadas más rápido

**Esta rama no está en producción.** Se despliega como vista previa, se hacen dos o
tres llamadas de verdad, y recién ahí pasa a `main`.

---

## Qué cambia

Hasta ahora, apretar **Atender** empezaba cuatro cosas: pedir el micrófono,
pegar la oferta del cliente, armar la respuesta y juntar los caminos de red.
Ninguna de esas cuatro le dice nada a Meta —la llamada se acepta recién al
final— y los datos para hacerlas ya están **desde el primer timbrazo**.

Ahora se hacen **mientras el teléfono suena**. Al apretar Atender queda una sola
cosa por delante: avisarle a Meta.

### El micrófono NO se adelanta

A propósito. Pedirlo mientras suena prendería la lucecita de grabación del
navegador antes de que nadie haya aceptado nada. **No va a pasar eso.** El
micrófono se sigue pidiendo al apretar Atender, como siempre.

### Si la preparación falla, no pasa nada

Es la regla de la que cuelga todo: **contestar nunca depende de que la
preparación haya salido bien.** Si falló, el clic hace el camino completo de
siempre. Lo peor que puede pasar es tardar lo que se tardaba antes.

---

## Antes de empezar

1. Abrir el CRM en **Chrome o Edge** (no Safari).
2. Entrar con una cuenta que atienda llamadas.
3. Tener a mano un teléfono con WhatsApp **que no sea el de la escuela**.

### El botón de apagado, por si algo sale mal

Si una llamada sale mal, **no hay que esperar a nadie**. En el navegador:
`F12` → pestaña **Console** → pegar y Enter:

```js
localStorage.setItem("lac.llamadas.sinPreparar", "1")
```

Recargar. Desde ese momento el CRM vuelve al comportamiento de siempre, en esa
computadora. Para volver a prenderlo:

```js
localStorage.removeItem("lac.llamadas.sinPreparar")
```

---

## Las tres llamadas

### Llamada 1 — la normal

1. Desde el teléfono, llamar por WhatsApp al número de la escuela.
2. Cuando aparezca la tarjeta en el CRM, **apretar Atender enseguida**.
3. Hablar unos quince segundos, **de los dos lados**.
4. Colgar desde el teléfono.

**Qué mirar:**

- [ ] ¿Se oye al cliente en la computadora?
- [ ] ¿Se oye a la asesora en el teléfono?
- [ ] ¿Cuánto tarda desde que se aprieta Atender hasta que se oye? (antes:
      alrededor de un segundo)
- [ ] ¿Quedó bien en el CRM al terminar, con su duración?

### Llamada 2 — esperando un poco

Igual que la 1, pero **dejar sonar unos ocho segundos antes de atender**.

Esto es lo que de verdad se viene a probar: con ocho segundos la preparación
terminó hace rato, así que atender tiene que ser casi instantáneo.

- [ ] ¿Se nota más rápido que la llamada 1?
- [ ] ¿Se oye bien de los dos lados?

### Llamada 3 — desde fuera de la oficina

**La más importante de las tres.** Que alguien llame desde **datos móviles, no
desde el wifi de la escuela**.

Es la que prueba lo único que podría romperse de verdad: que los caminos de red
que se juntaron antes sirvan para alguien que está fuera de la red.

- [ ] ¿Se oye de los dos lados?
- [ ] Si se conecta pero **no se oye nada**: apagar con el botón de arriba y
      avisar. Ése es exactamente el fallo que hay que buscar.

---

## Qué anotar

Para cada llamada, lo mínimo:

| | Llamada 1 | Llamada 2 | Llamada 3 |
|---|---|---|---|
| ¿Se oyó al cliente? | | | |
| ¿Se oyó a la asesora? | | | |
| ¿Tardó en atender? | | | |

Y si algo salió mal: `F12` → **Console**, captura de pantalla.

En la consola va a aparecer una línea por llamada:

```
[llamada] contestada en 420 ms (preparada mientras sonaba)
```

Ese número es la medida. Si dice **«preparada mientras sonaba»**, el camino
nuevo funcionó. Si no aparece esa línea, se usó el camino viejo —que también
está bien, pero conviene saberlo—.

---

## Después

Con las tres llamadas hechas y el audio bien de los dos lados, esto pasa a
`main`.

Yo compruebo del lado de la base que las tres hayan quedado `terminada` con su
duración en segundos, que es lo que confirma que el audio se abrió de verdad y
no sólo que la pantalla dijo que sí.

---

## Lo que ya está probado, y lo que no

**Probado en el banco:** que un camino de red que sirve corta la espera
temprano, que uno que no sirve no la corta, que la tarjeta aparece y se puede
atender, que la llamada saliente funciona, y que no queda basura.

**NO probado, y por eso esta ventana:** que el audio abra de verdad contra Meta
con la negociación hecha por adelantado. El banco no tiene WebRTC real ni un
Meta real: eso sólo se sabe con un cliente del otro lado.
