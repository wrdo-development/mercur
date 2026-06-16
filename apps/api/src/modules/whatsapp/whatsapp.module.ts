import { Module } from '@medusajs/framework/utils';
import { DegradationService } from './degradation.service';
import { IdempotencyService } from './idempotency.service';
import { KillswitchService } from './killswitch.service';
import { MessageSenderService } from './message-sender.service';
import { WebhookHandlerService } from './webhook-handler.service';
import { WebhookPipelineService } from './webhook-pipeline.service';

export const WHATSAPP_MODULE = 'tribe_whatsapp';

/**
 * Main service exposed by the module (req.scope.resolve(WHATSAPP_MODULE)).
 * Pipeline is available via createWebhookPipeline() when module is not in config.
 */
export default Module(WHATSAPP_MODULE, {
  service: MessageSenderService,
});

export {
  DegradationService,
  IdempotencyService,
  KillswitchService,
  MessageSenderService,
  WebhookHandlerService,
  WebhookPipelineService,
};
