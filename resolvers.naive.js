import { db } from './database.js';

export const resolversNaive = {
  Query: {
    clientes: async () => {
      return await db.fetchAllClientes();
    }
  },
  Cliente: {
    facturas: async (parent) => {
      return await db.fetchFacturasByClienteId(parent.id);
    }
  }
};
