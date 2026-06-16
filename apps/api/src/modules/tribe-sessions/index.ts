import { Module } from '@medusajs/framework/utils';
import TribeSessionModuleService from './service';

export const TRIBE_SESSIONS_MODULE = 'tribe_sessions';

export default Module(TRIBE_SESSIONS_MODULE, {
  service: TribeSessionModuleService,
});
