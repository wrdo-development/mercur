import { MedusaService } from '@medusajs/framework/utils';

import TribeMessage from './models/tribe-message';
import TribeThread from './models/tribe-thread';

class TribeMessagesModuleService extends MedusaService({
  TribeThread,
  TribeMessage,
}) {}

export default TribeMessagesModuleService;
