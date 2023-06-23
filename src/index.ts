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
import { tourDraft } from './tourRoom';
export const roomsMap: Map<string, DraftPlayer[]> = new Map();

io.on('connection', function (socket: Socket) {
  console.info('Incoming connection to Socket.io server');

  socket.on(
    SocketEvents.CLIENT_SENDS_IDENTIFICATION,
    async function (data: ClientIdentification) {
      console.info(
        `Got client ID\nPlayer ID: ${data.playerId} Tour ID: ${data.tourId}`
      );
      const player = await playerRepository.findById(data.playerId);
      const tour = await toursRepository.findById(data.tourId);

      // Disconnect if player was not found
      if (!player) {
        socket.emit(SocketEvents.SERVER_PLAYER_NOT_FOUND);
        socket.disconnect();
        return;
      }

      // Disconnect if tour was not found
      if (!tour) {
        socket.emit(SocketEvents.SERVER_TOUR_NOT_FOUND);
        socket.disconnect();
        return;
      }

      // Add player to the rooms map
      if (!addPlayer(tour.id, player, socket)) return;

      // If player is the tour owner, call the draft function
      if (tour.owner === player.id) {
        tourDraft(tour, player, socket);
      }
    }
  );
});

function addPlayer(tourId: string, player: Player, socket: Socket): boolean {
  let playersList = roomsMap.get(tourId);

  if (!playersList) {
    playersList = [new DraftPlayer(player, socket)];
  } else {
    const existingPlayer = playersList.find(
      (draftPlayer) => draftPlayer.player.id === player.id
    );
    if (existingPlayer) {
      console.warn('A duplicate player connected. Not adding to list');
      socket.disconnect();
      return false;
    }
    console.info(`Adding player: ${player.displayName}`);
    playersList.push(new DraftPlayer(player, socket));
  }

  roomsMap.set(tourId, playersList);

  // Move the player to the tour draft room
  socket.join(tourId);

  return true;
}
