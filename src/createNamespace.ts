import { Socket } from "socket.io";
import { allPicks } from "./allPicks";
import { playerRepository, remainingPicksRepository, toursRepository } from "./data";
import { DraftPlayer } from "./models/DraftPlayer";
import DrumCorpsCaption from "./models/DrumCorpsCaption";
import { Player } from "./models/Player";
import { RemainingPicks } from "./models/RemainingPicks";
import io from './index';
import { SocketEvents } from "./socketEvents";
import Tour from "./models/Tour";

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

//* Called when Firebase cloud function sends a post request
//* to an endpoint on the express server. Registers a namespace
//* for a new tour to allow the players to connect for the draft.
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

        socket.on(SocketEvents.CLIENT_SENDS_IDENTIFICATION, async function (data: ClientIdentification) {
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

            //* Add player to list of joined players
            draftPlayers.push(new DraftPlayer(player, socket));
            //updateJoinedPlayers();

            //* Send current draft state
            socket.emit(SocketEvents.SERVER_SENDS_DRAFT_STATE, {
                draftStarted,
                draftCountingDown,
            }); // End server sends draft state

            //* Client sends draft start event to initiate countdown
            socket.on(SocketEvents.CLIENT_START_DRAFT, function () {
                console.log('The tour owner has started the draft countdown');

                // Set countdown flag to true and emit countdown start event to namespace
                draftCountingDown = true;
                tourNamespace.emit(SocketEvents.SERVER_BEGIN_DRAFT_COUNTDOWN);
                let availablePicks = allPicks;

                // Start the draft after countdown
                draftCountdown = setTimeout(() => {
                    // Set flags and enable in-draft listeners after countdown
                    draftStarted = true;
                    tourNamespace.emit(SocketEvents.SERVER_DRAFT_TURNS_BEGIN);
                    draftCountingDown = false;

                    let timeout: NodeJS.Timeout;
                    let timerInterval: NodeJS.Timer;
                    let turn = 0;
                    let currentTurn = 0;
                    let remainingTime = TURN_TIME_SECONDS;

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
                    }

                    // Start the turn timer
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
                        SocketEvents.CLIENT_SENDS_AUTO_PICK,
                        function (data: ClientPick) {
                            console.log('Server received auto pick from client');
                            availablePicks = availablePicks.filter(
                                (pick) =>
                                    pick.drumCorpsCaptionId !==
                                    data.drumCorpsCaption.drumCorpsCaptionId
                            );
                            tourNamespace.emit(SocketEvents.SERVER_SENDS_PLAYER_PICK, {
                                lastPick: data.drumCorpsCaption,
                            });
                        }
                    );

                    socket.on(
                        SocketEvents.CLIENT_ENDS_TURN,
                        function (data: ClientPick) {
                            availablePicks = availablePicks.filter(
                                (pick) =>
                                    pick.drumCorpsCaptionId !==
                                    data.drumCorpsCaption.drumCorpsCaptionId
                            );
                            console.log(
                                'Client picked drum corps caption  ',
                                data.drumCorpsCaption.caption,
                                data.drumCorpsCaption.corps
                            );
                            tourNamespace.emit(SocketEvents.SERVER_SENDS_PLAYER_PICK, {
                                lastPick: data.drumCorpsCaption,
                            });
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
                        updateJoinedPlayers();
                        tourNamespace.emit(
                            SocketEvents.SERVER_DRAFT_CANCELLED_BY_OWNER
                        );
                        tourNamespace.sockets.forEach((socket) =>
                            socket.disconnect()
                        );
                    });

                    socket.on('disconnect', () => {
                        turn--;
                        if (draftPlayers.length === 0) {
                            clearTimeout(timeout);
                            clearInterval(timerInterval);
                            draftStarted = false;
                        }
                    });
                }, DRAFT_COUNTDOWN_TIME);

                socket.on(SocketEvents.CLIENT_LINEUP_COMPLETE, function () {
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
                    }
                });
            });// End draft start listener

            //* Client emits this event to cancel the countdown before draft begins
            socket.on(SocketEvents.CLIENT_CANCEL_DRAFT_COUNTDOWN, function () {
                if (draftCountdown) {
                    console.log('The draft countdown is being cancelled');
                    draftCountingDown = false;
                    clearTimeout(draftCountdown);
                    tourNamespace.emit(
                        SocketEvents.SERVER_DRAFT_COUNTDOWN_CANCELLED
                    );
                }
            }); // End client cancel draft listener


        }); // End client sends identification

        //* Removes the player from the active list so the server stops tracking their turns
        function disconnectPlayer(): void {
            const foundIndex = draftPlayers.findIndex(
                (draftPlayer) => draftPlayer.socket.id === socket.id
            );
            if (foundIndex !== -1) {
                console.info(`Player ${draftPlayers[foundIndex].player.displayName} is disconnecting and being removed from active list.`);
                draftPlayers.splice(foundIndex, 1);
                updateJoinedPlayers();
                socket.disconnect();
            }
        } // end disconnectPlayer()

        //* Send updated list of players to clients
        function updateJoinedPlayers(): void {
            const joinedPlayers = draftPlayers.map(
                (draftPlayer) => draftPlayer.player
            );
            tourNamespace.emit(SocketEvents.SERVER_UPDATE_JOINED_PLAYERS, { joinedPlayers });
            console.info(`Players updated. ${draftPlayers.length} players connected.`);
        } // End updateJoinedPlayers()

    }); // End tourNamespace onConnect
}

//* Retrieve player object from Firebase
async function getPlayer(playerId: string): Promise<Player> {
    const player = await playerRepository.findById(playerId);
    return player;
}

//* Save the remaining picks to the server to use for additonal lineups
async function saveRemainingPicks(remainingPicks: RemainingPicks): Promise<void> {
    await remainingPicksRepository.create(remainingPicks);
}

//* Marks the tour object as complete and updates the database
async function markTourComplete(tour: Tour): Promise<void> {
    tour.draftComplete = true;
    await toursRepository.update(tour);
}