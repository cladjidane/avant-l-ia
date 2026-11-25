// Assemble le serveur MCP en un seul fichier exécutable par Node :
// mcp/dist/server.mjs. Les bibliothèques restent dans node_modules.
import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'mcp/server.ts',
  platform: 'node',
  external: [/^@huggingface\//, /^@modelcontextprotocol\//, /^zod/, /^node:/],
  output: { file: 'mcp/dist/server.mjs', format: 'esm' },
});
