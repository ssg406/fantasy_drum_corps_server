import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import bodyParser from 'body-parser';
import { toursRepository } from 'data';
// For local development
// import * as dotenv from 'dotenv';

// dotenv.config();

const PORT = parseInt(<string>process.env.PORT) || 3000;

const app = express();

app.use(cors());

app.use(bodyParser.json());

// app.post(
//   '/addTour',
//   function (req: Request, res: Response, next: NextFunction) {
//     const { tourId } = req.body;
//     createTourNamespace(tourId);
//     res.status(201);
//   }
// );

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
