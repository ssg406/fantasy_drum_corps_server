import { Collection } from 'fireorm';

interface DrumCorpsCaptionObject {
  corps: string;
  caption: string;
}

@Collection('remainingPicks')
export class RemainingPicks {
  id!: string;
  tourId!: string;
  leftOverPicks!: DrumCorpsCaptionObject[];
}
