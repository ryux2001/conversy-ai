# Conversy AI

Aplicación para practicar inglés con un frontend Next.js y un backend NestJS.

## Estructura

- `web/`: frontend Next.js 16, preparado para Vercel.
- `backend/`: API NestJS, preparada para Render.
- `render.yaml`: Blueprint reproducible del servicio de Render.

## Desarrollo local

Usa Node.js 24 y pnpm. Cada aplicación mantiene su propio lockfile.

```bash
cd backend
pnpm install
pnpm run start:dev
```

En otra terminal:

```bash
cd web
pnpm install
pnpm dev
```

Copia las plantillas de entorno antes de arrancar:

- `backend/.env.example` a `backend/.env.local`
- `web/.env.local.example` a `web/.env.local`

Los secretos pertenecen únicamente al backend. No uses el prefijo `NEXT_PUBLIC_`
para ninguna clave privada.

## Despliegue: Render + Vercel

El orden recomendado evita tener que adivinar las URLs finales.

### 1. Publicar el backend en Render

1. Sube este repositorio a tu proveedor Git.
2. En Render, crea un **Blueprint** desde el repositorio. Render detectará
   `render.yaml` y creará el servicio `conversy-api` con raíz `backend/`.
3. Completa las variables que Render solicitará:
   - `OPENROUTER_API_KEY`: clave privada de OpenRouter.
   - `OPENROUTER_MODEL`: identificador exacto del modelo de OpenRouter.
   - `WEB_ORIGIN`: usa temporalmente `http://localhost:3000`; se sustituirá
     por la URL pública de Vercel en el paso 3.
4. Espera a que el health check responda en
   `https://<tu-servicio>.onrender.com/api/health`.

El servidor local de llama.cpp no existe dentro de Render. Por eso el Blueprint
fija `AI_LOCAL_ONLY=false` y usa OpenRouter. `PORT` tampoco debe fijarse:
Render lo inyecta y Nest escucha en `0.0.0.0`.

Si prefieres crear el Web Service manualmente, usa estos valores:

| Campo | Valor |
| --- | --- |
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `pnpm install --frozen-lockfile && pnpm run build` |
| Start Command | `pnpm run start:prod` |
| Health Check Path | `/api/health` |
| Node | `24.x` |

### 2. Publicar el frontend en Vercel

1. Importa el mismo repositorio en Vercel.
2. Selecciona `web` como **Root Directory**. Vercel detectará Next.js.
3. Añade estas variables para Production (y para Preview si quieres probar
   despliegues de ramas):
   - `NEXT_PUBLIC_API_URL=https://<tu-servicio>.onrender.com/api`
   - `NEXT_PUBLIC_WHISPER_MODEL_SOURCE=hub`
   - `NEXT_PUBLIC_WHISPER_MODEL_ID=onnx-community/whisper-base.en`
4. Despliega. Las variables `NEXT_PUBLIC_*` quedan incorporadas durante el
   build, así que cualquier cambio requiere un nuevo despliegue.

No hace falta un `vercel.json`: la integración nativa de Next.js detecta el
comando `pnpm run build` y el lockfile de `web/`.

### 3. Cerrar CORS en Render

Cuando Vercel entregue la URL de producción, actualiza en Render:

```dotenv
WEB_ORIGIN=https://<tu-proyecto>.vercel.app
```

Render reiniciará el backend. Para permitir más de un origen, sepáralos con
comas, sin rutas ni `/` final:

```dotenv
WEB_ORIGIN=https://app.example.com,https://mi-preview.vercel.app
```

### 4. Comprobación rápida

1. Abre `/api/health` en Render y comprueba que devuelve `{"status":"ok"}`.
2. Abre la aplicación de Vercel y envía un mensaje de texto.
3. En DevTools > Network, la petición debe ir a
   `https://<tu-servicio>.onrender.com/api/...` y no a `localhost`.
4. Prueba `/voice` en un navegador compatible con WebGPU. Whisper se descarga
   y ejecuta en el navegador; el audio de STT no se envía a Render.

## Verificación local

```bash
cd backend
pnpm run build
pnpm test

cd ../web
pnpm run build
pnpm run lint
```
