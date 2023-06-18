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
  tourId: string;
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

let roomsMap: Map<string, DraftPlayer[]> = new Map();

io.on('connection', function (socket: Socket) {
  console.log('Connection made to socket.io server');
  // Wait for identification
  socket.on(
    SocketEvents.CLIENT_SENDS_IDENTIFICATION,
    async function (data: ClientIdentification) {
      const { playerId, tourId } = data;

      console.log(`Receiving ID from player ${playerId}`);

      // Find player and player's tour
      const tour = await getTour(tourId);
      const player = await getPlayer(playerId);

      // Disconnect and quit if no tour found
      if (tour === null) {
        socket.emit(SocketEvents.SERVER_TOUR_NOT_FOUND);
        socket.disconnect();
        return;
      }

      if (player === null) {
        socket.emit(SocketEvents.SERVER_PLAYER_NOT_FOUND);
        socket.disconnect();
        return;
      }

      // Join socket to tour room and update room list
      console.log(`Joining player to room ${tourId}`);
      socket.join(tourId);
      addNewPlayer(tourId, new DraftPlayer(player, socket));

      // If player is the tour owner, run the start draft function
      if (tour.owner === playerId) {
        ownerInitTour(socket, tour);
      }

      socket.on('disconnect', function () {
        console.log(`Player disconnecting, attempting to remove`);
        removePlayerOnSocketDisconnect(socket, tourId);
      });
    }
  ); // end socket.on(clientID)
}); // end io.on('connection')

async function getTour(tourId: string): Promise<Tour> {
  const tour = await toursRepository.findById(tourId);
  return tour;
}

async function getPlayer(playerId: string): Promise<Player> {
  const player = await playerRepository.findById(playerId);
  return player;
}

function ownerInitTour(socket: Socket, tour: Tour) {
  console.log(`Tour owner connected, running draft init for tour ${tour.name}`);
  // Emit to room that owner has
  socket.on(SocketEvents.CLIENT_START_DRAFT, function () {
    console.log(`Received draft start signal for tour ${tour.name}`);
  });
}

function addNewPlayer(tourId: string, player: DraftPlayer) {
  console.log(`New player being added to tour ${tourId}`);
  let existingPlayers = getPlayerList(tourId);
  existingPlayers.push(player);
  roomsMap.set(tourId, existingPlayers);
  emitPlayerList(tourId);
}

function removePlayerOnSocketDisconnect(socket: Socket, tourId: string) {
  socket.disconnect();
  let connectedPlayers = getPlayerList(tourId);
  if (connectedPlayers.length === 0) return;
  const foundIndex = connectedPlayers.findIndex(
    (player) => player.socket.id === socket.id
  );

  if (foundIndex === -1) return;
  console.log(`Disconnecting player found, removing from room list`);
  connectedPlayers.splice(foundIndex, 1);
  emitPlayerList(tourId);
}

function emitPlayerList(tourId: string) {
  io.to(tourId).emit(SocketEvents.SERVER_UPDATE_JOINED_PLAYERS, {
    joinedPlayers: getPlayerList(tourId).map((player) => player.player),
  });
}

function getPlayerList(tourId: string): DraftPlayer[] {
  let players = roomsMap.get(tourId);
  return players === undefined ? [] : players;
}
