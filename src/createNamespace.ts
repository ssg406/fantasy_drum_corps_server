import { Socket } from 'socket.io';
import io from '.';
import DrumCorpsCaption from './models/DrumCorpsCaption';
import { Player } from './models/Player';
import { SocketEvents } from './socketEvents';
import {
  ClientIdentification,
  ClientPick,
  DrumCorpsCaptionObject,
} from './types';
import {
  playerRepository,
  remainingPicksRepository,
  toursRepository,
} from './data';
import { allPicks } from './allPicks';
import { DraftPlayer } from './models/DraftPlayer';
import { RemainingPicks } from './models/RemainingPicks';

//* Constants
const DRAFT_COUNTDOWN_TIME = 5000;

export async function createTourNamespace(tourId: string): Promise<void> {
  let currentTurnIndex: number = 0;
  let nextTurnIndex: number;
  let roundNumber: number = 0;
  let playerList: DraftPlayer[] = [];
  let availablePicks: DrumCorpsCaption[];
  let draftStarted: boolean = false;
  let draftCountingDown: boolean = false;
  let draftCountdownTimeout: NodeJS.Timeout;

  const tourNamespace = io.of(`/${tourId}`);

  tourNamespace.on('connection', function (socket: Socket) {
    socket.on(
      SocketEvents.CLIENT_SENDS_IDENTIFICATION,
      function (data: ClientIdentification) {
        if (draftStarted) {
          console.info(
            `[DRAFT ${tourId}] Client attempted to connect to in-progress draft`
          );
          socket.emit(SocketEvents.SERVER_DRAFT_ALREADY_STARTED);
          socket.disconnect();
          return;
        }
        addPlayer(data, socket);
      }
    );
    socket.on(SocketEvents.CLIENT_START_DRAFT, startDraft);
    socket.on(SocketEvents.CLIENT_CANCEL_DRAFT_COUNTDOWN, cancelDraftCountdown);
    socket.on(SocketEvents.CLIENT_ENDS_TURN, turnOver);
    socket.on(SocketEvents.CLIENT_LINEUP_COMPLETE, lineupComplete);
    socket.on('disconnect', function () {
      console.info(
        `[DRAFT ${tourId}] Socket ${socket.id} disconnected. Updating player list`
      );
      playerList = playerList.filter(
        (player) => player.socket.id !== socket.id
      );
      currentTurnIndex = currentTurnIndex === 0 ? 0 : currentTurnIndex - 1;
    });
    socket.on(SocketEvents.CLIENT_CANCEL_DRAFT, cancelDraft);
  });

  function cancelDraft() {
    console.info(`[DRAFT ${tourId}] Tour owner cancelled the draft`);
    playerList = [];
    draftStarted = false;
    draftCountingDown = false;
    roundNumber = 0;
    currentTurnIndex = 0;
    tourNamespace.emit(SocketEvents.SERVER_DRAFT_CANCELLED_BY_OWNER);
    tourNamespace.sockets.forEach((socket) => socket.disconnect());
  }

  // Add player to list
  async function addPlayer(data: ClientIdentification, socket: Socket) {
    // Send notice if draft already started
    const player = await playerRepository.findById(data.playerId);
    if (!player) {
      console.warn(
        `[DRAFT ${tourId}] Player ID ${data.playerId} could not be found in database`
      );
      socket.emit(SocketEvents.SERVER_PLAYER_NOT_FOUND);
      socket.disconnect();
      return;
    }
    // Check for duplicate player
    const existingPlayer = playerList.find(
      (draftPlayer) => draftPlayer.player.id === player.id
    );
    if (existingPlayer) {
      console.warn(
        `[DRAFT ${tourId}] A duplicate player was detected and will not be added to player list`
      );
      socket.disconnect();
      return;
    }
    console.info(
      `[DRAFT ${tourId}] Adding player ${player.displayName} to player list`
    );
    playerList.push(new DraftPlayer(player, socket));
    let joinedPlayers = playerList.map((player) => player.player);
    tourNamespace.emit(SocketEvents.SERVER_UPDATE_JOINED_PLAYERS, {
      joinedPlayers,
    });
  }

  function startDraft() {
    console.info(
      `[DRAFT ${tourId}] Starting draft countdown...${DRAFT_COUNTDOWN_TIME} seconds remaining.`
    );
    draftCountingDown = true;
    console.info(
      `[DRAFT ${tourId}] Updating draft state. draftStarted = ${draftStarted}, draftCountingDown = ${draftCountingDown}`
    );
    tourNamespace.emit(SocketEvents.SERVER_SENDS_DRAFT_STATE, {
      draftCountingDown,
      draftStarted,
    });
    draftCountdownTimeout = setTimeout(() => {
      availablePicks = allPicks;
      draftCountingDown = false;
      draftStarted = true;
      tourNamespace.emit(SocketEvents.SERVER_SENDS_DRAFT_STATE, {
        draftCountingDown,
        draftStarted,
      });
      turnStart();
    }, DRAFT_COUNTDOWN_TIME);
  }

  function cancelDraftCountdown() {
    console.info(`[DRAFT ${tourId}] Tour owner cancelled the draft countdown`);
    if (draftCountdownTimeout) {
      clearTimeout(draftCountdownTimeout);
    }
  }

  function turnStart() {
    currentTurnIndex = currentTurnIndex++ % playerList.length;
    nextTurnIndex = (currentTurnIndex + 2) % playerList.length;
    if (currentTurnIndex === 0) roundNumber++;

    console.info(
      `[DRAFT ${tourId}] Starting turn. currentTurnIndex = ${currentTurnIndex}, nextTurnIndex = ${nextTurnIndex}`
    );

    tourNamespace.emit(SocketEvents.SERVER_STARTS_TURN, {
      availablePicks,
      currentPick: playerList[currentTurnIndex].player.id,
      currentPickName: playerList[currentTurnIndex].player.displayName,
      nextPickName: playerList[nextTurnIndex].player.displayName,
      roundNumber,
    });
    // nextTurnIndex =
    //   currentTurnIndex + 1 > playerList.length ? 0 : currentTurnIndex + 1;
    // currentTurnIndex = nextTurnIndex;
  }

  function turnOver(data: ClientPick) {
    console.info(
      `[DRAFT ${tourId}] Turn completed. ${data.playerId} sent pick.`
    );
    availablePicks = availablePicks.filter(
      (pick) =>
        pick.drumCorpsCaptionId !== data.drumCorpsCaption.drumCorpsCaptionId
    );
    console.info(
      `[DRAFT ${tourId}] Removing pick ID ${data.drumCorpsCaption.drumCorpsCaptionId} from available picks`
    );
    if (draftStarted) {
      tourNamespace.emit(SocketEvents.SERVER_SENDS_PLAYER_PICK, {
        lastPick: data.drumCorpsCaption,
      });
      turnStart();
    }
  }

  function removePlayer(playerId: string) {
    console.info(`[DRAFT ${tourId}] Removing player ${playerId}`);
    playerList = playerList.filter((player) => player.player.id !== playerId);
  }

  function lineupComplete(data: ClientIdentification) {
    console.info(`[DRAFT ${tourId}] Player ${data.playerId} lineup complete`);
    removePlayer(data.playerId);
    if (playerList.length > 0) return;

    endDraft();
  }

  async function endDraft() {
    draftStarted = false;
    draftCountingDown = false;
    playerList = [];
    currentTurnIndex = 0;
    roundNumber = 0;

    console.info(`[DRAFT ${tourId}] All tour lineups complete, ending draft.`);
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
    await remainingPicksRepository.create(remainingPicks);
    console.info(
      `[DRAFT ${tourId}] Writing remaining picks to repository. ${leftOverPicks.length} picks remaining.`
    );
    tourNamespace.sockets.forEach((socket) => socket.disconnect());
    //* Program Complete
  }
}
