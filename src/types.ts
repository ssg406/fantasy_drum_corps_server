import DrumCorpsCaption from './models/DrumCorpsCaption';

export interface ClientIdentification {
  playerId: string;
}

export interface ClientPick {
  playerId: string;
  drumCorpsCaption: DrumCorpsCaption;
}

export interface DrumCorpsCaptionObject {
  id: string;
  corps: string;
  caption: string;
}
