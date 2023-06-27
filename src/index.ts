import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import bodyParser from 'body-parser';
import { toursRepository } from './data';
// For local development
import * as dotenv from 'dotenv';
dotenv.config();
// End for local development
import { createTourNamespace } from './createNamespace';
import { handleShutdown } from './handleShutdown';

const PORT = parseInt(<string>process.env.PORT) || 3000;

const app = express();

app.use(cors());

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.patch(
  '/createNamespace',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tourId } = req.body;
      console.log(req.body);
      console.info(
        `Received request to create namespace for tour ID ${tourId}`
      );
      if (!tourId) {
        throw new Error('Invalid tour ID');
      }
      createTourNamespace(tourId);
      res.status(200).send({ message: 'Tour namespace created' });
    } catch (error) {
      res.status(400).send({ message: 'Error creating namespace' });
    }
  }
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Handle SIGTERM / SIGINT / and uncaught exceptions
process
  .on('SIGTERM', () => handleShutdown(io, 'SIGTERM'))
  .on('SIGINT', () => handleShutdown(io, 'SIGINT'))
  .on('uncaughtException', () => handleShutdown(io, 'uncaughtException'));

// Start server
server.listen(PORT, () => {
  console.info(`Server listening on port ${PORT}`);
});

export default io;
