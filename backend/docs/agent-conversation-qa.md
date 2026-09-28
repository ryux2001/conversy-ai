# Verificación manual de Conversy y el tutor

Fecha: 2026-09-28  
Entorno: `http://localhost:3000`, backend local y modelo local LFM2.5-8B-A1B.

## Resultado

Se probaron ambos flujos en la interfaz real. Conversy respondió de forma pertinente y breve. El tutor recibió la respuesta del chat como contexto, propuso una respuesta en inglés con traducción y mantuvo el hilo sin volver a saludar. La revisión automática detectó el error gramatical del segundo caso. Durante la prueba también se encontró una explicación gramatical incorrecta del tutor; se añadió una respuesta basada en la corrección estructurada para el patrón probado y se verificó de nuevo en la interfaz.

## Casos ejecutados

| Flujo | Entrada | Resultado |
| --- | --- | --- |
| Chat normal | `Hello, can we talk about football?` | La primera respuesta agotó el presupuesto de salida y la interfaz permitió reintentar. Tras aumentar el límite del chat, el reintento respondió: “Sure, I'd love to chat about football. What would you like to discuss?” |
| Tutor: ayuda para responder | `¿Qué le podría responder al último mensaje que me envió?` | Usó la última respuesta de Conversy y produjo una frase en inglés más su significado en español, sin contestar como Conversy ni volver a saludar. |
| Revisión automática | `Yesterday I visit the stadium` | Conversy mantuvo el tema. El tutor sugirió `Yesterday, I visited the stadium` y vinculó el apunte a la frase correcta. |
| Tutor: continuidad | `Why did you change visit to visited?` | **Falló inicialmente:** atribuyó el pasado al sujeto `I`, no a `Yesterday`. Se añadió una ruta determinista que usa la marca temporal y el cambio gramatical verificado. La repetición en la UI contestó: “Yesterday” indica pasado y por eso se usa “visited” en lugar de “visit”. |

## Fallos observados y mitigaciones

1. **Presupuesto de salida insuficiente para Conversy.** Con `max_tokens=384`, el modelo local terminó por longitud con contenido visible vacío (`finish_reason=length`); la UI conservó el mensaje y mostró “Reintentar”. Una llamada diagnóstica directa terminó correctamente al permitir 678 tokens de salida. Se elevó el presupuesto del chat a 1024 y el reintento real terminó bien.
2. **Tutor no atendía correctamente la intención de pedir una respuesta.** El caso de la captura podía acabar con una contestación genérica dirigida al alumno. Se añadió detección explícita de esa intención, un contrato de salida con frase en inglés y traducción, y validación de formato.
3. **Explicación gramatical plausible pero falsa.** El modelo dijo que `I` era la razón para usar pasado. Para la combinación verificada de una marca temporal pasada y un cambio gramatical estructurado, el backend responde desde los datos de la corrección en vez de delegar la regla al modelo.
4. **Corrección de puntuación no respaldada por el texto.** La evaluación ahora verifica que los fragmentos original y corregido existan en sus frases y que los signos realmente difieran antes de aceptar una afirmación de cambio de puntuación. Se agregó una prueba negativa que exige error si el modelo inventa el cambio.

## Límites de esta verificación

- La respuesta determinista de explicación gramatical cubre marcas temporales pasadas reconocidas (`yesterday`, `last night/week/month/year` y `N days ago`) cuando existe una corrección gramatical estructurada coincidente. Otros patrones explicativos siguen usando el modelo y requieren más casos de evaluación.
- La prueba visual de notificación mostró la coma añadida en la sugerencia. El texto decía que se añadió, no que fuese obligatoria; el prompt ahora indica no presentar como obligatoria una coma de estilo.
- La conversación y el tutor tienen servicios y prompts separados, pero comparten acceso al servicio/configuración del modelo. El tutor recibe el transcript, la última respuesta de Conversy y la corrección validada como contexto; no comparte la ejecución del turno de Conversy.

## Verificación automatizada

- TypeScript backend: correcto (`tsc --noEmit -p tsconfig.build.json`).
- TypeScript frontend: correcto (`tsc --noEmit -p tsconfig.json`).
- E2E backend: 8/8 pruebas correctas, incluida la explicación basada en marca temporal y la regresión de puntuación inventada.

## Cierre de fase 1 — comprobaciones adicionales

- La compilación predeterminada de Next/Turbopack falló al crear un proceso auxiliar en este entorno (`os error 5`, acceso denegado). Next 16 documenta `--webpack`; el script `build` de Web ahora usa esa opción y `next build --webpack` terminó correctamente en producción.
- Backend lint y Web lint terminan sin errores ni advertencias. Backend build termina correctamente. Las pruebas actuales son 5/5 unitarias y 10/10 E2E; cubren conexión caída, timeout, respuesta vacía, salida truncada y errores claros en la API.
- Smoke test visual con API simulada: `POST /api/tutor/evaluate` devolvió 503 y el chat principal recibió respuesta. La tarjeta ahora aclara que el modelo no está disponible, en vez de atribuirlo a NestJS. El servidor de prueba se puede iniciar con `node backend/test/phase1-smoke-mock-api.mjs` (puerto 3101; el cliente debe construirse con `NEXT_PUBLIC_API_URL=http://127.0.0.1:3101/api`).
- Prueba de teclado en navegador: se abrió el tutor desde el lanzador, se cerró con Escape y el foco volvió al lanzador.
- **Móvil pendiente:** se generó una captura física de 390 px, pero el navegador headless no permitió confirmar el ancho CSS real y la composición salió recortada. No se considera una validación fiable en un viewport de 390 px; hace falta comprobarlo con emulación responsive real o un dispositivo.
- El CLI `npm` no está disponible en este entorno. Se ejecutó directamente `next build --webpack`, que es el comando configurado ahora en `web/package.json`; por tanto, queda sin comprobar únicamente la invocación mediante `npm run build`.
