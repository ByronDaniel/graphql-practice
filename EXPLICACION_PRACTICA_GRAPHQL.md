# Documento de Sustentación y Explicación Técnica
## Práctica 04: Optimización de Modelos de Datos en GraphQL con el Patrón DataLoader
**Materia:** Patrones de Diseño de APIs  
**Programa:** Maestría en Software  

---

## 1. Resumen Ejecutivo y Objetivos

El objetivo de esta práctica es diseñar un contrato de API bajo la metodología **Schema-First** utilizando **GraphQL**, diagnosticar el cuello de botella arquitectónico conocido como **Problema de Consulta N+1**, y resolverlo mediante el patrón de diseño **DataLoader** (técnicas de *Batching* y *Per-Request Caching*).

---

## 2. Contexto del Problema y Justificación Arquitectónica

### 2.1 El Escenario Empresarial (LogiTech SaaS)
La plataforma requiere presentar un tablero consolidado con la información de los clientes corporativos junto con sus facturas históricas asociadas.

### 2.2 Limitaciones de la Arquitectura REST Tradicional
En una arquitectura REST convencional:
1. El cliente realiza una primera petición HTTP a `GET /clientes` para obtener la lista de $N$ clientes.
2. Posteriormente, para obtener el detalle de facturación, el cliente debe emitir $N$ peticiones HTTP adicionales a `GET /clientes/{id}/facturas`.

**Consecuencias en REST:**
- **Under-fetching:** La primera petición no entrega todos los datos necesarios.
- **Round-Trips Múltiples:** Saturación de red en dispositivos móviles o conexiones con latencia alta.

### 2.3 El Problema N+1 en GraphQL (Solución Ingenua)
GraphQL resuelve el problema de cara al cliente: permite solicitar en un único viaje de red tanto los clientes como sus facturas mediante una sola consulta jerárquica.

Sin embargo, a nivel del **servidor**, si los resolutores (*resolvers*) se implementan de forma ingenua, el problema de las múltiples consultas se traslada internamente a la base de datos:
1. Se ejecuta **1** consulta para listar los clientes:
   ```sql
   SELECT * FROM clientes;
   ```
2. Por cada cliente obtenido ($N$), el resolutor de campo `Cliente.facturas` se invoca de manera aislada e independiente, disparando **$N$** consultas separadas:
   ```sql
   SELECT * FROM facturas WHERE cliente_id = 'c-1';
   SELECT * FROM facturas WHERE cliente_id = 'c-2';
   SELECT * FROM facturas WHERE cliente_id = 'c-3';
   SELECT * FROM facturas WHERE cliente_id = 'c-4';
   SELECT * FROM facturas WHERE cliente_id = 'c-5';
   ```

**Impacto:** Para 5 clientes se ejecutan $1 + 5 = 6$ consultas a la base de datos. Con 200 ms de latencia por viaje de datos simulado, el tiempo de respuesta total supera los **1.2 segundos**.

---

## 3. Solución Arquitectónica con el Patrón DataLoader

### 3.1 ¿Qué es DataLoader?
DataLoader es una utilidad desarrollada por el equipo de GraphQL/Meta que optimiza el acceso a datos mediante dos principios fundamentales:

1. **Batching (Agrupamiento por Lotes):**  
   Durante el mismo ciclo del bucle de eventos (*event loop tick*), DataLoader recolecta todos los identificadores individuales que los resolutores solicitan a través de `.load(id)`. En lugar de ejecutar una consulta por cada identificador, los combina en un único arreglo y realiza una única llamada por lote.

2. **Per-Request Caching (Caché por Ciclo de Vida de Petición):**  
   Dentro de una misma petición HTTP, si se vuelve a solicitar el mismo identificador, DataLoader devuelve la promesa en memoria sin volver a consultar la base de datos.
   
   > **Importante para la defensa:** DataLoader se instancia **dentro de la función `context` de cada petición** en Apollo Server. Nunca debe ser un singleton global, ya que compartir la instancia entre diferentes usuarios generaría fuga de información privada (*data leak*) y consumo descontrolado de memoria.

### 3.2 Restricción Técnica de la Función por Lotes
La función por lotes (*Batch Function*) exige cumplir una regla estricta:
- El arreglo retornado debe tener exactamente la misma longitud que el arreglo de claves recibido (`clienteIds`).
- Cada elemento en el arreglo resultante debe corresponder exactamente al índice de la clave solicitada.

---

## 4. Estructura de Componentes Implementados

El proyecto fue modularizado respetando la separación de responsabilidades y las buenas prácticas de arquitectura:

| Archivo | Responsabilidad Arquitectónica |
| :--- | :--- |
| `schema.graphql` | Contrato de tipos estricto (SDL) con los tipos `Cliente`, `Factura` y la `Query` raíz. |
| `database.js` | Base de datos simulada con latencia artificial (200ms), exponiendo búsquedas individuales y la función por lotes con cláusula `IN (...)`. |
| `dataloaders.js` | Fábrica (*factory function*) `createFacturasLoader()` que genera la instancia de DataLoader vinculada a la función por lotes de la base de datos. |
| `resolvers.naive.js` | Resolutores ingenuos donde cada `Cliente.facturas` invoca consultas individuales (reproduce el problema N+1). |
| `resolvers.optimized.js` | Resolutores optimizados que delegan la carga a `context.loaders.facturasLoader.load(parent.id)`. |
| `resolvers.js` | Módulo integrador que expone ambas variantes para fines de prueba y comparación. |
| `server.naive.js` | Servidor Apollo configurado con los resolutores ingenuos (puerto 4000). |
| `server.js` | Servidor Apollo principal optimizado, inyectando el DataLoader en el `context` por petición. |
| `package.json` | Configuración como módulo ECMAScript (`"type": "module"`) y scripts de ejecución. |

---

## 5. Comparativa de Rendimiento y Evidencia de Logs

Al ejecutar la consulta en Apollo Sandbox (`http://localhost:4000`):

```graphql
query GetDashboardData {
  clientes {
    id
    nombre
    sector
    facturas {
      id
      monto
      estado
    }
  }
}
```

### 5.1 Salida en Consola - Versión Ingenua (`npm run start:naive`)
```text
[DB READ] SELECT * FROM clientes; (Buscando catálogo completo)
[DB READ] SELECT * FROM facturas WHERE cliente_id = 'c-1';
[DB READ] SELECT * FROM facturas WHERE cliente_id = 'c-2';
[DB READ] SELECT * FROM facturas WHERE cliente_id = 'c-3';
[DB READ] SELECT * FROM facturas WHERE cliente_id = 'c-4';
[DB READ] SELECT * FROM facturas WHERE cliente_id = 'c-5';
```
- **Total de Consultas:** 6
- **Latencia Acumulada:** ~1200 ms

### 5.2 Salida en Consola - Versión Optimizada con DataLoader (`npm start`)
```text
[DB READ] SELECT * FROM clientes; (Buscando catálogo completo)
[DB BATCH READ] SELECT * FROM facturas WHERE cliente_id IN ('c-1', 'c-2', 'c-3', 'c-4', 'c-5');
```
- **Total de Consultas:** 2
- **Latencia Acumulada:** ~400 ms

### 5.3 Métricas Comparativas

| Métrica | Solución Ingenua (N+1) | Solución Optimizada (DataLoader) | Mejora Obtenida |
| :--- | :---: | :---: | :---: |
| **Consultas a Base de Datos (5 clientes)** | 6 | 2 | **66.6% menos consultas** |
| **Tiempo de Espera en DB (5 clientes)** | ~1200 ms | ~400 ms | **66.6% más rápido** |
| **Consultas Proyectadas (100 clientes)** | 101 | 2 | **98.0% menos consultas** |
| **Tiempo Proyectado (100 clientes)** | ~20.2 segundos | ~0.4 segundos | **98.0% más rápido** |

---

## 6. Guía Rápida para la Exposición Oral

Al momento de defender o exponer esta práctica ante el docente, se recomienda seguir este orden de argumentación:

1. **Introducción (30 segundos):**
   > *"En esta práctica abordamos la optimización de APIs GraphQL para el caso de estudio LogiTech SaaS, resolviendo el problema de rendimiento N+1 al consultar clientes y sus facturas."*

2. **Demostración del Problema N+1 (1 minuto):**
   > *"Primero mostramos la versión ingenua ejecutando `npm run start:naive`. Aunque el cliente web realiza una sola consulta GraphQL, en la consola del servidor observamos que se disparan 6 consultas a la base de datos: 1 para los clientes y 5 consultas individuales para las facturas. Con una latencia simulada de 200ms, la respuesta tarda 1.2 segundos."*

3. **Demostración de la Solución con DataLoader (1 minuto):**
   > *"Luego ejecutamos la versión optimizada con `npm start`. Aquí aplicamos el patrón DataLoader. Instanciamos el loader por cada petición dentro del `context` de Apollo Server para garantizar aislamiento entre peticiones. El loader recolecta los IDs de los clientes en un único lote y ejecuta una sola consulta agrupada con la cláusula `IN (...)`."*

4. **Conclusión y Métricas Clave (30 segundos):**
   > *"El resultado es que las consultas se reducen de 6 a solo 2, y el tiempo de respuesta baja de 1200ms a 400ms. Si tuviéramos 100 clientes, pasaríamos de 101 consultas y 20 segundos a tan solo 2 consultas y 400ms, logrando una reducción de más del 98% en sobrecarga de base de datos."*

---

## 7. Comandos de Ejecución

1. **Instalación de dependencias (si aún no se ha ejecutado):**
   ```bash
   npm install
   ```

2. **Ejecutar la versión ingenua (para evidenciar el problema N+1):**
   ```bash
   npm run start:naive
   ```

3. **Ejecutar la versión optimizada (solución final con DataLoader):**
   ```bash
   npm start
   ```

4. **Abrir la consola de pruebas:**
   Navegar en el navegador web a `http://localhost:4000/`.
