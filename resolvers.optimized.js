import { db } from './database.js';

export const resolversOptimized = {
  Query: {
    clientes: async () => {
      return await db.fetchAllClientes();
    }
  },
  Cliente: {
    facturas: async (parent, _, context) => {
      return await context.loaders.facturasLoader.load(parent.id);
    }
  }
};
