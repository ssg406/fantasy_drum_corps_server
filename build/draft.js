"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.beginDraft = void 0;
const data_1 = require("./data");
const indexAlt_1 = require("./indexAlt");
const MemberNodeList_1 = __importDefault(require("./models/MemberNodeList"));
const server_1 = __importDefault(require("./server"));
const MAX_TURN_TIME = 45 * 1000;
function beginDraft(tour) {
    return __awaiter(this, void 0, void 0, function* () {
        // Get the list of connected players
        const draftPlayerIds = indexAlt_1.connectedPlayers.get(tour.id);
        // Check that players exist
        if ((draftPlayerIds === null || draftPlayerIds === void 0 ? void 0 : draftPlayerIds.length) == 0 || !draftPlayerIds) {
            server_1.default.to(tour.id).emit('server-draft-error');
            return;
        }
        const allPlayers = yield getPlayers(draftPlayerIds);
        // Check that players were found
        if (allPlayers.length == 0) {
            server_1.default.to(tour.id).emit('server-draft-error');
            return;
        }
        // Set the round number, current turn position
        let round = 0;
        let currentTurn = 0;
        let turn = 0;
        let timeout;
        function nextTurn() {
            turn = currentTurn++ % allPlayers.length;
            // Emit start of turn info with current turn player id
            server_1.default.to(tour.id).emit('server-start-turn', { playerId: allPlayers[turn].id });
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
    });
}
exports.beginDraft = beginDraft;
function getPlayers(playerIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const allPlayers = yield data_1.playerRepository.find();
        const players = allPlayers.filter((player) => playerIds.includes(player.id));
        console.log('got players from firebase', players);
        return players;
    });
}
function generatePickOrder(members) {
    const pickSequence = new MemberNodeList_1.default();
    for (let i = 0; i < members.length; i++) {
        pickSequence.addNode(members[i]);
    }
    return pickSequence;
}
