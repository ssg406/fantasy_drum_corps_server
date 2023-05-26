import { Collection } from 'fireorm';
import DrumCorpsCaption from './DrumCorpsCaption';

@Collection('tours')
export default class Tour {
  id!: string;
  name!: string;
  description!: string;
  isPublic!: boolean;
  owner!: string;
  members!: Array<string>;
  draftDateTime!: string;
  password?: string;
  draftActive!: boolean;
  draftComplete!: boolean;
}
