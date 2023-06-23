import { Socket } from 'socket.io';
import { allPicks } from './allPicks';
import {
    playerRepository,
    remainingPicksRepository,
    toursRepository,
} from './data';
import { DraftPlayer } from './models/DraftPlayer';
import DrumCorpsCaption from './models/DrumCorpsCaption';
import { RemainingPicks } from './models/RemainingPicks';
import io from './server';
import { SocketEvents } from './socketEvents';
import Tour from './models/Tour';
import { Player } from './models/Player';
import { ClientIdentification } from './types';

//* Constants
const DRAFT_COUNTDOWN_TIME = 100;
const TURN_TIME_SECONDS = 45;

export async function createTourNamespace(tourId: string) {

    const tour: Tour = await toursRepository.findById(tourId);

    if (!tour) {
        throw new Error('Tour not found');
    }

    const tourNamespace = io.of(tour.id);
    let draftCountingDown = false;
    let draftStarted = false;
    let draftCountdown: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;
    let timerInterval: NodeJS.Timer;
    let turn = 0;
    let currentTurn = 0;
    let remainingTime = TURN_TIME_SECONDS;
    let availablePicks: DrumCorpsCaption[] = allPicks;
    let draftPlayers: DraftPlayer[];

    // Initial connection to namespace
    tourNamespace.on('connection', function (socket: Socket) {

        // Identify player
        socket.on(
            SocketEvents.CLIENT_SENDS_IDENTIFICATION,
            async function (data: ClientIdentification) {
                console.info(
                    `Got client ID\nPlayer ID: ${data.playerId} Tour ID: ${data.tourId}`
                );
                const player = await playerRepository.findById(data.playerId);

                // Disconnect if player was not found
                if (!player) {
                    socket.emit(SocketEvents.SERVER_PLAYER_NOT_FOUND);
                    socket.disconnect();
                    return;
                }

                // Check for duplicate player
                const existingPlayer = draftPlayers.find(
                    (draftPlayer) => draftPlayer.player.id === player.id
                );
                if (existingPlayer) {
                    console.warn('A duplicate player connected. Not adding to list');
                    socket.disconnect();
                }
                // Add player to list
                console.info(`Adding player: ${player.displayName}`);
                draftPlayers.push(new DraftPlayer(player, socket));
            }
        );

        // Listen for draft countdown start from tour owner
        socket.on(SocketEvents.CLIENT_START_DRAFT, function () {
            // Set countdown flag and emit start event to room
            draftCountingDown = true;
            tourNamespace.emit(SocketEvents.SERVER_BEGIN_DRAFT_COUNTDOWN);

            // Begin draft after countdown
            draftCountdown = setTimeout(() => {

                // Set draft started flag and counting down flag and emit turns beginning event
                draftStarted = true;
                draftCountingDown = false;
                tourNamespace.emit(SocketEvents.SERVER_DRAFT_TURNS_BEGIN);

                // Draft functions begin

                // Begin turn
                function nextTurn() {
                    turn = currentTurn++ % draftPlayers.length;
                    const turnAfter = (currentTurn + 2) % draftPlayers.length;
                    console.info(
                        `Server starting turn: ${turn}\nRound number: ${currentTurn}\nPicking: ${draftPlayers[turn].player.displayName}`
                    );
                    tourNamespace.emit(SocketEvents.SERVER_STARTS_TURN, {
                        availablePicks,
                        currentPick: draftPlayers[turn].player.id,
                        currentPickName: draftPlayers[turn].player.displayName,
                        nextPickName: draftPlayers[turnAfter].player.displayName,
                        roundNumber: currentTurn,
                    });
                    triggerTimeout();
                } // End nextTurn()

                // Starts the timer for each turn
                function triggerTimeout() {
                    timerInterval = setInterval(() => {
                        tourNamespace.emit(SocketEvents.SERVER_UPDATE_TURN_TIMER, {
                            remainingTime,
                        });
                        remainingTime = remainingTime === 0 ? 0 : remainingTime - 1;
                    }, 1000);
                    timeout = setTimeout(() => {
                        console.log('No pick received');
                        // If turn times out emit a notice to the socket and the client will auto select
                        draftPlayers[turn].socket.emit(SocketEvents.SERVER_NO_PICK_RECEIVED);
                        // Wait for momentarily for auto pick from client
                        setTimeout(() => {
                            resetInterval();
                            nextTurn();
                        }, 1000);
                    }, TURN_TIME_SECONDS * 1000 + 2000);
                } // end triggerTimeout()

                // Clear the turn timer at end of turn or when client ends turn
                function resetTimeout() {
                    if (timeout) {
                        console.info('Turn timer has been reset');
                        clearTimeout(timeout);
                    }
                } // end resetTimeout()

                // Reset the in-turn countdown timer
                function resetInterval() {
                    console.info('Interval timer reset');
                    if (timerInterval) {
                        console.log('Resetting interval timer');
                        remainingTime = TURN_TIME_SECONDS;
                    }
                } // end resetInterval()

                socket.on(SocketEvents.CLIENT_CANCEL_DRAFT, function () {
                    console.log('The draft is being cancelled');
                    draftPlayers = [];
                    draftStarted = false;
                    resetInterval();
                    resetTimeout();
                    tourNamespace.emit(SocketEvents.SERVER_DRAFT_CANCELLED_BY_OWNER);
                    draftPlayers.forEach((player) => player.socket.disconnect());
                });

                // Begin first turn
                nextTurn();

                // Cancel draft listener
                socket.on(SocketEvents.CLIENT_CANCEL_DRAFT, function () {
                    console.log('The draft is being cancelled');
                    draftPlayers = [];
                    draftStarted = false;
                    resetInterval();
                    resetTimeout();
                    io.to(tour.id).emit(SocketEvents.SERVER_DRAFT_CANCELLED_BY_OWNER);
                    draftPlayers.forEach((player) => player.socket.disconnect());
                });
            }, DRAFT_COUNTDOWN_TIME);
        }); // end socket.on client start draft

        // Cancel countdown listener
        socket.on(SocketEvents.CLIENT_CANCEL_DRAFT_COUNTDOWN, function () {
            if (draftCountdown) {
                console.log('The draft countdown is being cancelled');
                draftCountingDown = false;
                clearTimeout(draftCountdown);
                tourNamespace.emit(SocketEvents.SERVER_DRAFT_COUNTDOWN_CANCELLED);
            }
        });

        // Lineup complete


    });
}