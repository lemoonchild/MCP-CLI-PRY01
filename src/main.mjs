import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Falta ANTHROPIC_API_KEY en tu archivo .env');
  process.exit(1);
}

const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';

const client = new Anthropic({ apiKey });

const rl = createInterface({ input, output });

// Historial para mantener contexto en la sesión
const messages = [];

console.log('-- Chat LLM con Anthropic (multi-turno) --');
console.log('\nComandos: \n Escribe: /salir para terminar \n Escribe: /clear para limpiar contexto.\n');

async function askLoop() {
  while (true) {
    const userPrompt = await rl.question('Escribe tu pregunta: ');

    const trimmed = userPrompt.trim();
    if (!trimmed) continue;

    // Comandos especiales
    if (trimmed === '/salir') break;
    if (trimmed === '/clear') {
      messages.length = 0;
      console.log('(Contexto borrado)\n');
      continue;
    }

    // Agregar turno de usuario al historial
    messages.push({ role: 'user', content: trimmed });

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 1024, 
        messages
      });

      // Extraer texto de los bloques
      const text = (response.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim() || '(Sin texto en la respuesta)';

      console.log('\nRespuesta del asistente:\n' + text + '\n');

      // Agregar turno del asistente al historial para mantener contexto
      messages.push({ role: 'assistant', content: text });

    } catch (err) {
      console.error('\nOcurrió un error llamando al LLM:', err?.message || err);
      if (process.env.NODE_ENV === 'development') {
        console.error('\nDetalle técnico:', err);
      }
      console.log('\n(El chat continúa; puedes intentar de nuevo o usar /salir)\n');
    }
  }
}

askLoop()
  .finally(() => rl.close());