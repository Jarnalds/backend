// backend/kahoot-backend/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    // Permite conexiones desde cualquier origen para desarrollo.
    // En producción, deberías restringir esto a tu dominio de frontend.
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

let gameStarted = false;
let players = {}; // { socketId: { name: "...", role: "...", score: 0 } }
let adminSocketId = null;
let currentQuestionIndex = 0;

// Preguntas por rol
const questionsByRole = {
    'programador': [
        { id: 1, question: "¿Qué significa DRY?", options: ["Do Repeat Yourself", "Don't Repeat Yourself", "Directly Read Your code"], answer: "Don't Repeat Yourself" },
        { id: 2, question: "¿Qué lenguaje es Python principalmente?", options: ["Compilado", "Interpretado", "Transpilado"], answer: "Interpretado" },
        { id: 3, question: "¿Qué es un commit en Git?", options: ["Un cambio guardado", "Un error", "Una nueva rama"], answer: "Un cambio guardado" }
    ],
    'diseñador': [
        { id: 4, question: "¿Qué es la tipografía?", options: ["Estudio de colores", "Arte de diseñar letras", "Diseño de logotipos"], answer: "Arte de diseñar letras" },
        { id: 5, question: "¿Qué es UI/UX?", options: ["Interfaz de Usuario/Experiencia de Usuario", "Usabilidad Increíble/Diseño Extremo", "Unidad de Información/Experiencia Unificada"], answer: "Interfaz de Usuario/Experiencia de Usuario" },
        { id: 6, question: "¿Qué color se asocia a menudo con la pasión?", options: ["Azul", "Rojo", "Verde"], answer: "Rojo" }
    ],
    'comunicador': [
        { id: 7, question: "¿Qué es el storytelling?", options: ["Contar cuentos", "Analizar datos", "Diseñar gráficos"], answer: "Contar cuentos" },
        { id: 8, question: "¿Qué es un público objetivo?", options: ["Grupo de amigos", "Personas a las que va dirigido un mensaje", "Equipo de marketing"], answer: "Personas a las que va dirigido un mensaje" },
        { id: 9, question: "¿Cuál es el propósito principal de un titular en una noticia?", options: ["Ser largo y detallado", "Captar la atención y resumir el contenido", "Incluir muchas palabras clave"], answer: "Captar la atención y resumir el contenido" }
    ]
    // ¡Añade más roles y preguntas como necesites!
};

// Rutas estáticas para el frontend si decides servirlos desde el mismo servidor
// (aunque para GitHub Pages, esto es opcional y no se usará)
// app.use(express.static('ruta/a/kahoot-frontend')); // Descomenta y ajusta si sirves el frontend aquí

io.on('connection', (socket) => {
    console.log('Nuevo usuario conectado:', socket.id);

    socket.on('joinGame', ({ name, role, isAdmin }) => {
        if (isAdmin) {
            if (adminSocketId) {
                socket.emit('error', 'Ya hay un administrador conectado. Solo se permite uno.');
                return;
            }
            adminSocketId = socket.id;
            socket.emit('adminConnected');
            console.log(`Admin ${name} conectado: ${socket.id}`);
            // Enviar la lista actual de jugadores al admin recién conectado
            io.to(adminSocketId).emit('currentPlayers', Object.values(players));
        } else {
            if (players[socket.id]) { // Evitar doble registro si el jugador recarga la página
                socket.emit('error', 'Ya estás conectado al juego.');
                return;
            }
            players[socket.id] = { name, role, score: 0 };
            console.log(`Jugador ${name} (${role}) conectado: ${socket.id}`);
            io.emit('playerJoined', { id: socket.id, name, role }); // Notificar a todos sobre nuevo jugador
            if (gameStarted) {
                socket.emit('gameAlreadyStarted');
                io.to(socket.id).emit('waitingForNextQuestion'); // Informa al jugador que espere la siguiente
            }
        }
    });

    socket.on('startGame', () => {
        if (socket.id === adminSocketId && !gameStarted) {
            if (Object.keys(players).length === 0) {
                io.to(adminSocketId).emit('error', 'No hay jugadores conectados para iniciar el juego.');
                return;
            }
            gameStarted = true;
            currentQuestionIndex = 0; // Resetear índice al iniciar nuevo juego
            io.emit('gameStarted');
            console.log('Juego iniciado por el admin.');
            sendQuestionToPlayers();
        } else if (socket.id !== adminSocketId) {
            socket.emit('error', 'Solo el administrador puede iniciar el juego.');
        } else {
            socket.emit('error', 'El juego ya ha comenzado.');
        }
    });

    socket.on('requestNextQuestion', () => {
        if (socket.id === adminSocketId && gameStarted) {
            currentQuestionIndex++; // Avanzar al siguiente índice de pregunta
            sendQuestionToPlayers();
        }
    });

    socket.on('submitAnswer', ({ questionId, selectedOption }) => {
        const player = players[socket.id];
        if (!player || !gameStarted) return; // Ignorar si el jugador no está registrado o el juego no ha comenzado

        const roleQuestions = questionsByRole[player.role];
        if (!roleQuestions) return;

        const question = roleQuestions.find(q => q.id === questionId);
        if (!question) return;

        if (selectedOption === question.answer) {
            player.score++;
            socket.emit('answerResult', { correct: true, score: player.score });
            console.log(`${player.name} (${player.role}) respondió correctamente. Puntuación: ${player.score}`);
        } else {
            socket.emit('answerResult', { correct: false, correctOption: question.answer });
            console.log(`${player.name} (${player.role}) respondió incorrectamente.`);
        }
        // Deshabilitar respuestas para la pregunta actual si es un juego de una sola respuesta
        // En Kahoot real, las respuestas se recogen y se procesan al final del timer.
        // Aquí, simplemente evitamos que respondan dos veces a la misma pregunta
        io.to(socket.id).emit('disableOptions');
    });

    socket.on('disconnect', () => {
        console.log('Usuario desconectado:', socket.id);
        if (socket.id === adminSocketId) {
            adminSocketId = null;
            gameStarted = false; // Resetear juego si el admin se desconecta
            players = {}; // Limpiar lista de jugadores
            currentQuestionIndex = 0; // Resetear índice de pregunta
            io.emit('adminDisconnected');
            console.log('Administrador desconectado. Juego reseteado y jugadores desconectados.');
        } else if (players[socket.id]) {
            const disconnectedPlayer = players[socket.id];
            delete players[socket.id];
            io.emit('playerLeft', { id: socket.id, name: disconnectedPlayer.name });
            console.log(`Jugador ${disconnectedPlayer.name} ha dejado el juego.`);
        }
    });

    function sendQuestionToPlayers() {
        const activePlayers = Object.values(players);
        if (activePlayers.length === 0) {
            io.to(adminSocketId).emit('noPlayersForNextQuestion', 'No hay jugadores activos para enviar la siguiente pregunta.');
            console.log("No hay jugadores para enviar preguntas.");
            return;
        }

        let questionsSentCount = 0;
        let playersFinishedCount = 0;

        activePlayers.forEach(player => {
            const playerRoleQuestions = questionsByRole[player.role];

            if (playerRoleQuestions && currentQuestionIndex < playerRoleQuestions.length) {
                const questionToSend = { ...playerRoleQuestions[currentQuestionIndex] };
                delete questionToSend.answer; // ¡Importante! No enviar la respuesta al cliente
                io.to(player.socketId || Object.keys(players).find(key => players[key] === player)).emit('newQuestion', questionToSend);
                questionsSentCount++;
            } else {
                io.to(player.socketId || Object.keys(players).find(key => players[key] === player)).emit('gameFinishedForPlayer', { finalScore: player.score });
                playersFinishedCount++;
            }
        });

        if (questionsSentCount === 0 && playersFinishedCount > 0) {
            // Si no se enviaron preguntas nuevas y todos los jugadores ya terminaron sus preguntas
            io.to(adminSocketId).emit('allQuestionsSent');
            console.log('Todas las preguntas disponibles han sido enviadas o los jugadores han terminado.');
            gameStarted = false; // Finalizar el juego en el servidor
        } else if (currentQuestionIndex >= Object.values(questionsByRole)[0].length) {
            // Este es un caso simplificado, asume que todos los roles tienen la misma cantidad de preguntas
            // En un caso real, necesitarías lógica más compleja para determinar cuándo se acabó para todos
             io.to(adminSocketId).emit('allQuestionsSent');
             console.log('Todas las preguntas para la ronda actual enviadas.');
             gameStarted = false; // Considera si el juego termina aquí o si el admin puede reiniciar
        }
    }
});

server.listen(PORT, () => {
    console.log(`Servidor de Kahoot escuchando en http://localhost:${PORT}`);
});