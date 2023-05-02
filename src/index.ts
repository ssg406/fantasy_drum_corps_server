import { playerRepository, toursRepository } from './data';
import { DraftPlayer } from './models/DraftPlayer';
import { Player } from './models/Player';
import io from './server';
import { SocketEvents } from './socketEvents';
import { allPicks } from './allPicks';

interface ClientIdentification {
  playerId: string;
}

interface ClientPick {
  playerId: string;
  drumCorpsCaptionId: string;
}

const DRAFT_COUNTDOWN_TIME = 10000;

io.on('connection', function (socket) {
  console.log('socket connected to default namespace');
});

async function createNamespaces() {
  const allTours = await toursRepository.find();

  // Set listeners for each tour namespace
  allTours.forEach((tour) => {
    // Create array of draft players
    let draftPlayers: DraftPlayer[] = [];
    let draftCountingDown = false;
    let draftStarted = false;

    // Create variable for namespace for readability
    const tourNamespace = io.of(`/${tour.id}`);

    // Connection event listener
    tourNamespace.on('connection', (socket) => {
      console.log('There was a connection to namespace ', tour.name);

      // Await player identification to add to draftPlayers array
      socket.on(
        SocketEvents.CLIENT_SENDS_IDENTIFICATION,
        async function (data: ClientIdentification) {
          console.log('A client is sending identification ', data.playerId);
          let draftCountdown: NodeJS.Timeout;
          const player = await getPlayer(data.playerId);

          // Check that player exists and disconnect if not found
          if (!player) {
            socket.emit(SocketEvents.SERVER_PLAYER_NOT_FOUND);
            socket.disconnect();
            return;
          } else {
            // Send the joining player updated state information
            socket.emit(SocketEvents.SERVER_SENDS_DRAFT_STATE, {
              draftCountingDown,
              draftStarted,
            });

            // Check if player has already connected
            const existingPlayer = draftPlayers.find(
              (draftPlayer) => draftPlayer.player.id === player.id
            );

            // if a player is found, disconnect the duplicate socket
            if (existingPlayer) {
              console.log('A duplicate player connected, not pushing to list');
            } else {
              // Add player to list of joined members
              draftPlayers.push(new DraftPlayer(player, socket));
              updateJoinedPlayers();
            }
          }

          // If player is tour admin, listen for start tour event from client
          if (tour.owner === player.id) {
            console.log('The tour owner has connected');

            // Client sends draft start event to initiate countdown
            socket.on(SocketEvents.CLIENT_START_DRAFT, function () {
              console.log('The tour owner has started the draft countdown');

              // Set countdown flag to true and emit countdown start event to namespace
              draftCountingDown = true;
              tourNamespace.emit(SocketEvents.SERVER_BEGIN_DRAFT_COUNTDOWN);

              // Start the draft after countdown
              draftCountdown = setTimeout(() => {
                // Set flags and enable in-draft listeners after countdown
                draftStarted = true;
                tourNamespace.emit(SocketEvents.SERVER_DRAFT_TURNS_BEGIN);
                draftCountingDown = false;
                let availablePicks = allPicks;

                let timeout: NodeJS.Timeout;
                let timerInterval: NodeJS.Timer;
                let turn = 0;
                let currentTurn = 0;
                let remainingTime = 45;

                function nextTurn() {
                  console.log('next turn triggered ', turn);
                  turn = currentTurn++ % draftPlayers.length;
                  const turnAfter = (currentTurn + 2) % draftPlayers.length;
                  console.log('turn after is ', turnAfter);
                  tourNamespace.emit(SocketEvents.SERVER_STARTS_TURN, {
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
                    tourNamespace.emit(SocketEvents.SERVER_UPDATE_TURN_TIMER, {
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

                socket.on(
                  SocketEvents.CLIENT_ENDS_TURN,
                  function (data: ClientPick) {
                    availablePicks = availablePicks.filter(
                      (pick) => pick.id !== data.drumCorpsCaptionId
                    );
                    console.log(
                      'Client picked drum corps caption id ',
                      data.drumCorpsCaptionId
                    );
                    resetTimeOut();
                    resetInterval();
                    nextTurn();
                  }
                );

                // Client emits this event to cancel the draft completely.
                // Server resets the list of connected players and disconnects all sockets.
                socket.on(SocketEvents.CLIENT_CANCEL_DRAFT, function () {
                  console.log('The draft is being cancelled');
                  draftPlayers = [];
                  draftStarted = false;
                  resetInterval();
                  resetTimeOut();
                  tourNamespace.emit(SocketEvents.SERVER_SENDS_DRAFT_STATE, {
                    draftCountingDown,
                    draftStarted,
                  });
                  tourNamespace.sockets.forEach((socket) =>
                    socket.disconnect()
                  );
                });

                socket.on('disconnect', () => {
                  console.log(
                    'Additional listener for disconnect. decrementing turn variable'
                  );
                  turn--;
                  if (draftPlayers.length === 0) {
                    clearTimeout(timeout);
                  }
                });
              }, DRAFT_COUNTDOWN_TIME);
            });

            // Client emits this event to cancel the countdown before draft begins
            socket.on(SocketEvents.CLIENT_CANCEL_DRAFT_COUNTDOWN, function () {
              if (draftCountdown) {
                console.log('The draft countdown is being cancelled');
                draftCountingDown = false;
                clearTimeout(draftCountdown);
                tourNamespace.emit(
                  SocketEvents.SERVER_DRAFT_COUNTDOWN_CANCELLED
                );
              }
            });
          }
        }
      );

      socket.on('disconnect', function () {
        console.log('Outer disconnect listener');
        const foundIndex = draftPlayers.findIndex(
          (draftPlayer) => draftPlayer.socket.id === socket.id
        );
        if (foundIndex !== -1) {
          console.log('a player disconnected and is being removed from list');
          draftPlayers.splice(foundIndex, 1);
          updateJoinedPlayers();
        }
      });
    });

    function updateJoinedPlayers() {
      const joinedPlayers = draftPlayers.map(
        (draftPlayer) => draftPlayer.player
      );
      tourNamespace.emit(SocketEvents.SERVER_UPDATE_JOINED_PLAYERS, {
        joinedPlayers,
      });
      console.log('Sent clients updated players list ', joinedPlayers);
    }
  });
}

async function getPlayer(playerId: string): Promise<Player> {
  const player = await playerRepository.findById(playerId);
  return player;
}

createNamespaces();
function startDraft(): void {
  console.log('The draft has started');
}
