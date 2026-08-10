import Fastify from 'fastify';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from '@fastify/cors';

dotenv.config();

const fastify = Fastify({ logger: true });

// Permite peticiones desde archivos locales (origin 'null') y cualquier servidor local
await fastify.register(cors, { 
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
});

// Conexión a PostgreSQL
// Conexión a PostgreSQL con soporte SSL
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Ruta principal
fastify.get('/', async (request, reply) => {
  return { mensaje: '¡Servidor corriendo y listo para recibir peticiones! 🚀' };
});

// OBTENER todos los pedidos
fastify.get('/pedidos', async (request, reply) => {
  try {
    const result = await pool.query('SELECT * FROM pedidos ORDER BY id ASC');
    return result.rows;
  } catch (error) {
    console.error('ERROR EXACTO:', error);
    reply.status(500).send({ error: 'Error al obtener los pedidos' });
  }
});

// CREAR un nuevo pedido
fastify.post('/pedidos', async (request, reply) => {
  const { cliente, servicio, distrito, precio } = request.body;
  try {
    const result = await pool.query(
      'INSERT INTO pedidos (cliente, servicio, distrito, precio) VALUES ($1, $2, $3, $4) RETURNING *',
      [cliente, servicio, distrito, precio]
    );
    return result.rows[0];
  } catch (error) {
    console.error('ERROR EXACTO:', error);
    reply.status(500).send({ error: 'Error al guardar el pedido' });
  }
});

// ELIMINAR un pedido
fastify.delete('/pedidos/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    await pool.query('DELETE FROM pedidos WHERE id = $1', [id]);
    return { mensaje: 'Pedido eliminado correctamente' };
  } catch (error) {
    console.error('ERROR EXACTO:', error);
    reply.status(500).send({ error: 'Error al eliminar el pedido' });
  }
});

// ACTUALIZAR un pedido
fastify.put('/pedidos/:id', async (request, reply) => {
  const { id } = request.params;
  const { cliente, servicio, distrito, precio } = request.body;
  try {
    const result = await pool.query(
      'UPDATE pedidos SET cliente = $1, servicio = $2, distrito = $3, precio = $4, fecha_actualizacion = NOW() WHERE id = $5 RETURNING *',
      [cliente, servicio, distrito, precio, id]
    );
    return result.rows[0];
  } catch (error) {
    console.error('ERROR EXACTO:', error);
    reply.status(500).send({ error: 'Error al actualizar el pedido' });
  }
});

// RUTA RÁPIDA PARA CAMBIAR SOLO EL ESTADO
fastify.put('/pedidos/:id/estado', async (request, reply) => {
  const { id } = request.params;
  const { estado } = request.body;
  try {
    await pool.query(
      'UPDATE pedidos SET estado = $1, fecha_actualizacion = NOW() WHERE id = $2',
      [estado, id]
    );
    return { mensaje: 'Estado actualizado correctamente' };
  } catch (error) {
    console.error('Error al cambiar estado:', error);
    reply.status(500).send({ error: 'Error al cambiar estado' });
  }
});

// Iniciar servidor
const start = async () => {
  try {
    const PORT = process.env.PORT || 3000;
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();