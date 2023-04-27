import io from './server';
import { playerRepository, toursRepository } from './data';
import Tour from './models/Tour';
import { allPicks } from './allPicks';
import { Socket } from 'socket.io';
import MemberNodeList from './models/MemberNodeList';
import { Player } from './models/Player';

// Close pre existing sockets
io.disconnectSockets();

// Register Socket.io listeners
io.on('connection', (socket) => {
  console.log('connected with socket id ', socket.id);
  socket.on(SocketEvents.clientSendsIdentification, async (data) => {
    // Get userId and tourId
    const uid = data.uid;
    const tourId = data.tourId;

    const tour = await toursRepository.findById(tourId);

    if (tour == null) {
      socket.emit(SocketEvents.tourNotFound);
      socket.disconnect;
    }

    socket.on(CLIENT_CANCEL_DRAFT);

    socket.join(tour.id);
    startDraft(tour, socket);
  });
});

async function startDraft(tour: Tour, socket: Socket) {
  let pickIds = generatePickIds();
  const tourMembers = await getTourMembers(tour.members);
  let draftSequence = generatePickOrder(tourMembers);
  let roundNumber: number = 0;

  io.to(tour.id).emit('serverSendsStartingPicks', { startingPicks: pickIds });

  // Start the turn and set the turn timer
  io.to(tour.id).emit('draftTurnStart', {
    currentPickerId: draftSequence.getCurrentNode().member.id,
    currentTurn: draftSequence.getCurrentNode().member.displayName,
    nextTurn: draftSequence.getCurrentNode().next?.member.displayName,
  });

  socket.on('clientSendsPick', (clientPick) => {
    pickIds = pickIds.filter((pick) => pick !== clientPick.pickId);
    roundNumber++;

    // Emit the updated draft state
    io.to(tour.id).emit('draftStateUpdated', {
      availablePicks: pickIds,
      roundNumber,
    });

    // If available picks is empty, end the draft
    if (pickIds.length === 0) {
      io.to(tour.id).emit('draftOver');
    } else {
      // Set the current picker to the next on the list
      draftSequence.advanceToNextNode();
      // Emit a new start turn event with updated pickers
      io.to(tour.id).emit('draftTurnStart', {
        currentPickerId: draftSequence.getCurrentNode().member.id,
        currentTurn: draftSequence.getCurrentNode().member.displayName,
        nextTurn: draftSequence.getCurrentNode().next?.member.displayName,
      });
    }
  });

  socket.on('clientTurnTimeOut', () => {
    console.log('clients turn timed out');
    roundNumber++;

    // Emit the updated draft state
    io.to(tour.id).emit('draftStateUpdated', {
      availablePicks: pickIds,
      roundNumber,
    });

    // If available picks is empty, end the draft
    if (pickIds.length === 0) {
      io.to(tour.id).emit('draftOver');
    } else {
      // Set the current picker to the next on the list
      draftSequence.advanceToNextNode();
      // Emit a new start turn event with updated pickers
      io.to(tour.id).emit('draftTurnStart', {
        currentTurn: draftSequence.getCurrentNode(),
        nextTurn: draftSequence.getCurrentNode().next,
      });
    }
  });
}

async function getTourMembers(memberIds: string[]): Promise<Player[]> {
  const allPlayers = await playerRepository.find();
  const players = allPlayers.filter((player) => memberIds.includes(player.id));
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

function generatePickIds(): string[] {
  const pickIds: string[] = [];

  for (let i = 0; i < allPicks.length; i++) {
    pickIds.push(allPicks[i].id);
  }

  return pickIds;
}
