import { allPicks } from 'allPicks';
import { remainingPicksRepository } from 'data';
import { DraftPlayer } from 'models/DraftPlayer';
import DrumCorpsCaption from 'models/DrumCorpsCaption';
import { Player } from 'models/Player';
import { RemainingPicks } from 'models/RemainingPicks';

interface DrumCorpsCaptionObject {
  id: string;
  corps: string;
  caption: string;
}

//* Constants
const DRAFT_COUNTDOWN_TIME = 100;
const TURN_TIME_SECONDS = 45;

class DraftSystem {
  players: DraftPlayer[];
  draftCountingDown: boolean;
  draftStarted: boolean;
  draftCountdown?: NodeJS.Timeout;
  timeout?: NodeJS.Timeout;
  timerInterval?: NodeJS.Timer;
  turn: number;
  currentTurn: number;
  remainingTime: number;
  availablePicks: DrumCorpsCaption[];
  lastPick?: DrumCorpsCaption;
  tourId: string;

  constructor(tourId: string) {
    this.players = [];
    this.draftCountingDown = false;
    this.draftStarted = false;
    this.turn = 0;
    this.currentTurn = 0;
    this.remainingTime = TURN_TIME_SECONDS;
    this.availablePicks = allPicks;
    this.tourId = tourId;
  }

  addPlayer(newPlayer: DraftPlayer) {
    const existingPlayer = this.players.find(
      (draftPlayer) => draftPlayer.player.id === newPlayer.player.id
    );
    if (existingPlayer) {
      throw Error('Attempted to add duplicate player to draft');
    }
    this.players.push(newPlayer);
  }

  removePlayer() {}

  nextTurn() {}

  triggerTimeout() {}

  resetTimeout() {}

  resetInterval() {}

  removePick(playerPick: DrumCorpsCaption) {
    this.availablePicks = this.availablePicks.filter(
      (pick) => pick.drumCorpsCaptionId !== playerPick.drumCorpsCaptionId
    );
    this.lastPick = playerPick;
  }

  async writeLeftoverPicks() {
    let leftOverPicks: DrumCorpsCaptionObject[] = [];
    this.availablePicks.forEach((pick) => {
      leftOverPicks.push({
        id: pick.drumCorpsCaptionId,
        corps: pick.corps.toString(),
        caption: pick.caption.toString(),
      });
    });
    const remainingPicks = new RemainingPicks();
    remainingPicks.tourId = this.tourId;
    remainingPicks.leftOverPicks = leftOverPicks;
    await remainingPicksRepository.create(remainingPicks);
  }
}
