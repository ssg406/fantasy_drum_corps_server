import { Socket } from 'socket.io';
import { Player } from './Player';

export class DraftPlayer {
  player: Player;
  socket: Socket;

  constructor(player: Player, socket: Socket) {
    this.player = player;
    this.socket = socket;
  }
}
