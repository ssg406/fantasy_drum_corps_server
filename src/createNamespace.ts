import { playerRepository, toursRepository } from "./data";
import io from './server';
import { DraftPlayer } from "./models/DraftPlayer";
import { Socket } from "socket.io";
import { SocketEvents } from "./socketEvents";
import DrumCorpsCaption from "./models/DrumCorpsCaption";
import { Player } from "./models/Player";
import { allPicks } from "./allPicks";

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

const DRAFT_COUNTDOWN_TIME = 100;
const TURN_TIME_SECONDS = 45;

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

            // Check that player exists and disconnect if not found
            if (!player) {
                socket.emit(SocketEvents.SERVER_PLAYER_NOT_FOUND);
                socket.disconnect();
                return;
            }

            // Send notification if draft is already in progress
            if (draftStarted) {
                socket.emit(SocketEvents.SERVER_DRAFT_ALREADY_STARTED);
                // TODO: Disconnect socket??
                return;
            }

            // Check if player has already connected
            const existingPlayer = draftPlayers.find((draftPlayer) => draftPlayer.player.id === player.id);
            if (existingPlayer) {
                console.warn('A duplicate player connected. Not adding to list');
            }

            // Add player to list of joined players
            draftPlayers.push(new DraftPlayer(player, socket));
            updateJoinedPlayers();

            // Send current draft state
            socket.emit(SocketEvents.SERVER_SENDS_DRAFT_STATE, {
                draftStarted,
                draftCountingDown,
            });

            // Register listeners if tour owner has connected
            if (tour.owner === player.id) {
                console.info(`Tour owner for tour ${tour.id} has connected.`)

                socket.on(SocketEvents.CLIENT_START_DRAFT, function() {
                    console.info(`Draft countdown started for tour ${tour.id}`);

                    // Set countdown flag
                    draftCountingDown = true;

                    // Set available picks
                    let availablePicks = allPicks;

                    // Emit countdown start notification
                    tourNamespace.emit(SocketEvents.SERVER_BEGIN_DRAFT_COUNTDOWN);

                    // Start draft after countdown
                    draftCountdown = setTimeout(() => {
                        console.info(`Draft started for tour ${tour.id}`);
                        // Setup draft at end of countdown
                        draftStarted = true;
                        draftCountingDown = false;
                        let timeout: NodeJS.Timeout;
                        let timerInterval: NodeJS.Timer;
                        let turn = 0;
                        let currentTurn = 0;
                        let remainingTime = TURN_TIME_SECONDS;

                        // nextTurn()  starts a turn
                        function nextTurn() {
                            console.info(`Turn #${currentTurn} starting.\nPlayer ${draftPlayers[turn].player.displayName} is picking.`);
                            // Set turn, and calculate turnAfter to send next pickers name
                            turn = currentTurn++ % draftPlayers.length;
                            const turnAfter = (currentTurn + 1) % draftPlayers.length;
                            tourNamespace.emit(SocketEvents.SERVER_STARTS_TURN, {
                                availablePicks,
                                currentPick: draftPlayers[turn].player.id,
                                currentPickName: draftPlayers[turn].player.displayName,
                                nextPickName: draftPlayers[turnAfter].player.displayName,
                                roundNumber: currentTurn,
                            });
                            // Trigger the timer
                            triggerTimeout();
                        }

                        // Starts the turn timer
                        function triggerTimeout() {
                            console.info('Turn timer started.');
                            // Set the interval timer that emits the countdown
                            timerInterval = setInterval(() => {
                                tourNamespace.emit(SocketEvents.SERVER_UPDATE_TURN_TIMER, {
                                    remainingTime,
                                });
                                remainingTime = remainingTime === 0 ? 0 : remainingTime - 1;
                            }, 1000);

                            // Set the turn timer that executes when no pick is received
                            timeout = setTimeout(() => {
                                console.info(`No pick received for turn #${turn}`);
                                // Notify client to perform an auto-pick and send it back
                                draftPlayers[turn].socket.emit(SocketEvents.SERVER_NO_PICK_RECEIVED);
                                // Set 1s timer to wait for auto pick result
                                setTimeout(() => {
                                    resetInterval();
                                    nextTurn();
                                }, 1000);
                            }, TURN_TIME_SECONDS * 1000 + 2000);
                        }

                        // Clears the turn timer
                        function resetTimeout() {
                            if (timeout) {
                                console.info('Turn timer has been reset.');
                                clearTimeout(timeout);
                            }
                        }

                        // Reset interval
                        function resetInterval() {
                            if (timerInterval) {
                                console.info('Resetting interval timer');
                                clearInterval(timerInterval);
                                remainingTime = TURN_TIME_SECONDS;
                            }
                        };

                        // Star the first turn
                        nextTurn();

                        // Listen for auto picks
                        socket.on(SocketEvents.CLIENT_SENDS_AUTO_PICK, function(data: ClientPick) {
                            console.info(`Received auto pick from ${player.displayName}`);
                            availablePicks = availablePicks.filter((pick) => pick.drumCorpsCaptionId !== data.drumCorpsCaption.drumCorpsCaptionId);
                            tourNamespace.emit(SocketEvents.SERVER_SENDS_PLAYER_PICK, {lastPick: data.drumCorpsCaption});
                        });

                        // Listen for client to send pick and end turn
                        socket.on(
                            SocketEvents.CLIENT_ENDS_TURN,
                            function(data: ClientPick) {
                                availablePicks = availablePicks.filter(
                                    (pick) => 
                                    pick.drumCorpsCaptionId !== data.drumCorpsCaption.drumCorpsCaptionId
                                );
                                console.info(`${player.displayName} picked ${data.drumCorpsCaption.corps} ${data.drumCorpsCaption.caption}`);
                                tourNamespace.emit(SocketEvents.SERVER_SENDS_PLAYER_PICK, {
                                    lastPick: data.drumCorpsCaption,
                                  });
                                resetTimeout();
                                resetInterval();
                                nextTurn();
                            }
                        )
                        
                    });
                })
            }

            

        })

    });
}

async function getPlayer(playerId: string): Promise<Player> {
    const player = await playerRepository.findById(playerId);
    return player;
}