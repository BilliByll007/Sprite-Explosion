const WebSocket = require('ws');

// =============================================
// CONFIGURACIÓN DEL SERVIDOR
// =============================================

const HOST = '192.168.211.29';
const PORT = 3000;

const ANCHO = 800;
const ALTO = 600;

const NUM_BOMBAS = 10;
const VELOCIDAD_BOMBAS = 5;
const INTERVALO = 50;

// =============================================
// ESTADO DEL JUEGO
// =============================================

const server = new WebSocket.Server({
    host: HOST,
    port: PORT
});

let siguienteId = 1;
let siguienteBombaId = 1;

const jugadores = {};
const bombas = [];

// =============================================
// FUNCIONES AUXILIARES
// =============================================

function azar(max) {
    return Math.floor(Math.random() * max);
}

function crearBomba(y) {
    return {
        id: siguienteBombaId++,
        x: azar(725),
        y: y,
        size: azar(5) * 10 + 22,
        frameIndex: azar(19)
    };
}

function enviar(cliente, datos) {
    if (cliente.readyState === WebSocket.OPEN) {
        cliente.send(JSON.stringify(datos));
    }
}

function difundir(datos) {
    const mensaje = JSON.stringify(datos);

    server.clients.forEach(cliente => {
        if (cliente.readyState === WebSocket.OPEN) {
            cliente.send(mensaje);
        }
    });
}

// =============================================
// CREAR BOMBAS INICIALES
// =============================================

for (let i = 0; i < NUM_BOMBAS; i++) {
    bombas.push(crearBomba(-100 * i));
}

// =============================================
// INICIO DEL SERVIDOR
// =============================================

server.on('listening', () => {
    console.log(
        `Servidor WebSocket escuchando en ws://${HOST}:${PORT}`
    );

    console.log('Bombas aleatorias sincronizadas activadas.');
});

server.on('error', error => {
    console.error('Error del servidor:', error.message);

    if (error.code === 'EADDRNOTAVAIL') {
        console.error(
            `La IP ${HOST} no está asignada a este equipo. ` +
            'Corrige HOST en server.js.'
        );
    }

    if (error.code === 'EADDRINUSE') {
        console.error(`El puerto ${PORT} ya está en uso.`);
    }
});

// =============================================
// CONEXIÓN DE JUGADORES
// =============================================

server.on('connection', socket => {
    const id = siguienteId++;

    jugadores[id] = {
        id: id,
        x: 0,
        y: 480,
        frameIndex: 0,
        sy: 0
    };

    console.log('Jugador conectado:', id);

    // Enviar el identificador al jugador nuevo.
    enviar(socket, {
        tipo: 'id',
        id: id
    });

    // Enviar el estado actual de todos los jugadores y bombas.
    enviar(socket, {
        tipo: 'estado',
        jugadores: jugadores,
        bombas: bombas
    });

    // Informar a los demás de la llegada del jugador.
    difundir({
        tipo: 'movimiento',
        id: id,
        x: jugadores[id].x,
        y: jugadores[id].y,
        frameIndex: jugadores[id].frameIndex,
        sy: jugadores[id].sy
    });

    // =========================================
    // MENSAJES RECIBIDOS
    // =========================================

    socket.on('message', mensaje => {
        let datos;

        try {
            datos = JSON.parse(mensaje.toString());
        } catch (error) {
            console.error('Mensaje JSON no válido:', error.message);
            return;
        }

        // -----------------------------------------
        // MOVIMIENTO DEL JUGADOR
        // -----------------------------------------

        if (datos.tipo === 'movimiento') {
            const x = Number(datos.x);
            const y = Number(datos.y);

            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y)
            ) {
                return;
            }

            jugadores[id].x = Math.max(
                0,
                Math.min(ANCHO - 71, x)
            );

            jugadores[id].y = Math.max(
                0,
                Math.min(ALTO - 112, y)
            );

            jugadores[id].frameIndex =
                Number.isInteger(datos.frameIndex)
                    ? datos.frameIndex
                    : 0;

            jugadores[id].sy =
                datos.sy === 112 ? 112 : 0;

            // Todos reciben la misma posición.
            difundir({
                tipo: 'movimiento',
                id: id,
                x: jugadores[id].x,
                y: jugadores[id].y,
                frameIndex: jugadores[id].frameIndex,
                sy: jugadores[id].sy
            });
        }
        // -----------------------------------------
        // ELIMINAR / REINICIAR BOMBA TRAS IMPACTO
        // -----------------------------------------

        if (datos.tipo === 'eliminarBomba') {
            const idBomba = datos.idBomba;

            // Buscamos la bomba por su ID
            const bomba = bombas.find(b => b.id === idBomba);

            if (bomba) {
                // Al chocar, la recolocamos arriba para que vuelva a caer
                bomba.y = -azar(250) - bomba.size;
                bomba.x = azar(725);
                bomba.size = azar(5) * 10 + 22;
                bomba.frameIndex = azar(19);

                // Notificamos inmediatamente a todos los clientes del cambio
                difundir({
                    tipo: 'bombas',
                    bombas: bombas
                });
            }
        }

        // No se aceptan mensajes para crear bombas.
        // Las bombas las genera exclusivamente el servidor.
    });

    // =========================================
    // DESCONEXIÓN
    // =========================================

    socket.on('close', () => {
        console.log('Jugador desconectado:', id);

        delete jugadores[id];

        difundir({
            tipo: 'desconexion',
            id: id
        });
    });

    socket.on('error', error => {
        console.error(
            `Error en el socket del jugador ${id}:`,
            error.message
        );
    });
});

// =============================================
// ACTUALIZACIÓN SINCRONIZADA DE LAS BOMBAS
// =============================================

setInterval(() => {
    bombas.forEach(bomba => {
        // Hacer caer la bomba.
        bomba.y += VELOCIDAD_BOMBAS;

        // Actualizar la animación.
        bomba.frameIndex =
            (bomba.frameIndex + 1) % 19;

        // Reiniciar la bomba cuando sale de pantalla.
        if (bomba.y > ALTO) {
            bomba.y = -azar(250) - bomba.size;
            bomba.x = azar(725);
            bomba.size = azar(5) * 10 + 22;
            bomba.frameIndex = azar(19);
        }
    });

    // Enviar el estado compartido a todos los jugadores.
    difundir({
        tipo: 'bombas',
        bombas: bombas
    });

}, INTERVALO);