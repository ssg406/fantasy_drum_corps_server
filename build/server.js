"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_1 = require("socket.io");
// import cors from 'cors';
// import express from 'express';
const http_1 = __importDefault(require("http"));
// Initialize Express server/Http server/Socket.io server
// const app = express();
// app.use(cors());
const server = http_1.default.createServer();
const io = new socket_io_1.Server(server, {
    cors: {
        origin: 'http://localhost:10000',
        methods: ['GET', 'POST'],
    },
});
// Start server
io.listen(3000);
exports.default = io;
