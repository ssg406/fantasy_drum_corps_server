import { playerRepository } from './data';
import { connectedPlayers } from './indexAlt';
import MemberNodeList from './models/MemberNodeList';
import { Player } from './models/Player';
import Tour from './models/Tour';
import io from './server';

const MAX_TURN_TIME = 45 * 1000;

export async function beginDraft(tour: Tour) {
  // Get the list of connected players
  const draftPlayerIds = connectedPlayers.get(tour.id);

  // Check that players exist
  if (draftPlayerIds?.length == 0 || !draftPlayerIds) {
    io.to(tour.id).emit('server-draft-error');
    return;
  }

  const allPlayers = await getPlayers(draftPlayerIds);

  // Check that players were found
  if (allPlayers.length == 0) {
    io.to(tour.id).emit('server-draft-error');
    return;
  }

  // Set the round number, current turn position
  let round = 0;
  let currentTurn = 0;
  let turn = 0;
  let timeout: NodeJS.Timer;

  function nextTurn() {
    turn = currentTurn++ % allPlayers.length;
    // Emit start of turn info with current turn player id
    io.to(tour.id).emit('server-start-turn', { playerId: allPlayers[turn].id });
    console.log('next turn triggered ', turn);
    triggerTimeout();
  }

  function triggerTimeout() {
    timeout = setTimeout(() => {
      nextTurn();
    }, MAX_TURN_TIME);
  }

  function resetTimeout() {
    if (timeout) {
      console.log('timeout reset');
      clearTimeout(timeout);
    }
  }
}

async function getPlayers(playerIds: string[]): Promise<Player[]> {
  const allPlayers = await playerRepository.find();
  const players = allPlayers.filter((player) => playerIds.includes(player.id));
  console.log('got players from firebase', players);
  return players;
}

function generatePickOrder(members: Player[]): MemberNodeList<Player> {
  const pickSequence = new MemberNodeList<Player>();
  for (let i = 0; i < members.length; i++) {
    pickSequence.addNode(members[i]);
  }
  return pickSequence;
}
