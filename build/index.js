"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const data_1 = require("./data");
const DraftPlayer_1 = require("./models/DraftPlayer");
const server_1 = __importDefault(require("./server"));
const dotenv = __importStar(require("dotenv"));
const socketEvents_1 = require("./socketEvents");
const allPicks_1 = require("./allPicks");
const DRAFT_COUNTDOWN_TIME = 10000;
dotenv.config();
console.log(process.env);
server_1.default.on('connection', function (socket) {
    console.log('socket connected to default namespace');
});
function createNamespaces() {
    return __awaiter(this, void 0, void 0, function* () {
        const allTours = yield data_1.toursRepository.find();
        // Set listeners for each tour namespace
        allTours.forEach((tour) => {
            // Create array of draft players
            let draftPlayers = [];
            let draftCountingDown = false;
            let draftStarted = false;
            // Create variable for namespace for readability
            const tourNamespace = server_1.default.of(`/${tour.id}`);
            // Connection event listener
            tourNamespace.on('connection', (socket) => {
                console.log('There was a connection to namespace ', tour.name);
                // Await player identification to add to draftPlayers array
                socket.on(socketEvents_1.SocketEvents.CLIENT_SENDS_IDENTIFICATION, function (data) {
                    return __awaiter(this, void 0, void 0, function* () {
                        console.log('A client is sending identification ', data.playerId);
                        let draftCountdown;
                        const player = yield getPlayer(data.playerId);
                        // Check that player exists and disconnect if not found
                        if (!player) {
                            socket.emit(socketEvents_1.SocketEvents.SERVER_PLAYER_NOT_FOUND);
                            socket.disconnect();
                            return;
                        }
                        else {
                            // Send the joining player updated state information
                            socket.emit(socketEvents_1.SocketEvents.SERVER_SENDS_DRAFT_STATE, {
                                draftCountingDown,
                                draftStarted,
                            });
                            // Check if player has already connected
                            const existingPlayer = draftPlayers.find((draftPlayer) => draftPlayer.player.id === player.id);
                            // if a player is found, disconnect the duplicate socket
                            if (existingPlayer) {
                                console.log('A duplicate player connected, not pushing to list');
                            }
                            else {
                                // Add player to list of joined members
                                draftPlayers.push(new DraftPlayer_1.DraftPlayer(player, socket));
                                updateJoinedPlayers();
                            }
                        }
                        // If player is tour admin, listen for start tour event from client
                        if (tour.owner === player.id) {
                            console.log('The tour owner has connected');
                            // Client sends draft start event to initiate countdown
                            socket.on(socketEvents_1.SocketEvents.CLIENT_START_DRAFT, function () {
                                console.log('The tour owner has started the draft countdown');
                                // Set countdown flag to true and emit countdown start event to namespace
                                draftCountingDown = true;
                                tourNamespace.emit(socketEvents_1.SocketEvents.SERVER_BEGIN_DRAFT_COUNTDOWN);
                                // Start the draft after countdown
                                draftCountdown = setTimeout(() => {
                                    // Set flags and enable in-draft listeners after countdown
                                    draftStarted = true;
                                    tourNamespace.emit(socketEvents_1.SocketEvents.SERVER_DRAFT_TURNS_BEGIN);
                                    draftCountingDown = false;
                                    let availablePicks = allPicks_1.allPicks;
                                    let timeout;
                                    let timerInterval;
                                    let turn = 0;
                                    let currentTurn = 0;
                                    let remainingTime = 45;
                                    function nextTurn() {
                                        console.log('next turn triggered ', turn);
                                        turn = currentTurn++ % draftPlayers.length;
                                        const turnAfter = (currentTurn + 2) % draftPlayers.length;
                                        console.log('turn after is ', turnAfter);
                                        tourNamespace.emit(socketEvents_1.SocketEvents.SERVER_STARTS_TURN, {
                                            availablePicks,
                                            currentPick: draftPlayers[turn].player.id,
                                            currentPickName: draftPlayers[turn].player.displayName,
                                            nextPickName: draftPlayers[turnAfter].player.displayName,
                                        });
                                        triggerTimeout();
                                    }
                                    // Start the turn timer
                                    function triggerTimeout() {
                                        timerInterval = setInterval(() => {
                                            tourNamespace.emit(socketEvents_1.SocketEvents.SERVER_UPDATE_TURN_TIMER, {
                                                remainingTime,
                                            });
                                            remainingTime = remainingTime === 0 ? 0 : remainingTime - 1;
                                        }, 1000);
                                        timeout = setTimeout(() => {
                                            resetInterval();
                                            nextTurn();
                                        }, 45 * 1000);
                                    }
                                    // Clear the turn timer
                                    function resetTimeOut() {
                                        if (timeout) {
                                            console.log('Turn timer has been reset');
                                            clearTimeout(timeout);
                                        }
                                    }
                                    // Reset the interval
                                    function resetInterval() {
                                        if (timerInterval) {
                                            console.log('Resetting interval timer');
                                            clearInterval(timerInterval);
                                            remainingTime = 45;
                                        }
                                    }
                                    // Start the first turn
                                    nextTurn();
                                    socket.on(socketEvents_1.SocketEvents.CLIENT_ENDS_TURN, function (data) {
                                        availablePicks = availablePicks.filter((pick) => pick.id !== data.drumCorpsCaptionId);
                                        console.log('Client picked drum corps caption id ', data.drumCorpsCaptionId);
                                        resetTimeOut();
                                        resetInterval();
                                        nextTurn();
                                    });
                                    // Client emits this event to cancel the draft completely.
                                    // Server resets the list of connected players and disconnects all sockets.
                                    socket.on(socketEvents_1.SocketEvents.CLIENT_CANCEL_DRAFT, function () {
                                        console.log('The draft is being cancelled');
                                        draftPlayers = [];
                                        draftStarted = false;
                                        resetInterval();
                                        resetTimeOut();
                                        tourNamespace.emit(socketEvents_1.SocketEvents.SERVER_SENDS_DRAFT_STATE, {
                                            draftCountingDown,
                                            draftStarted,
                                        });
                                        tourNamespace.sockets.forEach((socket) => socket.disconnect());
                                    });
                                    socket.on('disconnect', () => {
                                        console.log('Additional listener for disconnect. decrementing turn variable');
                                        turn--;
                                        if (draftPlayers.length === 0) {
                                            clearTimeout(timeout);
                                        }
                                    });
                                }, DRAFT_COUNTDOWN_TIME);
                            });
                            // Client emits this event to cancel the countdown before draft begins
                            socket.on(socketEvents_1.SocketEvents.CLIENT_CANCEL_DRAFT_COUNTDOWN, function () {
                                if (draftCountdown) {
                                    console.log('The draft countdown is being cancelled');
                                    draftCountingDown = false;
                                    clearTimeout(draftCountdown);
                                    tourNamespace.emit(socketEvents_1.SocketEvents.SERVER_DRAFT_COUNTDOWN_CANCELLED);
                                }
                            });
                        }
                    });
                });
                socket.on('disconnect', function () {
                    console.log('Outer disconnect listener');
                    const foundIndex = draftPlayers.findIndex((draftPlayer) => draftPlayer.socket.id === socket.id);
                    if (foundIndex !== -1) {
                        console.log('a player disconnected and is being removed from list');
                        draftPlayers.splice(foundIndex, 1);
                        updateJoinedPlayers();
                    }
                });
            });
            function updateJoinedPlayers() {
                const joinedPlayers = draftPlayers.map((draftPlayer) => draftPlayer.player);
                tourNamespace.emit(socketEvents_1.SocketEvents.SERVER_UPDATE_JOINED_PLAYERS, {
                    joinedPlayers,
                });
                console.log('Sent clients updated players list ', joinedPlayers);
            }
        });
    });
}
function getPlayer(playerId) {
    return __awaiter(this, void 0, void 0, function* () {
        const player = yield data_1.playerRepository.findById(playerId);
        return player;
    });
}
createNamespaces();
function startDraft() {
    console.log('The draft has started');
}
