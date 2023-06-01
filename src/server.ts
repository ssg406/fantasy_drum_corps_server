import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { createNamespace } from 'index';
// For local development
// import * as dotenv from 'dotenv';

// dotenv.config();

const PORT = parseInt(<string>process.env.PORT) || 3000;

const app = express();

app.use(cors());

app.get('/test', function (req: Request, res: Response, next: NextFunction) {
  res.status(200).send({ msg: 'This is a positive response' });
});

app.post('/addTour', function(req: Request, res: Response, next: NextFunction) {
  const {tourId} = req.body;
  createNamespace(tourId);
  res.status(201);
})

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Start server
server.listen(PORT);

export default io;
