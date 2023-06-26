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
import io from './index';
import { SocketEvents } from './socketEvents';
import Tour from './models/Tour';
import { Player } from './models/Player';
import {
  ClientIdentification,
  ClientPick,
  DrumCorpsCaptionObject,
} from './types';

//* Constants
const DRAFT_COUNTDOWN_TIME = 5000;
const TURN_TIME_SECONDS = 45;

export async function createTourNamespace(tourId: string) {
  const tour: Tour = await toursRepository.findById(tourId);

  if (!tour) {
    throw new Error('Tour not found');
  }

  const tourNamespace = io.of(`/${tourId}`);
  let draftCountingDown = false;
  let draftStarted = false;
  let draftCountdown: NodeJS.Timeout;
  let timeout: NodeJS.Timeout;
  let timerInterval: NodeJS.Timer;
  let turn = 0;
  let currentTurn = 0;
  let remainingTime = TURN_TIME_SECONDS;
  let availablePicks: DrumCorpsCaption[] = allPicks;
  let draftPlayers: DraftPlayer[] = [];
  let player: Player;

  // Initial connection to namespace
  tourNamespace.on('connection', function (socket: Socket) {
    console.info(`Connection made to namespace ${tourNamespace.name}`);
    // Identify player
    socket.on(
      SocketEvents.CLIENT_SENDS_IDENTIFICATION,
      async function (data: ClientIdentification) {
        console.info(`Got client ID\nPlayer ID: ${data.playerId}`);
        player = await playerRepository.findById(data.playerId);

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
        updateJoinedPlayers();
        tourNamespace.emit(SocketEvents.SERVER_SENDS_DRAFT_STATE, {
          draftStarted,
          draftCountingDown,
        });
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
            console.log(
              `No pick received from player ${draftPlayers[turn].player.displayName}`
            );
            // If turn times out emit a notice to the socket and the client will auto select
            draftPlayers[turn].socket.emit(
              SocketEvents.SERVER_NO_PICK_RECEIVED
            );
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
          tourNamespace.sockets.forEach((socket) => socket.disconnect());
        });

        // Begin first turn
        nextTurn();

        // Client sends automatic pick when player runs out of time
        draftPlayers[turn].socket.on(
          SocketEvents.CLIENT_SENDS_AUTO_PICK,
          function (data: ClientPick) {
            console.info(
              `Server received auto pick from client: ${data.drumCorpsCaption}`
            );
            onPickReceived(data);
          }
        );

        draftPlayers[turn].socket.on(
          SocketEvents.CLIENT_ENDS_TURN,
          function (data: ClientPick) {
            console.info(
              `Server received pick from client: ${data.drumCorpsCaption}`
            );
            onPickReceived(data);
            resetTimeout();
            resetInterval();
            nextTurn();
          }
        );

        function onPickReceived(data: ClientPick) {
          // Remove selection from available picks and emit pick
          availablePicks = availablePicks.filter(
            (pick) =>
              pick.drumCorpsCaptionId !==
              data.drumCorpsCaption.drumCorpsCaptionId
          );
          console.info(
            `Client sent pick during turn: ${data.drumCorpsCaption}`
          );
          tourNamespace.emit(SocketEvents.SERVER_SENDS_PLAYER_PICK, {
            lastPick: data.drumCorpsCaption,
          });
        }

        socket.on('disconnect', () => {
          turn = turn === 0 ? 0 : turn - 1;
          if (draftPlayers.length === 0) {
            clearTimeout(timeout);
            clearInterval(timerInterval);
            draftStarted = false;
          }
        });
      }, DRAFT_COUNTDOWN_TIME); // end draft timeout
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

    socket.on(SocketEvents.CLIENT_LINEUP_COMPLETE, function () {
      socket.disconnect();
      onLineupComplete();
    });

    socket.on('disconnect', function () {
      const foundIndex = draftPlayers.findIndex(
        (draftPlayer) => draftPlayer.socket.id === socket.id
      );
      if (foundIndex !== -1) {
        console.info(
          `Player ${draftPlayers[foundIndex].player.displayName} is disconnecting and being removed from active list.`
        );
        draftPlayers.splice(foundIndex, 1);
        updateJoinedPlayers();
      }
    });
  });

  // Create and send list of joined players to draft lobbies on clients
  function updateJoinedPlayers(): void {
    const joinedPlayers = draftPlayers.map((draftPlayer) => draftPlayer.player);
    tourNamespace.emit(SocketEvents.SERVER_UPDATE_JOINED_PLAYERS, {
      joinedPlayers,
    });
    console.info(`Players updated. ${draftPlayers.length} players connected.`);
  }

  //* Save the remaining picks to the server to use for additonal lineups
  async function saveRemainingPicks(
    remainingPicks: RemainingPicks
  ): Promise<void> {
    await remainingPicksRepository.create(remainingPicks);
  }

  //* Marks the tour object as complete and updates the database
  async function markTourComplete(tour: Tour): Promise<void> {
    tour.draftComplete = true;
    await toursRepository.update(tour);
  }

  function concludeDraft(): void {
    console.info(`The draft is over.`);
    draftPlayers = [];
    draftStarted = false;
    if (timeout) clearTimeout(timeout);
    updateJoinedPlayers();
    tourNamespace.sockets.forEach((socket) => socket.disconnect());
  }

  function onLineupComplete(): void {
    console.info(
      `Lineup complete for player ${player.displayName}. Disconnecting.`
    );
    // Check if this is the last player to complete a lineup
    if (draftPlayers.length == 0) {
      // Write the left over picks to the server

      let leftOverPicks: DrumCorpsCaptionObject[] = [];
      availablePicks.forEach((pick) => {
        leftOverPicks.push({
          id: pick.drumCorpsCaptionId,
          corps: pick.corps.toString(),
          caption: pick.caption.toString(),
        });
      });
      const remainingPicks = new RemainingPicks();
      remainingPicks.tourId = tour.id;
      remainingPicks.leftOverPicks = leftOverPicks;
      saveRemainingPicks(remainingPicks);
      markTourComplete(tour);
      concludeDraft();
    }
  }

  console.info(`Namespace created for tour ID ${tourId}`);
}
