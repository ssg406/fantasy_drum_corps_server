import { Collection } from 'fireorm';

interface DrumCorpsCaptionObject {
  id: string;
  corps: string;
  caption: string;
}

@Collection('remainingPicks')
export class RemainingPicks {
  id!: string;
  tourId!: string;
  leftOverPicks!: DrumCorpsCaptionObject[];
}
