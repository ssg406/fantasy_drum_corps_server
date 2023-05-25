import { Collection } from 'fireorm';
import DrumCorpsCaption from './DrumCorpsCaption';

@Collection('tours')
export default class Tour {
  id!: string;
  name!: string;
  description!: string;
  isPublic!: Boolean;
  owner!: string;
  members!: Array<string>;
  draftDateTime!: string;
  password?: string;
  draftActive!: boolean;
  leftOverPicks!: { corps: string; caption: string }[];
}
