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

// Create draft variables that apply to namespace
let draftPlayers: DraftPlayer[] = [];
let draftCountingDown = false;
let draftStarted = false;
let draftCountdown: NodeJS.Timeout;

const tours = io.of(/^[a-zA-Z0-9]*$/);

tours.on('connection', function (socket: Socket) {
  const tourNamespace = socket.nsp;
  console.log(tourNamespace);
});
