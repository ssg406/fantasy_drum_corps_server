import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
// For local development
// import * as dotenv from 'dotenv';

// dotenv.config();

const PORT = parseInt(<string>process.env.PORT) || 3000;

const app = express();

app.use(cors());

app.get('/test', function (req: Request, res: Response, next: NextFunction) {
  res.status(200).send({ msg: 'This is a positive response' });
});

const server = http.createServer(app);
const io = new Server(server);

// Start server
server.listen(PORT);

export default io;
