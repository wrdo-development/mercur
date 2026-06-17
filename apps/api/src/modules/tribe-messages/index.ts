import { Module } from '@medusajs/framework/utils';

import TribeMessagesModuleService from './service';

export const TRIBE_MESSAGES_MODULE = 'tribe_messages';

export default Module(TRIBE_MESSAGES_MODULE, {
  service: TribeMessagesModuleService,
});
