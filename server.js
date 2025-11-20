// server.js - SISTEMA COMPLETO DE Q&A EN TIEMPO REAL

const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io"); 

const app = express();
const server = http.createServer(app);
const io = new Server(server); 
const PORT = 3000;

// ======================================================================
// *** 1. CONFIGURACIÓN DE LA BASE DE DATOS ***
//
// Tu cadena de conexión de MongoDB Atlas (ya incluye el usuario, contraseña y la DB 'eventoDB'):
const DB_URI = 'mongodb+srv://rgbalpha_db_user:CgFSauZv8OmNWBhM@cluster0.jip7vja.mongodb.net/eventoDB?appName=Cluster0';
// ======================================================================

mongoose.connect(DB_URI)
    .then(() => console.log('✅ Conexión a MongoDB establecida.'))
    .catch(err => console.error('❌ Error de conexión a MongoDB:', err));


// Definición del Modelo de Pregunta (Schema)
const PreguntaSchema = new mongoose.Schema({
    texto_pregunta: { type: String, required: true },
    nombre_usuario: { type: String, default: 'Anónimo' },
    fecha_creacion: { type: Date, default: Date.now },
    estado: { type: String, enum: ['pendiente', 'aprobada', 'archivada'], default: 'pendiente' }, 
    votos: { type: Number, default: 0 }
});

PreguntaSchema.index({ votos: -1, fecha_creacion: -1 });
const Pregunta = mongoose.model('Pregunta', PreguntaSchema);


// Configurar Middleware
app.use(express.json()); // Permite a Express leer JSON en peticiones POST/PUT
app.use(express.static(path.join(__dirname, '/'))); // Sirve los archivos HTML


// --- RUTAS API (Endpoints) ---

// RUTA 1: Obtener preguntas APROBADAS (para la vista pública)
app.get('/api/preguntas/aprobadas', async (req, res) => {
    try {
        const preguntas = await Pregunta.find({ estado: 'aprobada' })
            .sort({ votos: -1, fecha_creacion: -1 });
        res.status(200).json(preguntas);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// RUTA 2: Obtener preguntas PENDIENTES (para el moderador)
app.get('/api/preguntas/pendientes', async (req, res) => {
    try {
        const preguntas = await Pregunta.find({ estado: 'pendiente' })
            .sort({ fecha_creacion: 1 }); // Más viejas primero
        res.status(200).json(preguntas);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// RUTA 3: Recibir una nueva pregunta (POST)
app.post('/api/preguntas', async (req, res) => {
    try {
        const nuevaPregunta = new Pregunta({
            texto_pregunta: req.body.texto_pregunta,
            nombre_usuario: req.body.nombre_usuario || 'Anónimo'
        });

        await nuevaPregunta.save(); // Se guarda como 'pendiente'

        // Notificar al moderador que llegó una nueva pregunta
        io.emit('nueva_pendiente', nuevaPregunta); 
        
        res.status(201).json({ 
            mensaje: 'Pregunta enviada. Esperando aprobación.',
            pregunta: nuevaPregunta 
        });

    } catch (error) {
        res.status(500).json({ error: 'Hubo un error en el servidor.' });
    }
});

// RUTA 4: Actualizar el estado de una pregunta (PUT)
app.put('/api/preguntas/:id/estado', async (req, res) => {
    try {
        const { estado } = req.body;
        const preguntaActualizada = await Pregunta.findByIdAndUpdate(
            req.params.id, 
            { estado: estado }, 
            { new: true }
        );

        if (!preguntaActualizada) {
            return res.status(404).json({ error: 'Pregunta no encontrada.' });
        }

        if (preguntaActualizada.estado === 'aprobada') {
            // Notificar a TODOS (público y moderador) sobre la aprobación
            io.emit('pregunta_aprobada', preguntaActualizada); 
        } else if (preguntaActualizada.estado === 'archivada') {
            // Notificar que debe eliminarse del panel de moderación
            io.emit('pregunta_archivada', preguntaActualizada);
        }

        res.status(200).json(preguntaActualizada);

    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el estado.' });
    }
});


// --- CONFIGURACIÓN DE SOCKET.IO ---

io.on('connection', (socket) => {
    // Lógica para manejar conexiones y desconexiones de clientes
});


// --- INICIO DEL SERVIDOR ---

server.listen(PORT, () => {
    console.log(`🚀 Servidor listo y corriendo en http://localhost:${PORT}`);
    console.log(`Público (Asistentes): http://localhost:${PORT}/index.html`);
    console.log(`Moderación: http://localhost:${PORT}/moderator.html`);
});