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

1. **Presupuesto de salida insuficiente para Conversy.** LFM2.5 puede consumir cientos de tokens en razonamiento antes de producir texto visible. Una prueba real con el límite de 128 terminó con `finish_reason=length` y contenido visible vacío. Conversy ahora da 1024 tokens y reintenta una vez con 2048; el perfil local LFM2.5 aplica temperatura 0.2, `top_k=80` y penalización de repetición 1.05.
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

## Mitigación de fallos en práctica por voz — 2026-10-01

- La prueba con `We can talk about of everseyarsalana.` reprodujo el agotamiento de tokens de Conversy con un límite de 128. Se aumentó el presupuesto inicial a 1024 y se añadió un reintento a 2048. En llamadas locales LFM2.5 usa los parámetros recomendados por Liquid AI; el razonamiento sigue activo y queda contabilizado dentro del límite.
- Se reprodujo la evaluación del tutor y la respuesta conversacional con el mismo transcript. Conversy contestó sin truncamiento. La evaluación no inventó una nueva palabra en `suggestion`, aunque la explicación afirmó que había un error gramatical y a la vez se abstuvo; se detectó la incoherencia. El tutor no volvió a saludar y admitió que no podía confirmar el término final.
- La ruta del chat ahora marca el último turno como transcripción de voz para que Conversy pueda pedir aclaración en inglés si una palabra desconocida impide entenderla. El tutor distingue reglas gramaticales de incertidumbre del reconocimiento: puede corregir un fragmento claro y conservar intacto un término dudoso. Las correcciones de audio se aceptan solo cuando modifican una secuencia gramatical breve y el `issue` coincide exactamente con ese cambio.
- El transcript más reciente tiene una acción de edición. Guardarlo conserva el audio, invalida la respuesta y las notas asociadas a ese turno y solicita una respuesta y evaluación nuevas con el texto editado. Las respuestas de Conversy y tutor se publican independientemente; el tutor no espera a que Conversy finalice.
- El tutor aplica una corrección determinista y acotada al patrón de voz `talk/speak about of`: elimina solo el `of` redundante, deja intacto el resto del transcript (incluidas palabras dudosas) y puede explicar ese cambio sin volver a evaluar la frase ni iniciar un saludo nuevo.
- Si Conversy necesita aclarar una palabra larga de baja confianza en un transcript, la respuesta no repite esa secuencia de letras: pregunta por “that word”. Esto reduce la propagación visual de errores de Whisper, aunque no sustituye la edición de la transcripción por parte del usuario.
- Comprobaciones automatizadas actuales: backend typecheck, lint y 6 pruebas unitarias; backend E2E 16/16; frontend ESLint y build de producción `next build --webpack` correctos (el build también ejecutó TypeScript).
- La repetición en navegador del control de edición queda pendiente; la transcripción original todavía no se puede comparar con el audio capturado porque la grabación solo está en el navegador del usuario.
- No se repitió una conversación en vivo con LFM2.5 tras estos últimos cambios: en esta comprobación no había un servidor escuchando en los puertos locales 3001/8080. Los nuevos comportamientos deterministas y el sanitizado de respuesta sí quedaron cubiertos por E2E; los probes previos con LFM2.5 constan arriba.

## Corrección de contexto, evaluación y explicaciones del tutor — 2026-10-01

### Cambios verificados

- Las tareas del tutor resuelven intención, autor y mensaje objetivo por ID. Las respuestas incluyen metadatos opcionales de tarea y el parser conserva/valida esos datos al recibir el historial.
- Las explicaciones de mensajes se generan en una solicitud aislada: la pregunta y el objetivo exacto van juntos en un payload de usuario; el prompt de sistema de esta tarea es breve. Se comprueba el ID devuelto antes de presentar una respuesta.
- Las repreguntas como «¿Y qué me está preguntando exactamente?» se reconocen como explicaciones de seguimiento y mantienen el objetivo anterior aunque el chat principal haya avanzado.
- La evaluación recibe el mensaje objetivo separado del contexto de referencia. La sugerencia se valida mediante diferencias ordenadas de tokens: cada modificación debe corresponder a un `issue`, con tipo compatible, y no puede incorporar texto de turnos anteriores.
- Si la corrección coincide con el mensaje pero la explicación del modelo filtra instrucciones internas o sale en inglés, se sustituye por una descripción breve en español derivada únicamente de los cambios validados. Si la corrección no coincide, se conserva el error `LLM_FEEDBACK_INCONSISTENT`; no se publica una sugerencia no verificada.
- Se añadieron regresiones para contexto de tarea, seguimiento de referencia, fuga de instrucciones, idioma de explicación y cambios de texto/puntuación. La UI muestra errores diferenciados de explicación/tarea.

### Prueba real con LFM2.5-8B-A1B-Q4_K_M

Se ejecutó el backend compilado localmente contra el modelo llama.cpp local. En tres conversaciones nuevas de fútbol, Conversy respondió normalmente y se preguntó al tutor qué significaba su última respuesta y qué estaba preguntando. Los IDs elegidos por el tutor fueron `qa4-a1`, `qa5-a1` y `qa6-a1`; en las tres repreguntas el resultado mantuvo ese mismo ID y `reason: follow_up`. Las respuestas fueron breves y en español; hubo variación en la calidad de la paráfrasis (en una respuesta describió la pregunta con poca precisión y en otra mencionó innecesariamente el contexto de la práctica), por lo que no se considera perfecta la fidelidad semántica del modelo.

También se probó un pedido sobre café: Conversy contestó «Sure, I can get that for you. Would you like any milk or sugar?» y el tutor explicó correctamente que ofrecía traer algo y preguntaba si quería leche o azúcar. Para `I like football.`, el tutor de evaluación devolvió `hasCorrection: false`, sin sugerir cambios; la explicación en inglés se sustituyó por «No detecté errores claros en esta frase.»

### Fallos observados y límites

- **Regresión encontrada y corregida durante la prueba:** «¿Y qué me está preguntando exactamente?» se interpretaba como ayuda general; podía perder el mensaje previo. Ahora se clasifica como `explain_message`, y conserva el ID anterior. El caso quedó en pruebas unitarias y E2E.
- **Explicación inicial con contexto mal priorizado:** el modelo dijo que no tenía acceso al mensaje aunque el ID se había resuelto correctamente. Se movieron pregunta y mensaje objetivo al último payload de usuario y se acortó el prompt específico de explicación. Después de ello el modelo sí explicó respuestas reales y mantuvo sus IDs.
- **Explicación en inglés / texto de instrucciones:** si la diferencia entre original y sugerencia es válida, el usuario recibe una explicación de reserva factual, sin causa gramatical inventada ni texto interno.
- **Corrección gramatical real aún no validada:** `Yesterday I visit the stadium.` y `Eden hazard maybe?` produjeron `LLM_FEEDBACK_INCONSISTENT` en las últimas pruebas en vivo. La protección impide mostrar correcciones incompatibles, pero estos dos ejemplos demuestran que el modelo local puede abstenerse/fracasar al producir `issues` precisos. Se registra como límite funcional pendiente; no se declara resuelta la calidad de todas las correcciones.
- Una ejecución anterior intentó enviar una conversación terminada en un mensaje del asistente y recibió HTTP 400 (`El último mensaje de la conversación debe ser del usuario`). Fue un payload de prueba inválido, no una respuesta del modelo ni un fallo de la app; las repeticiones siguientes usaron el contrato correcto.

### Pruebas automatizadas de esta implementación

- Backend unit tests: 17/17.
- Backend E2E: 20/20.
- Backend build y Oxlint: correctos.
- Web ESLint: correcto.
- Web `next build --webpack`: correcto al ejecutar el build fuera del sandbox. La primera ejecución restringida falló al resolver `@huggingface/transformers` por permisos de lectura; el paquete estaba enlazado y el build completó al usar el acceso autorizado. Web ESLint y el TypeScript del build pasaron.
- La página local devolvió HTTP 200 y abrió correctamente, pero esta pasada no envió mensajes desde la UI; el flujo semántico se comprobó directamente mediante la API local. La interacción de extremo a extremo desde el navegador queda pendiente.
- `git diff --check`: correcto.
