// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

// 1. CONFIGURACIÓN
// Usa la Variable de Entorno MONGO_URI configurada en Render
const DB_URI = process.env.MONGO_URI; 
const PORT = process.env.PORT || 3000; 

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 2. CONEXIÓN A MONGODB
mongoose.connect(DB_URI)
    .then(() => console.log('✅ Conexión a MongoDB establecida.'))
    .catch(err => console.error('❌ Error de conexión a MongoDB:', err));

// Esquema para preguntas
const questionSchema = new mongoose.Schema({
    content: String,
    status: { type: String, default: 'pending' }, // 'pending' (pendiente) o 'approved' (aprobada)
    timestamp: { type: Date, default: Date.now }
});

const Question = mongoose.model('Question', questionSchema);

// 3. CONFIGURACIÓN DE RUTAS ESTÁTICAS (AJUSTE CLAVE PARA RENDER)
// Sirve archivos estáticos (index.html, moderator.html) desde el directorio raíz
app.use(express.static(__dirname)); 

// Middleware para JSON y URL-encoded (necesario para Express)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// 4. LÓGICA DE SOCKET.IO Y EVENTOS EN TIEMPO REAL
io.on('connection', (socket) => {
    console.log('Un usuario se ha conectado al socket.');

    // Cargar preguntas al conectar
    const loadQuestions = async () => {
        try {
            // Cargar solo las preguntas aprobadas para la vista pública
            const approvedQuestions = await Question.find({ status: 'approved' }).sort({ timestamp: 1 });
            socket.emit('approved questions', approvedQuestions);

            // Cargar todas las preguntas para la vista de moderación
            const allQuestions = await Question.find().sort({ timestamp: 1 });
            socket.emit('all questions', allQuestions);
        } catch (error) {
            console.error('Error al cargar preguntas:', error);
        }
    };

    loadQuestions();

    // Evento: Nueva pregunta del público
    socket.on('new question', async (questionContent) => {
        try {
            const newQuestion = new Question({ content: questionContent, status: 'pending' });
            await newQuestion.save();
            
            // Notificar a todos los clientes (moderadores) que hay una nueva pregunta pendiente
            io.emit('question added', newQuestion); 
        } catch (error) {
            console.error('Error al guardar la pregunta:', error);
        }
    });

    // Evento: Aprobar pregunta (solo desde moderator.html)
    socket.on('approve question', async (questionId) => {
        try {
            const updatedQuestion = await Question.findByIdAndUpdate(
                questionId, 
                { status: 'approved' }, 
                { new: true }
            );

            if (updatedQuestion) {
                // Notificar a los moderadores para actualizar su lista (eliminar de pendientes)
                io.emit('question updated', updatedQuestion);

                // Notificar a la vista pública (index.html) para mostrar la nueva pregunta
                io.emit('question approved', updatedQuestion); 
            }
        } catch (error) {
            console.error('Error al aprobar pregunta:', error);
        }
    });

    // Evento: Eliminar pregunta (solo desde moderator.html)
    socket.on('delete question', async (questionId) => {
        try {
            await Question.findByIdAndDelete(questionId);
            
            // Notificar a todos los clientes para eliminar la pregunta de sus vistas
            io.emit('question deleted', questionId); 
        } catch (error) {
            console.error('Error al eliminar pregunta:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('Usuario desconectado.');
    });
});

// 5. INICIO DEL SERVIDOR
server.listen(PORT, () => {
    console.log(`🚀 Servidor listo y corriendo en http://localhost:${PORT}`);
    console.log(`Público (Asistentes): https://app-preguntas.onrender.com/index.html`);
    console.log(`Moderación: htt ps://app-preguntas.onrender.com/moderator.html`);
}); 