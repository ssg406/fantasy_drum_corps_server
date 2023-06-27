import { Socket } from "socket.io";
import io from ".";
import DrumCorpsCaption from "./models/DrumCorpsCaption";
import { Player } from "./models/Player";
import { SocketEvents } from "./socketEvents";
import { ClientIdentification, ClientPick, DrumCorpsCaptionObject } from "./types";
import { playerRepository, toursRepository } from "./data";
import { allPicks } from "./allPicks";
import { DraftPlayer } from "./models/DraftPlayer";
import { RemainingPicks } from "./models/RemainingPicks";

//* Constants
const DRAFT_COUNTDOWN_TIME = 5000;

export async function createTourNamespace(tourId: string): Promise<void> {
    let currentTurnIndex: number;
    let nextTurnIndex: number;
    let roundNumber: number;
    let playerList: DraftPlayer[];
    let availablePicks: DrumCorpsCaption[];
    let draftstarted: boolean = false;
    let draftCountingDown: boolean = false;
    let draftCountdownTimeout: NodeJS.Timeout;

    const tourNamespace = io.of(`/${tourId}`);

    tourNamespace.on('connection', function (socket: Socket) {
        socket.on(SocketEvents.CLIENT_SENDS_IDENTIFICATION, function (data: ClientIdentification) {
            if (draftstarted) {
                socket.emit(SocketEvents.SERVER_DRAFT_ALREADY_STARTED);
                socket.disconnect();
                return;
            }
            addPlayer(data, socket);
        });
        socket.on(SocketEvents.CLIENT_START_DRAFT, startDraft)
        socket.on(SocketEvents.CLIENT_CANCEL_DRAFT_COUNTDOWN, cancelDraftCountdown);
        socket.on(SocketEvents.CLIENT_ENDS_TURN, turnOver);
        socket.on(SocketEvents.CLIENT_LINEUP_COMPLETE, lineupComplete);
        socket.on('disconnect', function () {
            playerList = playerList.filter((player) => player.socket.id !== socket.id);
            currentTurnIndex = currentTurnIndex === 0 ? 0 : currentTurnIndex - 1;
        });
    });

    tourNamespace.on(SocketEvents.CLIENT_START_DRAFT, startDraft);

    // Add player to list
    async function addPlayer(data: ClientIdentification, socket: Socket) {
        // Send notice if draft already started
        const player = await playerRepository.findById(data.playerId);
        if (!player) return;
        playerList.push(new DraftPlayer(player, socket));
        let joinedPlayers = playerList.map((player) => player.player);
        tourNamespace.emit(SocketEvents.SERVER_UPDATE_JOINED_PLAYERS, { joinedPlayers });
    }

    function startDraft() {
        draftCountingDown = true;
        tourNamespace.emit(SocketEvents.SERVER_SENDS_DRAFT_STATE, { draftCountingDown, draftstarted });
        draftCountdownTimeout = setTimeout(() => {
            availablePicks = allPicks;
            currentTurnIndex = 0;
            draftCountingDown = false;
            draftstarted = true;
            nextTurnIndex = currentTurnIndex === playerList.length ? 0 : currentTurnIndex + 1;
            tourNamespace.emit(SocketEvents.SERVER_SENDS_DRAFT_STATE, { draftCountingDown, draftstarted });
            turnStart();
        }, DRAFT_COUNTDOWN_TIME);

    }

    function cancelDraftCountdown() {
        if (draftCountdownTimeout) {
            clearTimeout(draftCountdownTimeout);
        }
    }

    function turnStart() {
        tourNamespace.emit(SocketEvents.SERVER_STARTS_TURN, {
            availablePicks,
            currentPick: playerList[currentTurnIndex].player.id,
            currentPickName: playerList[currentTurnIndex].player.displayName,
            nextPickName: playerList[nextTurnIndex].player.displayName,
            roundNumber,
        });
        nextTurnIndex = currentTurnIndex === playerList.length ? 0 : currentTurnIndex + 1;
        currentTurnIndex = nextTurnIndex;
    }

    function turnOver(data: ClientPick) {
        availablePicks = availablePicks.filter(
            (pick) =>
                pick.drumCorpsCaptionId !==
                data.drumCorpsCaption.drumCorpsCaptionId
        );
        tourNamespace.emit(SocketEvents.SERVER_SENDS_PLAYER_PICK, { lastPick: data.drumCorpsCaption });
        turnStart();
    }

    function removePlayer(playerId: string) {
        playerList = playerList.filter((player) => player.player.id !== playerId);
    }

    function lineupComplete(playerId: string) {
        removePlayer(playerId);
        if (playerList.length > 0) return;
        endDraft();
    }

    async function endDraft() {

        // Mark tour as draft complete and update in repository
        const tour = await toursRepository.findById(tourId);
        if (!tour) return;
        tour.draftComplete = true;
        await toursRepository.update(tour);

        // Create left over picks object and write to repository
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
        tourNamespace.sockets.forEach((socket) => socket.disconnect());
        //* Program Complete
    }


}