import { readFileSync } from 'node:fs';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { resolversOptimized } from './resolvers.optimized.js';
import { createFacturasLoader } from './dataloaders.js';

const typeDefs = readFileSync('./schema.graphql', 'utf-8');

const server = new ApolloServer({
  typeDefs,
  resolvers: resolversOptimized
});

const { url } = await startStandaloneServer(server, {
  listen: { port: 4000 },
  context: async () => ({
    loaders: {
      facturasLoader: createFacturasLoader()
    }
  })
});

console.log(`🚀 Servidor optimizado (DataLoader) listo en: ${url}`);
