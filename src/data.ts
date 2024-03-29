import { getRepository } from 'fireorm';
import * as fireorm from 'fireorm';
import Tour from './models/Tour';
import { Player } from './models/Player';
import db from './firebase';
import { FantasyCorps } from './models/FantasyCorps';
import { RemainingPicks } from './models/RemainingPicks';

fireorm.initialize(db);

export const toursRepository = getRepository(Tour);
export const playerRepository = getRepository(Player);
export const fantasyCorpsRepository = getRepository(FantasyCorps);
export const remainingPicksRepository = getRepository(RemainingPicks);
