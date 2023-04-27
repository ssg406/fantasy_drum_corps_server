import { getRepository } from 'fireorm';
import * as fireorm from 'fireorm';
import Tour from './models/Tour';
import Lineup from './models/Lineup';
import { Player } from './models/Player';
import db from './firebase';

fireorm.initialize(db);

export const toursRepository = getRepository(Tour);
export const lineupRepository = getRepository(Lineup);
export const playerRepository = getRepository(Player);
