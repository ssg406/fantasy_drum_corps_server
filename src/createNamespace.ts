import { playerRepository, toursRepository } from "./data";
import io from './server';
import { DraftPlayer } from "./models/DraftPlayer";
import { Socket } from "socket.io";
import { SocketEvents } from "./socketEvents";
import DrumCorpsCaption from "./models/DrumCorpsCaption";
import { Player } from "./models/Player";

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

export async function createTourNamespace(tourId: string) {
    const tour = await toursRepository.findById(tourId);
    if (tour == null) {
        console.error(`Could not locate tour with ID ${tourId}`);
        return;
    }

    console.info(`Creating namespace for tour ${tourId}`);

    // Create variable for namespace for readability
    const tourNamespace = io.of(`/${tour.id}`);

    // Create draft variables that apply to namespace
    let draftPlayers: DraftPlayer[] = [];
    let draftCountingDown = false;
    let draftStarted = false;
    let draftCountdown: NodeJS.Timeout;

    // User connects to tour namespace
    tourNamespace.on('connection', (socket: Socket) => {
        console.info(`Connection made to namespace ${tourId}. Tour: ${tour.name}`);

        socket.on(SocketEvents.CLIENT_SENDS_IDENTIFICATION, async function(data: ClientIdentification) {
            const player = await getPlayer(data.playerId);
        })

    });
}

async function getPlayer(playerId: string): Promise<Player> {
    const player = await playerRepository.findById(playerId);
    if (player == null) {
        console.error(`Could not locate a player with ID ${playerId}`);
    }
    return player;
}