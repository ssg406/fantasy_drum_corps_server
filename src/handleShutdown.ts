import { Server } from 'socket.io';
import { SocketEvents } from 'socketEvents';

export function handleShutdown(io: Server, signal: String) {
  console.error(`[DRAFT SERVER] Received signal ${signal}. Shutting down`);
  io.emit(SocketEvents.SERVER_FATAL_ERROR);
  io.sockets.sockets.forEach((socketk) => socketk.disconnect());
}
