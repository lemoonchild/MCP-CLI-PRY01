import fetch from 'node-fetch';

export function connectHttpServer(cfg) {
    const base = cfg.url.replace(/\/+$/, '');
    const rpcUrl = base + (cfg.rpcPath || '/rpc');
    const headers = cfg.headers || { 'Content-Type': 'application/json' };

    // Mapa de nombres "seguros" (para Anthropic) -> método JSON-RPC real
    const nameMap = {
        jokes_get: 'jokes.get',
        jokes_search: 'jokes.search',
        health_ping: 'health.ping',
    };

  // Lista de tools con nombres válidos para Anthropic 
    const tools = [
        {
            name: 'jokes_get',
            description: 'Devuelve un dad joke aleatorio.',
            input_schema: { type: 'object', properties: {}, required: [] },
        },
        {
            name: 'jokes_search',
            description: 'Busca dad jokes por palabra clave. Usa "limit" para pedir N chistes.',
            input_schema: {
                type: 'object',
                properties: {
                    q: { type: 'string', description: 'Palabra clave a buscar, ej. "egg", "cheese". Obligatoria.' },
                    limit: { type: 'integer', description: 'Número máximo de resultados (1..10)' },
                },
                required: ["q", "limit"],
            },
        },
        {
            name: 'health_ping',
            description: 'Ping de salud del servicio remoto.',
            input_schema: { type: 'object', properties: {}, required: [] },
        },
    ];

    async function jsonRpc(method, params = {}) {
        const payload = { jsonrpc: '2.0', id: Date.now(), method, params };
        const res = await fetch(rpcUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
            const msg = data?.error?.message || `HTTP ${res.status}`;
        }
        return data.result;
    }

  return {
        async listTools() {
        return tools;
        },
        async callTool(name, args = {}) {
            const method = nameMap[name] || name;
            return jsonRpc(method, args);
        },
        info: { transport: 'http', name: cfg.name, base, rpcUrl },
    };
}