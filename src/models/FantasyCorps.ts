import { Collection } from 'fireorm';
import { Caption } from './Caption';
import { DrumCorps } from './DrumCorps';

@Collection('fantasyCorps')
export class FantasyCorps {
  id!: string;
  tourId!: string;
  name!: string;
  userId!: string;
  showTitle!: string;
  repertoire!: string;
  lineup!: Map<Caption, DrumCorps[]>;
  generalEffect1First!: number;
  generalEffect1Second!: number;
  generalEffect2First!: number;
  generalEffect2Second!: number;
  visualProficiencyFirst!: number;
  visualProficiencySecond!: number;
  visualAnalysisFirst!: number;
  visualAnalysisSecond!: number;
  colorGuardFirst!: number;
  colorGuardSecond!: number;
  brassFirst!: number;
  brassSecond!: number;
  musicAnalysisFirst!: number;
  musicAnalysisSecond!: number;
  percussionFirst!: number;
  percussionSecond!: number;
}
