import { Collection } from 'fireorm';

@Collection('players')
export class Player {
  id!: string;
  displayName?: string;
  about?: string;
  selectedCorps?: string;
  avatarString?: string;
  isActive?: boolean;
}
