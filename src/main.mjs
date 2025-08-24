import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import readline from 'node:readline';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Falta ANTHROPIC_API_KEY en tu archivo .env');
  process.exit(1);
}

const client = new Anthropic({ apiKey });

function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function main() {
  console.log('Chat LLM con Anthropic\n');
  const userPrompt = await ask('Escribe tu pregunta: ');

  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL,
      max_tokens: 512,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    });

    const blocks = response.content || [];
    const textBlock = blocks.find(b => b.type === 'text');
    const text = textBlock?.text ?? '(Sin texto en la respuesta)';
    console.log('\nRespuesta del LLM:\n');
    console.log(`\t${text}`);
  } catch (err) {
    // Manejo de errores (red, auth, etc.)
    console.error('Ocurrió un error llamando al LLM:\n');
    // Muestra mensaje legible + detalles técnicos si estás en dev
    console.error(err?.message || err);
    if (process.env.NODE_ENV === 'development') {
      console.error('\nDetalle técnico:', err);
    }
    process.exit(1);
  }
}

main();