import fetch from 'node-fetch';

/**
 * Connects to a remote JSON-RPC server over HTTP.
 *
 * @param {object} cfg - Configuration object.
 * @param {string} cfg.url - The base URL of the remote RPC server.
 * @param {object} [cfg.headers] - Optional headers to include in each request.
 * @param {string} [cfg.name] - Optional name to identify the remote.
 * @returns {object} An object with methods to list and call tools.
 */
export function connectHttpServer(cfg) {
    const base = cfg.url.replace(/\/+$/, '');
    const rpcUrl = base;
    const headers = cfg.headers || { 'Content-Type': 'application/json' };

    /**
    * Mapping of Anthropic-safe tool names to their corresponding JSON-RPC method names.
    */
    const nameMap = {
        jokes_get: 'jokes.get',
        jokes_search: 'jokes.search',
        health_ping: 'health.ping',
    };

    /**
    * List of tools exposed by the remote server with Anthropic-compatible names and JSON Schemas.
    */
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

    /**
     * Executes a JSON-RPC request.
     *
     * @param {string} method - Method name (e.g., "jokes.get").
     * @param {object} [params={}] - Parameters to send with the request.
     * @returns {Promise<any>} - The result returned by the server.
     * @throws Will throw an error if the request fails or returns an error response.
    */
    async function jsonRpc(method, params = {}) {
        const payload = { jsonrpc: '2.0', id: Date.now(), method, params };

        const res = await fetch(rpcUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        let data;
        try {
            data = await res.json();
        } catch {
            throw new Error(`Respuesta inválida del servidor (no es JSON) - HTTP ${res.status}`);
        }

        if (!res.ok || data?.error) {
            const msg = data?.error?.message || `HTTP ${res.status}`;
            throw new Error(`Error al llamar a ${method}: ${msg}`);
        }

        return data.result;
    }
    
    return {

            /**
             * Returns the list of tools supported by the remote server.
             *
             * @returns {Promise<object[]>} List of tool metadata.
             */
            async listTools() {
                return tools;
            },

            /**
             * Invokes a remote tool by name, passing arguments as parameters.
             *
             * @param {string} name - Anthropic-safe tool name (e.g., "jokes_get").
             * @param {object} [args={}] - Input arguments for the tool.
             * @returns {Promise<any>} - Result from the tool.
             * @throws Will throw an error if the tool name is invalid or the call fails.
             */
            async callTool(name, args = {}) {
                if (typeof name !== 'string') {
                    throw new Error(`Nombre de tool inválido: ${JSON.stringify(name)}`);
                }

                const method = nameMap[name] || name;

                if (method === 'tools/call') {
                    return jsonRpc('tools/call', {
                        name,
                        arguments: args
                    });
                }

                return jsonRpc(method, args);
            },

            /**
             * Information about the transport and configuration of the connection.
             * @type {{ transport: string, name?: string, base: string, rpcUrl: string }}
             */
            info: { transport: 'http', name: cfg.name, base, rpcUrl },
        };
}