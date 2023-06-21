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
import { Player } from 'models/Player';

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

let draftPlayers: DraftPlayer[] = [];
let draftCountingDown = false;
let draftStarted = false;
let draftCountdown: NodeJS.Timeout;
let timeout: NodeJS.Timeout;
let timerInterval: NodeJS.Timer;
let turn = 0;
let currentTurn = 0;
let remainingTime = TURN_TIME_SECONDS;
let tour: Tour;
let player: Player;
let availablePicks: DrumCorpsCaption[];

tours.on('connection', async function (socket: Socket) {
  console.info(`Incoming connection to namespace ${socket.nsp.name}`);

  // Run cleanup when socket disconnects from namespaced
  socket.on('disconnect', onSocketDisconnect);

  // Server receives player ID from client to join draft
  socket.on(
    SocketEvents.CLIENT_SENDS_IDENTIFICATION,
    async function (data: ClientIdentification) {
      onIdentifyPlayer(data, socket);

      //* Send current draft state
      tours.emit(SocketEvents.SERVER_SENDS_DRAFT_STATE, {
        draftStarted,
        draftCountingDown,
      });
    }
  );

  //* Client emits this event to cancel the countdown before draft begins
  socket.on(
    SocketEvents.CLIENT_CANCEL_DRAFT_COUNTDOWN,
    onClientCancelDraftCountdown
  );

  // Client sends automatic pick when player runs out of time
  socket.on(SocketEvents.CLIENT_SENDS_AUTO_PICK, function (data: ClientPick) {
    console.info(
      `Server received auto pick from client: ${data.drumCorpsCaption}`
    );
    onPickReceived(data);
  });

  // Client sends draft start event and initates countdown
  socket.on(SocketEvents.CLIENT_START_DRAFT, function () {
    console.info(`Tour ${tour.id} has started draft countdown.`);

    // Set countdown flag to true and emit countdown start event to namespace
    draftCountingDown = true;
    tours.emit(SocketEvents.SERVER_BEGIN_DRAFT_COUNTDOWN);

    // Begin draft after initial countdown
    draftCountdown = setTimeout(() => {
      onDraftStart();
    }, DRAFT_COUNTDOWN_TIME); // End draft countdown timeout
  });
  socket.on(SocketEvents.CLIENT_ENDS_TURN, function (data: ClientPick) {
    onPickReceived(data);

    // Reset turn timer, interval timer, and advance to next turn
    resetTimeOut();
    resetInterval();
    nextTurn();
  }); // End of on client ends turn

  // Server resets the list of connected players and disconnects all sockets.
  socket.on(SocketEvents.CLIENT_CANCEL_DRAFT, onClientCancelDraft);

  // Run when client notifies their lineup is complete
  socket.on(SocketEvents.CLIENT_LINEUP_COMPLETE, onLineupComplete);
});

function onLineupComplete() {
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
    concludeDraft();
  }
}

function concludeDraft() {
  console.info(`The draft is over.`);
  draftPlayers = [];
  draftStarted = false;
  resetInterval();
  resetTimeOut();
  updateJoinedPlayers();
  tours.sockets.forEach((socket) => socket.disconnect());
}

function onPickReceived(data: ClientPick) {
  // Remove selection from available picks and emit pick
  availablePicks = availablePicks.filter(
    (pick) =>
      pick.drumCorpsCaptionId !== data.drumCorpsCaption.drumCorpsCaptionId
  );
  console.info(`Client sent pick during turn: ${data.drumCorpsCaption}`);
  tours.emit(SocketEvents.SERVER_SENDS_PLAYER_PICK, {
    lastPick: data.drumCorpsCaption,
  });
}

function onClientCancelDraft() {
  console.log('The draft is being cancelled');
  draftPlayers = [];
  draftStarted = false;
  resetInterval();
  resetTimeOut();
  updateJoinedPlayers();
  tours.emit(SocketEvents.SERVER_DRAFT_CANCELLED_BY_OWNER);
  tours.sockets.forEach((socket) => socket.disconnect());
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

// Client disconnect tasks and cleanup
function disconnectPlayer(): void {
  console.info(`Disconnect player called`);
  const foundIndex = draftPlayers.findIndex(
    (draftPlayer) => draftPlayer.player.id === player.id
  );
  if (foundIndex !== -1) {
    console.info(
      `Player ${draftPlayers[foundIndex].player.displayName} is disconnecting and being removed from active list.`
    );
    draftPlayers.splice(foundIndex, 1);
    updateJoinedPlayers();
  }
}

// Create and send list of joined players to draft lobbies on clients
function updateJoinedPlayers(): void {
  const joinedPlayers = draftPlayers.map((draftPlayer) => draftPlayer.player);
  tours.emit(SocketEvents.SERVER_UPDATE_JOINED_PLAYERS, {
    joinedPlayers,
  });
  console.info(`Players updated. ${draftPlayers.length} players connected.`);
}

function onSocketDisconnect() {
  console.info(`onSocketDisconnect called`);
  // turn should not go below 0 to prevent array out of bounds error
  turn = turn === 0 ? 0 : turn - 1;
  if (draftPlayers.length === 0) {
    clearTimeout(timeout);
    clearInterval(timerInterval);
    draftStarted = false;
  }
  disconnectPlayer();
}

async function onIdentifyPlayer(data: ClientIdentification, socket: Socket) {
  console.info(`Receiving ID from client: ${data.playerId}`);
  // Locate tour
  const tourId = socket.nsp.name.split('/')[1];

  // Locate the tour in the repository
  tour = await toursRepository.findById(tourId);

  // If tour does not exist emit an error and return
  if (!tour) {
    console.error(`Could not locate tour with ID ${tourId}`);
    socket.emit(SocketEvents.SERVER_TOUR_NOT_FOUND);
    socket.disconnect();
    return;
  }

  player = await playerRepository.findById(data.playerId);

  // Check that player exists and disconnect if not found
  if (!player) {
    console.warn(`Player not found`);
    socket.emit(SocketEvents.SERVER_PLAYER_NOT_FOUND);
    socket.disconnect();
    return;
  }

  console.info(`Player attempting to join: ${player.displayName}`);

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
  console.info(`Adding new player: ${player.displayName}`);
  draftPlayers.push(new DraftPlayer(player, socket));
  updateJoinedPlayers();
}

function onClientCancelDraftCountdown() {
  if (draftCountdown) {
    console.log('The draft countdown is being cancelled');
    draftCountingDown = false;
    clearTimeout(draftCountdown);
    tours.emit(SocketEvents.SERVER_DRAFT_COUNTDOWN_CANCELLED);
  }
}
// Starts the next turn
function nextTurn() {
  turn = currentTurn++ % draftPlayers.length;
  const turnAfter = (currentTurn + 2) % draftPlayers.length;
  console.info(
    `Server starting turn: ${turn}\nRound number: ${currentTurn}\nPicking: ${draftPlayers[turn].player.displayName}`
  );
  tours.emit(SocketEvents.SERVER_STARTS_TURN, {
    availablePicks,
    currentPick: draftPlayers[turn].player.id,
    currentPickName: draftPlayers[turn].player.displayName,
    nextPickName: draftPlayers[turnAfter].player.displayName,
    roundNumber: currentTurn,
  });
  triggerTimeout();
}

// Starts the timer for each turn
function triggerTimeout() {
  timerInterval = setInterval(() => {
    tours.emit(SocketEvents.SERVER_UPDATE_TURN_TIMER, {
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
}

// Clear the turn timer at turn end or when client ends turn
function resetTimeOut() {
  if (timeout) {
    console.info('Turn timer has been reset');
    clearTimeout(timeout);
  }
}

// Reset the in-turn countdown timer
function resetInterval() {
  console.info('Interval timer reset');
  if (timerInterval) {
    console.log('Resetting interval timer');
    clearInterval(timerInterval);
    remainingTime = 45;
  }
}

function onDraftStart() {
  // Set draft started flag and enable in-draft events after countdown
  availablePicks = allPicks;
  draftStarted = true;
  tours.emit(SocketEvents.SERVER_DRAFT_TURNS_BEGIN);
  draftCountingDown = false;

  // Begin the first turn
  nextTurn();
}
