import { SocketEvents } from './socketEvents';
import { Player } from './models/Player';
import Tour from './models/Tour';
import { Socket } from 'socket.io';
import DrumCorpsCaption from './models/DrumCorpsCaption';
import { allPicks } from './allPicks';
import io from './server';
import { DraftPlayer } from './models/DraftPlayer';
import { roomsMap } from '.';

//* Constants
const DRAFT_COUNTDOWN_TIME = 100;
const TURN_TIME_SECONDS = 45;

export function tourDraft(
  tour: Tour,
  player: Player,
  tourOwnerSocket: Socket
): void {
  // Initialize variables
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

  // Listen for draft countdown start from tour owner
  tourOwnerSocket.on(SocketEvents.CLIENT_START_DRAFT, function () {
    // Set countdown flag and emit start event to room
    draftCountingDown = true;
    io.to(tour.id).emit(SocketEvents.SERVER_BEGIN_DRAFT_COUNTDOWN);

    // Begin draft after countdown
    draftCountdown = setTimeout(() => {
      // get draft players
      draftPlayers = roomsMap.get(tour.id) || [];

      // Set draft started flag and counting down flag and emit turns beginning event
      draftStarted = true;
      draftCountingDown = false;
      io.to(tour.id).emit(SocketEvents.SERVER_DRAFT_TURNS_BEGIN);

      // Draft functions

      // Begin turn
      function nextTurn() {
        turn = currentTurn++ % draftPlayers.length;
        const turnAfter = (currentTurn + 2) % draftPlayers.length;
        console.info(
          `Server starting turn: ${turn}\nRound number: ${currentTurn}\nPicking: ${draftPlayers[turn].player.displayName}`
        );
        io.to(tour.id).emit(SocketEvents.SERVER_STARTS_TURN, {
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
          io.to(tour.id).emit(SocketEvents.SERVER_UPDATE_TURN_TIMER, {
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

      tourOwnerSocket.on(SocketEvents.CLIENT_CANCEL_DRAFT, function () {
        console.log('The draft is being cancelled');
        draftPlayers = [];
        draftStarted = false;
        resetInterval();
        resetTimeout();
        io.to(tour.id).emit(SocketEvents.SERVER_DRAFT_CANCELLED_BY_OWNER);
        draftPlayers.forEach((player) => player.socket.disconnect());
      });

      // Begin first turn
      nextTurn();
    }, DRAFT_COUNTDOWN_TIME);
  }); // end socket.on client start draft

  tourOwnerSocket.on(SocketEvents.CLIENT_CANCEL_DRAFT_COUNTDOWN, function () {
    if (draftCountdown) {
      console.log('The draft countdown is being cancelled');
      draftCountingDown = false;
      clearTimeout(draftCountdown);
      io.to(tour.id).emit(SocketEvents.SERVER_DRAFT_COUNTDOWN_CANCELLED);
    }
  });
}
