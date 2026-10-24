import DataLoader from 'dataloader';
import { db } from './database.js';

export const createFacturasLoader = () => {
  return new DataLoader(async (clienteIds) => {
    return await db.fetchFacturasByClienteIdsBatch(clienteIds);
  });
};
