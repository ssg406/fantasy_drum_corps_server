import { Server } from 'socket.io';
import http from 'http';
// For local development
import * as dotenv from 'dotenv';
dotenv.config();

const PORT = parseInt(<string>process.env.PORT) || 3000;

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:10000',
    methods: ['GET', 'POST'],
  },
});

// Start server
io.listen(PORT);

export default io;
