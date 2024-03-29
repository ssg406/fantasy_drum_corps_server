import { DrumCorps } from './DrumCorps';
import { Caption } from './Caption';

export default class DrumCorpsCaption {
  drumCorpsCaptionId: string;
  corps: DrumCorps;
  caption: Caption;

  constructor(id: string, corps: DrumCorps, caption: Caption) {
    this.drumCorpsCaptionId = id;
    this.corps = corps;
    this.caption = caption;
  }
}
