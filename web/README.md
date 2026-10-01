# Conversy web

## Desarrollo

Instala dependencias con pnpm y ejecuta `pnpm dev`. Copia `.env.local.example` a `.env.local` y ajusta `NEXT_PUBLIC_API_URL` al backend local.

## Modos de práctica

- `/` abre la práctica escrita: mensajes de texto y su tutor.
- `/voice` abre la práctica por voz: mensajes de audio, transcripción local con Whisper y el mismo tutor por texto.
- La transcripción de voz queda visible y el último mensaje transcrito se puede editar; al guardarlo, Conversy y el tutor analizan de nuevo el texto corregido.
- Cada modo mantiene su conversación, correcciones, borrador y estado del tutor por separado mientras la aplicación siga abierta. Cambiar de modo no mezcla historiales; “Nueva conversación” solo reinicia el modo visible.
- El modelo Whisper se prepara únicamente en práctica por voz. Al dejar esa sección se libera el worker; en modo `hub` los archivos siguen disponibles en la caché del navegador.
- Las grabaciones permanecen en memoria temporal, sujetas al límite por sesión; se liberan al iniciar una conversación nueva o cerrar la aplicación.

## Voz local con Whisper WebGPU

La transcripción se ejecuta en el navegador con `@huggingface/transformers` 3.8.1 y `onnx-community/whisper-base.en`, usando WebGPU. NestJS recibe únicamente el texto transcrito; el audio original no se envía para STT ni para la evaluación actual del tutor. La inferencia requiere un navegador/dispositivo compatible con WebGPU. El modelo es solo de transcripción: la evaluación fonética real queda pendiente de un analizador acústico validado (hito 2B).

La aplicación fija la revisión `51eefc0af78b103839eda9e7e4f4186acc6517fe` y usa `encoder_model.onnx` + `decoder_model_merged_q4.onnx` (aproximadamente 207 MB, no los 2,36 GB de todas las variantes del repositorio). La primera carga en modo `hub` requiere internet. Transformers.js conserva los archivos en Cache Storage para reutilizarlos en el mismo origen; el navegador puede eliminarlos si lo decide o si falta espacio. El control “Eliminar modelo descargado” se limita a ese repositorio y revisión.

### Usuario: descargar y conservar en el navegador

En `web/.env.local`:

```dotenv
NEXT_PUBLIC_WHISPER_MODEL_SOURCE=hub
NEXT_PUBLIC_WHISPER_MODEL_ID=onnx-community/whisper-base.en
```

Al pulsar “Preparar modelo de voz” se descargan y preparan los pesos. La grabación se habilita al terminar. Cambiar variables públicas requiere reiniciar Next.js (y reconstruir para producción).

### Desarrollo: usar un modelo que ya está en disco

El directorio debe ser la raíz del repositorio del modelo, la carpeta que contiene `config.json`, `tokenizer.json` y `onnx/`. Debe incluir los siguientes archivos:

```text
config.json
generation_config.json
preprocessor_config.json
tokenizer.json
tokenizer_config.json
vocab.json
merges.txt
normalizer.json
added_tokens.json
special_tokens_map.json
quantize_config.json
onnx/encoder_model.onnx
onnx/decoder_model_merged_q4.onnx
```

Configura `web/.env.local` (usa `/` en rutas Windows):

```dotenv
NEXT_PUBLIC_WHISPER_MODEL_SOURCE=local
NEXT_PUBLIC_WHISPER_MODEL_ID=onnx-community/whisper-base.en
WHISPER_MODEL_DIR=C:/models/whisper-base.en
```

`WHISPER_MODEL_DIR` solo lo lee el servidor Next.js; no uses el prefijo `NEXT_PUBLIC_`. Reinicia `pnpm dev`. La ruta local está disponible únicamente en desarrollo, sirve una lista cerrada de archivos y desactiva cualquier fallback remoto. No copies el modelo a Git. Si la descarga está en la caché de Hugging Face, configura la carpeta de snapshot que contiene directamente esos archivos. GGUF/GGML y pesos PyTorch no son ONNX y no sirven para esta ruta.

### Límites actuales

- No se fuerza fallback a WASM si falta WebGPU: el chat escrito sigue disponible y el error de voz se puede reintentar.
- La respuesta hablada usa una voz inglesa local que provea el navegador. No todos los dispositivos tienen una; si falta, se conserva la respuesta escrita y se informa.
- Whisper transcribe, pero no evalúa fonemas ni pronunciación. No se llama al endpoint acústico antiguo desde el cliente.
- Las grabaciones y sus URLs siguen temporales y sujetas a los límites de memoria de la conversación.
