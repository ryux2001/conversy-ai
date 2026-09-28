# Fase 1 — Plan de Backend

## Objetivo y alcance

Exponer desde NestJS las operaciones para el chat en inglés y el tutor de corrección. En desarrollo y pruebas el backend hablará con el modelo local configurado en llama.cpp en `http://127.0.0.1:8080`; la verificación manual actual usa `LFM2.5-8B-A1B-Q4_K_M.gguf` mediante el alias `LFM2.5`. La integración con el proveedor de modelos quedará intercambiable para usar OpenRouter cuando se configure su modelo y clave. El backend no guardará conversaciones en esta fase.

Referencias: `Conversy-ai/Fases/Fase-1/Fase-1.md`, `Fase-1-Diagrana.md` y `Conversy-ai/Tecnologías.md`. Plan de interfaz: [web/docs/fase-1-plan.md](../../web/docs/fase-1-plan.md).

## Organización propuesta

Cada módulo agrupa sus rutas, lógica, DTO, tipos e instrucciones del modelo. La comunicación con proveedores de IA es una capacidad compartida y vive en un módulo propio; así el chat y el tutor no dependen directamente de llama.cpp ni de OpenRouter.

```text
backend/
├─ docs/
│  └─ fase-1-plan.md
├─ src/
│  ├─ main.ts
│  ├─ app.module.ts
│  ├─ modules/
│  │  ├─ chat/
│  │  │  ├─ chat.module.ts
│  │  │  ├─ chat.controller.ts
│  │  │  ├─ chat.service.ts
│  │  │  ├─ dto/reply-request.dto.ts
│  │  │  ├─ prompts/conversation.prompt.ts
│  │  │  └─ chat.types.ts
│  │  ├─ tutor/
│  │  │  ├─ tutor.module.ts
│  │  │  ├─ tutor.controller.ts
│  │  │  ├─ tutor.service.ts
│  │  │  ├─ dto/evaluate-request.dto.ts
│  │  │  ├─ dto/reply-request.dto.ts
│  │  │  ├─ prompts/evaluation.prompt.ts
│  │  │  ├─ prompts/tutor-conversation.prompt.ts
│  │  │  └─ tutor.types.ts
│  │  └─ llm/
│  │     ├─ llm.module.ts
│  │     ├─ llm.service.ts
│  │     ├─ llm.types.ts
│  │     ├─ providers/llamacpp.client.ts
│  │     └─ providers/openrouter.client.ts
│  └─ common/
│     └─ dto/conversation-message.dto.ts
├─ test/
└─ .env.example
```

Los DTO y pruebas específicas deben quedarse junto al módulo correspondiente cuando se creen. `common` solo contiene el formato de mensaje compartido por chat y tutor; no se convertirá en una carpeta para lógica sin dueño. Los nombres finales podrán ajustarse a las convenciones del proyecto durante la implementación.

## Contrato de la API

| Operación | Entrada | Salida |
| --- | --- | --- |
| `POST /api/chat/reply` | `messages: ConversationMessage[]`; el último mensaje es del usuario | `message: ConversationMessage` del asistente |
| `POST /api/tutor/evaluate` | `messages: ConversationMessage[]`; el último mensaje es el que se evalúa | `feedback: TutorFeedback` con `targetMessageId`, `hasCorrection`, `suggestion` y `explanation` |
| `POST /api/tutor/reply` | `conversation: ConversationMessage[]`, `tutorMessages: TutorMessage[]` y `latestFeedback` opcional, asociado al ID del último mensaje del alumno | `message: TutorMessage` y, si se utilizó, `feedback` |

`ConversationMessage` tiene `id`, `role` (`user` o `assistant`) y `content`. Los identificadores sirven para vincular la evaluación con su mensaje. Si la frase es correcta, `hasCorrection` será `false` y `suggestion` podrá ser `null`; el tutor aún puede dar una observación breve. No se aceptarán mensajes con rol `system` desde la Web.

## Paso a paso

1. **Configurar el servidor.** Mover NestJS al puerto `3001` por defecto, porque Next.js usa `3000` en desarrollo. Añadir prefijo `/api`, CORS limitado al origen de Web y configuración por variables de entorno. Preparar `.env.example` con `PORT`, `WEB_ORIGIN`, `AI_LOCAL_ONLY`, `LOCAL_AI_URL`, `LOCAL_AI_MODEL`, timeout y variables de OpenRouter sin valores secretos. Nest carga `backend/.env.local` para configuración personal no versionada.
2. **Definir y validar entradas.** Instalar la validación necesaria para DTO y activar validación global. Rechazar roles no permitidos, contenido vacío, mensajes demasiado largos y conversaciones que excedan el límite definido. Establecer límites de historial/contexto para evitar que crezca sin control.
3. **Crear el módulo de modelos.** Definir una interfaz interna única para solicitar respuestas. Implementar primero el cliente de llama.cpp y comprobar el formato de su API expuesta en `127.0.0.1:8080`. Implementar el adaptador de OpenRouter bajo la misma interfaz y seleccionar proveedor con `AI_LOCAL_ONLY`; `OPENROUTER_API_KEY` y `OPENROUTER_MODEL` solo se leerán en el servidor cuando el modo local esté desactivado. Incorporar timeout y traducción de errores del proveedor a errores claros de la API.
4. **Crear el módulo de chat.** En `ChatService`, construir las instrucciones del compañero de conversación en inglés en el servidor, añadir el historial validado y pedir la siguiente respuesta al proveedor configurado. Devolver únicamente el mensaje del asistente con su identificador y contenido.
5. **Crear la evaluación del tutor.** En `TutorService`, evaluar cada último mensaje de usuario en su contexto: indicar si hay algo que corregir, ofrecer una alternativa natural y explicar el motivo brevemente en español, sin depender del idioma de interfaz. Web construirá un mensaje cercano para el diálogo del tutor usando esa salida. Solicitar una salida estructurada y validarla antes de responder; manejar una salida incompleta, mal formada o con explicación en otro idioma sin devolver contenido inválido al navegador.
6. **Crear el diálogo del tutor.** Añadir una operación independiente para preguntas libres al tutor. Mantener separados el chat de práctica y el diálogo del tutor; enviar roles e identificadores, el último mensaje del alumno, la última respuesta de Conversy y su evaluación validada como campos explícitos. El tutor explica y traduce el chat de práctica en español para principiantes, y puede sugerir ejemplos breves en inglés con traducción. Nunca responde como Conversy ni inventa preferencias del alumno. Si una referencia no identifica un mensaje, debe pedir aclaración. Si se pregunta si el último mensaje estuvo bien y aún no hay evaluación, volver a evaluarlo; responder desde el resultado estructurado y no inventar una aprobación.
7. **Mantener el chat temporal.** Hacer las operaciones sin estado: cada petición incluirá el contexto necesario y el servidor no almacenará usuarios, sesiones ni conversaciones. Construir las instrucciones del sistema exclusivamente en backend, sin confiar en roles o parámetros de prompt enviados por el cliente.
8. **Probar e integrar.** Añadir pruebas de servicios con un proveedor de IA simulado para los casos de respuesta, corrección, frase correcta y fallo del proveedor. Verificar los DTO y endpoints con pruebas de integración. Ejecutar lint, test y build. Finalmente, probar los tres endpoints con llama.cpp activo y completar un recorrido desde la Web.

## Criterios de terminado

- Web puede obtener respuesta de chat, evaluación y respuesta del tutor mediante las tres operaciones acordadas.
- El modelo local funciona para las pruebas de esta fase; el cambio a OpenRouter depende de configuración del servidor, sin cambiar la API pública.
- El servidor valida entradas, controla timeout y devuelve errores comprensibles si el modelo falla.
- Las respuestas y explicaciones del tutor se muestran en español aunque la interfaz esté en inglés; el compañero Conversy responde en inglés.
- Las consultas sobre respuestas de Conversy se basan en el mensaje identificado y no continúan la conversación como si el tutor fuera Conversy.
- No se persisten conversaciones ni se exponen claves de OpenRouter al navegador.
- Audio y WebGPU quedan para fases posteriores; el alcance actual es conversación por texto.
