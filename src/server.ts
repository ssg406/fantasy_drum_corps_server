import { Server } from 'socket.io';
import http from 'http';

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:10000',
    methods: ['GET', 'POST'],
  },
});

// Start server
io.listen(process.env.PORT);

export default io;
