import Fastify from 'fastify';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const fastify = Fastify({ logger: true });

// Permite peticiones CORS
await fastify.register(cors, { 
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

// Conexión a PostgreSQL con SSL y Timeout de seguridad
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000, // No espera más de 5 segundos si falla la conexión
  idleTimeoutMillis: 30000
});

// Ruta principal
fastify.get('/', async (request, reply) => {
  return { mensaje: '¡Servidor corriendo y listo para recibir peticiones! 🚀' };
});

// ==========================================
// 🔑 RUTAS DE AUTENTICACIÓN (REGISTRO Y LOGIN)
// ==========================================

// 1. REGISTRO DE USUARIOS
fastify.post('/registro', async (request, reply) => {
  const { nombre, apellido, contacto, password, rol } = request.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query(
      'INSERT INTO usuarios (nombre, apellido, contacto, password, rol) VALUES (\$1, \$2, \$3, \$4, \$5) RETURNING id, nombre, apellido, contacto, rol',
      [nombre, apellido, contacto, hashedPassword, rol || 'cliente']
    );

    return { mensaje: 'Usuario registrado con éxito', usuario: result.rows[0] };
  } catch (error) {
    console.error('Error en registro:', error);
    if (error.code === '23505') {
      return reply.status(400).send({ error: 'El correo o número de celular ya está registrado' });
    }
    reply.status(500).send({ error: 'Error al registrar el usuario' });
  }
});

// 2. INICIO DE SESIÓN (LOGIN)
fastify.post('/login', async (request, reply) => {
  const { email, contacto, password } = request.body;
  const identifier = email || contacto;

  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE contacto = \$1', [identifier]);
    if (result.rows.length === 0) {
      return reply.status(400).send({ error: 'Correo/Celular o contraseña incorrectos' });
    }

    const usuario = result.rows[0];

    const esValida = await bcrypt.compare(password, usuario.password);
    if (!esValida) {
      return reply.status(400).send({ error: 'Correo/Celular o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, contacto: usuario.contacto, rol: usuario.rol },
      process.env.JWT_SECRET || 'clave_secreta_tasklygo',
      { expiresIn: '8h' }
    );

    return {
      mensaje: 'Inicio de sesión exitoso',
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido, contacto: usuario.contacto, rol: usuario.rol }
    };
  } catch (error) {
    console.error('Error en login:', error);
    reply.status(500).send({ error: 'Error al iniciar sesión' });
  }
});

// ==========================================
// 📋 RUTAS DE PEDIDOS
// ==========================================

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
      'INSERT INTO pedidos (cliente, servicio, distrito, precio) VALUES (\$1, \$2, \$3, \$4) RETURNING *',
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
    await pool.query('DELETE FROM pedidos WHERE id = \$1', [id]);
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
      'UPDATE pedidos SET cliente = \$1, servicio = \$2, distrito = \$3, precio = \$4, fecha_actualizacion = NOW() WHERE id = \$5 RETURNING *',
      [cliente, servicio, distrito, precio, id]
    );
    return result.rows[0];
  } catch (error) {
    console.error('ERROR EXACTO:', error);
    reply.status(500).send({ error: 'Error al actualizar el pedido' });
  }
});

// CAMBIAR ESTADO DE PEDIDO
fastify.put('/pedidos/:id/estado', async (request, reply) => {
  const { id } = request.params;
  const { estado } = request.body;
  try {
    await pool.query(
      'UPDATE pedidos SET estado = \$1, fecha_actualizacion = NOW() WHERE id = \$2',
      [estado, id]
    );
    return { mensaje: 'Estado actualizado correctamente' };
  } catch (error) {
    console.error('Error al cambiar estado:', error);
    reply.status(500).send({ error: 'Error al cambiar estado' });
  }
});

// Iniciar servidor y crear tablas automáticamente
const start = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        cliente VARCHAR(250) NOT NULL,
        servicio VARCHAR(250) NOT NULL,
        distrito VARCHAR(250) NOT NULL,
        precio NUMERIC(10, 2) NOT NULL,
        estado VARCHAR(50) DEFAULT 'Pendiente',
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        apellido VARCHAR(100) NOT NULL,
        contacto VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        rol VARCHAR(50) DEFAULT 'cliente',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const PORT = process.env.PORT || 3000;
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();