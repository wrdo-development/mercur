import { Module } from '@medusajs/framework/utils';

import WrdoUserModuleService from './service';

export const WRDO_USER_MODULE = 'wrdo_user';

export default Module(WRDO_USER_MODULE, {
  service: WrdoUserModuleService,
});

export {
  type Channel,
  type GetOrCreateOptions,
  type UserChannelIdentityRecord,
  WrdoUserService,
  type WrdoUserDirectory,
  type WrdoUserRecord,
} from './wrdo-user.service';
