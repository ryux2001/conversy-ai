import { createServer } from 'node:http';

const allowedOrigin = process.env.SMOKE_WEB_ORIGIN ?? 'http://127.0.0.1:3100';
const port = Number(process.env.SMOKE_API_PORT ?? 3101);

const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }

  if (request.method === 'POST' && request.url === '/api/chat/reply') {
    console.log('chat: success');
    response.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      message: {
        id: 'assistant-smoke-1',
        role: 'assistant',
        content: 'That sounds fun. What do you enjoy most about football?',
      },
    }));
    return;
  }

  if (request.method === 'POST' && request.url === '/api/tutor/evaluate') {
    console.log('tutor evaluation: unavailable');
    response.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      statusCode: 503,
      code: 'LLM_UNAVAILABLE',
      message: 'Model unavailable for smoke test.',
    }));
    return;
  }

  if (request.method === 'POST' && request.url === '/api/tutor/reply') {
    console.log('tutor reply: success');
    response.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      message: {
        id: 'tutor-smoke-1',
        role: 'tutor',
        content: 'Conversy te pregunta qué disfrutas del fútbol. Puedes responder con tu jugador favorito.',
      },
    }));
    return;
  }

  response.writeHead(404).end();
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Phase 1 smoke API listening on http://127.0.0.1:${port}`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
