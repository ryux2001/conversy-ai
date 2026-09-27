# Fase 1 — Plan de Web

## Objetivo y alcance

Crear en Next.js un chat temporal para conversar en inglés con una IA y un tutor accesible desde una burbuja. El tutor mostrará una evaluación de cada mensaje del usuario y permitirá hacerle preguntas con el contexto de la conversación. El orden de trabajo será: interfaz con datos simulados, conexión con NestJS y verificación del flujo completo.

Referencias: `Conversy-ai/Fases/Fase-1/Fase-1.md`, `Fase-1-Diagrana.md` y `Conversy-ai/Tecnologías.md`. Plan de la API: [backend/docs/fase-1-plan.md](../../backend/docs/fase-1-plan.md).

El boceto contiene dos estados de la misma pantalla: chat normal y tutor abierto. También dibuja barra lateral, indicador de chat temporal, campo de escritura y accesos a otras funciones. En esta fase solo serán funcionales el chat de texto, el reinicio de la conversación temporal y el tutor. Los demás accesos se señalarán como futuros o se omitirán hasta tener un destino real.

## Organización propuesta

Cada funcionalidad conserva sus componentes, estado, llamadas a la API y tipos en su propia carpeta. `shared` contiene únicamente piezas que usan varias funcionalidades. `app` se limita a rutas, composición inicial y estilos globales.

```text
web/
├─ docs/
│  └─ fase-1-plan.md
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx
│  │  ├─ page.tsx
│  │  └─ globals.css
│  ├─ features/
│  │  ├─ chat/
│  │  │  ├─ components/
│  │  │  │  ├─ chat-workspace.tsx
│  │  │  │  ├─ chat-header.tsx
│  │  │  │  ├─ message-list.tsx
│  │  │  │  ├─ message-bubble.tsx
│  │  │  │  └─ message-composer.tsx
│  │  │  ├─ hooks/use-temporary-chat.ts
│  │  │  ├─ lib/chat-api.ts
│  │  │  └─ types.ts
│  │  ├─ tutor/
│  │  │  ├─ components/
│  │  │  │  ├─ tutor-launcher.tsx
│  │  │  │  ├─ tutor-dialog.tsx
│  │  │  │  ├─ feedback-card.tsx
│  │  │  │  └─ tutor-composer.tsx
│  │  │  ├─ hooks/use-tutor.ts
│  │  │  ├─ lib/tutor-api.ts
│  │  │  └─ types.ts
│  │  └─ navigation/
│  │     └─ components/sidebar.tsx
│  └─ shared/
│     └─ lib/api-client.ts
└─ .env.local.example
```

Crear estos archivos conforme se necesiten; el árbol marca responsabilidades, no obliga a dejar componentes vacíos. `page.tsx` y `layout.tsx` seguirán siendo componentes de servidor. `chat-workspace.tsx`, los compositores y el diálogo del tutor serán componentes cliente porque manejan entrada, estado y eventos. Renderizar el estado inicial en el servidor cuando sea posible; los mensajes posteriores dependen de la interacción del navegador.

## Paso a paso

1. **Fijar el contrato con el backend.** Definir `ConversationMessage` (`id`, `role`, `content`), `TutorFeedback` (`targetMessageId`, `hasCorrection`, `suggestion`, `explanation`) y `TutorMessage`. Acordar las tres operaciones: `POST /api/chat/reply`, `POST /api/tutor/evaluate` y `POST /api/tutor/reply`. El navegador enviará solo roles `user` y `assistant`; las instrucciones del sistema se añadirán en NestJS.
2. **Construir la pantalla estática.** Sustituir la plantilla de Next.js por la composición del boceto: barra lateral, encabezado de chat temporal, zona de mensajes, campo de entrada y burbuja del tutor. Crear el estado visual del panel del tutor con ejemplos simulados. Adaptarlo a escritorio y móvil, con foco visible, etiquetas accesibles y navegación por teclado.
3. **Preparar el estado temporal.** Guardar mensajes, evaluaciones y conversación del tutor solo en memoria del cliente. Un botón de «Nueva conversación» limpiará los tres estados. No cargar ni guardar el historial en base de datos o almacenamiento local durante esta fase.
4. **Integrar el chat.** Al enviar un mensaje, añadirlo a la conversación y solicitar una respuesta a `POST /api/chat/reply`. Bloquear envíos duplicados mientras esa respuesta está pendiente; mostrar estados de espera, error y reintento. Limitar el historial enviado según el presupuesto de contexto acordado con backend.
5. **Integrar la evaluación automática.** Por cada mensaje del usuario, llamar a `POST /api/tutor/evaluate` con el mismo contexto y asociar el resultado a `targetMessageId`. La explicación será siempre en español aunque la interfaz esté en inglés; el ejemplo corregido puede estar en inglés. Si hay errores, construir con la corrección y explicación un mensaje conversacional del tutor. La evaluación puede resolverse independientemente de la respuesta del chat: si falla el tutor, la conversación principal debe seguir funcionando y se podrá reintentar la evaluación.
6. **Integrar el diálogo del tutor.** Abrirlo desde la burbuja, añadir automáticamente las correcciones al diálogo y mostrar una vista previa notificable mientras está cerrado. Permitir preguntas libres mediante `POST /api/tutor/reply`, enviando por separado los mensajes recientes del chat y del tutor, con sus roles e identificadores y la última respuesta de Conversy identificada. El tutor responde en español, explica o traduce mensajes de práctica y ayuda a formular respuestas breves en inglés con su traducción. Permitir cerrar el diálogo y recuperar el foco en el botón que lo abrió.
7. **Configurar la conexión.** Leer la URL pública del backend desde `NEXT_PUBLIC_API_URL` en `.env.local`; incluir un `.env.local.example` sin secretos y añadir una excepción para ese ejemplo en `web/.gitignore`, que ahora ignora `.env*`. El navegador nunca recibirá claves de OpenRouter ni instrucciones privadas del modelo.
8. **Verificar la fase.** Ejecutar lint y build de Web. Probar manualmente en escritorio y móvil: enviar varios turnos en inglés, recibir correcciones y casos sin corrección, consultar al tutor, reiniciar la conversación y simular una caída del backend/modelo. Revisar que el diálogo y el campo de texto funcionen con teclado.

## Criterios de terminado

- El usuario puede conversar en inglés sin iniciar sesión y reiniciar su único chat temporal.
- Cada mensaje suyo puede recibir una evaluación del tutor; una evaluación fallida no bloquea el chat.
- La burbuja abre un diálogo de tutor que conoce el contexto reciente y acepta preguntas.
- El tutor explica en español qué pregunta o significa una respuesta de Conversy, sin contestar como si fuera el compañero de conversación.
- La interfaz funciona en móvil y escritorio, y comunica claramente espera y errores.
- No hay persistencia, audio ni uso de WebGPU en esta fase. WebGPU queda reservado para las funciones de voz posteriores descritas en `Tecnologías.md`.
