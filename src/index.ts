import { Socket } from 'socket.io';
import { allPicks } from './allPicks';
import {
  playerRepository,
  remainingPicksRepository,
  toursRepository,
} from './data';
import { DraftPlayer } from './models/DraftPlayer';
import DrumCorpsCaption from './models/DrumCorpsCaption';
import { Player } from './models/Player';
import { RemainingPicks } from './models/RemainingPicks';
import io from './server';
import { SocketEvents } from './socketEvents';
import Tour from './models/Tour';

interface ClientIdentification {
  playerId: string;
}

interface ClientPick {
  playerId: string;
  drumCorpsCaption: DrumCorpsCaption;
}

interface DrumCorpsCaptionObject {
  id: string;
  corps: string;
  caption: string;
}

//* Constants
const DRAFT_COUNTDOWN_TIME = 100;
const TURN_TIME_SECONDS = 45;

// Namespaces dynamically generated for all alphanumeric IDs beginning with '/'
const tours = io.of(/^\/[A-Za-z0-9]+$/);

tours.on('connection', async function (socket: Socket) {
  // Get the connected namespace and parse tour ID from name
  const tourNamespace = socket.nsp;
  const tourId = tourNamespace.name.split('/')[1];
  // Create draft variables that apply to namespace
  let draftPlayers: DraftPlayer[] = [];
  let draftCountingDown = false;
  let draftStarted = false;
  let draftCountdown: NodeJS.Timeout;

  // Locate the tour in the repository
  const tour = await toursRepository.findById(tourId);

  // If tour does not exist emit an error and return
  if (!tour) {
    console.error(`Could not locate tour with ID ${tourId}`);
    tourNamespace.emit(SocketEvents.SERVER_TOUR_NOT_FOUND);
    socket.disconnect();
    return;
  }

  console.info(`Generated namespace for tour ${tourId}`);

  socket.on(
    SocketEvents.CLIENT_SENDS_IDENTIFICATION,
    async function (data: ClientIdentification) {
      const player = await playerRepository.findById(data.playerId);

      // Check that player exists and disconnect if not found
      if (!player) {
        socket.emit(SocketEvents.SERVER_PLAYER_NOT_FOUND);
        socket.disconnect();
        return;
      }

      // Check for duplicate connection
      const existingPlayer = draftPlayers.find(
        (draftPlayer) => draftPlayer.player.id === player.id
      );
      if (existingPlayer) {
        console.warn('A duplicate player connected. Not adding to list');
        socket.disconnect();
        return;
      }

      // Add player to list of joined players
      draftPlayers.push(new DraftPlayer(player, socket));
      updateJoinedPlayers();

      //* Send current draft state
      socket.emit(SocketEvents.SERVER_SENDS_DRAFT_STATE, {
        draftStarted,
        draftCountingDown,
      }); // End server sends draft state

      // Client sends draft start event and initates countdown
      socket.on(SocketEvents.CLIENT_START_DRAFT, function () {
        console.info(`Tour ${tour.id} has started draft countdown.`);

        // Set countdown flag to true and emit countdown start event to namespace
        draftCountingDown = true;
        tourNamespace.emit(SocketEvents.SERVER_BEGIN_DRAFT_COUNTDOWN);
        let availablePicks = allPicks;

        // Begin draft after initial countdown
        draftCountdown = setTimeout(() => {
          // Set draft started flag and enable in-draft events after countdown
          draftStarted = true;
          tourNamespace.emit(SocketEvents.SERVER_DRAFT_TURNS_BEGIN);
          draftCountingDown = false;

          let timeout: NodeJS.Timeout;
          let timerInterval: NodeJS.Timer;
          let turn = 0;
          let currentTurn = 0;
          let remainingTime = TURN_TIME_SECONDS;

          // Starts the next turn
          function nextTurn() {
            console.log('next turn triggered ', turn);
            turn = currentTurn++ % draftPlayers.length;
            const turnAfter = (currentTurn + 2) % draftPlayers.length;
            tourNamespace.emit(SocketEvents.SERVER_STARTS_TURN, {
              availablePicks,
              currentPick: draftPlayers[turn].player.id,
              currentPickName: draftPlayers[turn].player.displayName,
              nextPickName: draftPlayers[turnAfter].player.displayName,
              roundNumber: currentTurn,
            });
            triggerTimeout();
          } // End of nextTurn()

          // Starts the timer for each turn
          function triggerTimeout() {
            timerInterval = setInterval(() => {
              tourNamespace.emit(SocketEvents.SERVER_UPDATE_TURN_TIMER, {
                remainingTime,
              });
              console.log('Remaining time: ', remainingTime);
              remainingTime = remainingTime === 0 ? 0 : remainingTime - 1;
            }, 1000);
            timeout = setTimeout(() => {
              console.log('No pick received');
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
          } // End of triggerTimeout()

          // Clear the turn timer at turn end or when client ends turn
          function resetTimeOut() {
            if (timeout) {
              console.log('Turn timer has been reset');
              clearTimeout(timeout);
            }
          } // end of resetTimout()

          // Reset the in-turn countdown timer
          function resetInterval() {
            if (timerInterval) {
              console.log('Resetting interval timer');
              clearInterval(timerInterval);
              remainingTime = 45;
            }
          } // End of resetInterval()

          // Begin the first turn
          nextTurn();

          // Client sends automatic pick when player runs out of time
          socket.on(
            SocketEvents.CLIENT_SENDS_AUTO_PICK,
            function (data: ClientPick) {
              console.info(
                `Server received auto pick from client: ${data.drumCorpsCaption}`
              );

              // Remove selection from available picks and emit the selection to the namespace
              availablePicks = availablePicks.filter(
                (pick) =>
                  pick.drumCorpsCaptionId !==
                  data.drumCorpsCaption.drumCorpsCaptionId
              );
              tourNamespace.emit(SocketEvents.SERVER_SENDS_PLAYER_PICK, {
                lastPick: data.drumCorpsCaption,
              });
            }
          ); // End of on client sends auto pick

          socket.on(SocketEvents.CLIENT_ENDS_TURN, function (data: ClientPick) {
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

            // Reset turn timer, interval timer, and advance to next turn
            resetTimeOut();
            resetInterval();
            nextTurn();
          }); // End of on client ends turn

          // Client emits this event to cancel the draft completely.
          // Server resets the list of connected players and disconnects all sockets.
          socket.on(SocketEvents.CLIENT_CANCEL_DRAFT, function () {
            console.log('The draft is being cancelled');
            draftPlayers = [];
            draftStarted = false;
            resetInterval();
            resetTimeOut();
            updateJoinedPlayers();
            tourNamespace.emit(SocketEvents.SERVER_DRAFT_CANCELLED_BY_OWNER);
            tourNamespace.sockets.forEach((socket) => socket.disconnect());
          }); // End of on client cancel d raft

          // Run cleanup when socket disconnects from namespace
          socket.on('disconnect', function () {
            turn--;
            if (draftPlayers.length === 0) {
              clearTimeout(timeout);
              clearInterval(timerInterval);
              draftStarted = false;
            }
          }); // End on disconnect
        }, DRAFT_COUNTDOWN_TIME); // End draft countdown timeout

        // Run when client notifies their lineup is complete
        socket.on(SocketEvents.CLIENT_LINEUP_COMPLETE, function () {
          console.info(
            `Lineup complete for player ${player.displayName}. Disconnecting.`
          );
          disconnectPlayer();
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
          } // End if draftPlayers.lenght === 0
        }); // End on client lineup complete
      }); // End on client start draft

      //* Client emits this event to cancel the countdown before draft begins
      socket.on(SocketEvents.CLIENT_CANCEL_DRAFT_COUNTDOWN, function () {
        if (draftCountdown) {
          console.log('The draft countdown is being cancelled');
          draftCountingDown = false;
          clearTimeout(draftCountdown);
          tourNamespace.emit(SocketEvents.SERVER_DRAFT_COUNTDOWN_CANCELLED);
        }
      }); // End client cancel draft listener
    } // end onClientIdentification
  ); // end onClientIdentification

  // Client disconnect tasks and cleanup
  function disconnectPlayer(): void {
    const foundIndex = draftPlayers.findIndex(
      (draftPlayer) => draftPlayer.socket.id === socket.id
    );
    if (foundIndex !== -1) {
      console.info(
        `Player ${draftPlayers[foundIndex].player.displayName} is disconnecting and being removed from active list.`
      );
      draftPlayers.splice(foundIndex, 1);
      updateJoinedPlayers();
      socket.disconnect();
    }
  } // end disconnectPlayer()

  // Create and send list of joined players to draft lobbies on clients
  function updateJoinedPlayers(): void {
    const joinedPlayers = draftPlayers.map((draftPlayer) => draftPlayer.player);
    tourNamespace.emit(SocketEvents.SERVER_UPDATE_JOINED_PLAYERS, {
      joinedPlayers,
    });
    console.info(`Players updated. ${draftPlayers.length} players connected.`);
  } // end updateJoinedPlayers()
}); // End tour namespace on connect

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
