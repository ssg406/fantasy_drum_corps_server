import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
// For local development
// import * as dotenv from 'dotenv';

// dotenv.config();

const PORT = parseInt(<string>process.env.PORT) || 3000;

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:1000',
    methods: ['GET', 'POST'],
  },
});

// Start server
server.listen(PORT);

export default io;
