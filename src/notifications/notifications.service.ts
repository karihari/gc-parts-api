import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/app-config';

const TIMEOUT_MS = 5_000;

// Sends shop events to the Make.com webhook, which forwards them to the shop owner.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get configured(): boolean {
    return Boolean(this.config.makeWebhookUrl);
  }

  // Returns whether the webhook accepted it. Never throws: callers decide if a failure matters.
  async send(source: string, payload: Record<string, unknown>): Promise<boolean> {
    const url = this.config.makeWebhookUrl;
    if (!url) return false;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source, submittedAt: new Date().toISOString(), ...payload }),
        // A slow webhook must not hold the customer's request open.
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) this.logger.error(`Make webhook responded ${res.status} for ${source}`);
      return res.ok;
    } catch (error) {
      this.logger.error(`Make webhook failed for ${source}: ${(error as Error).message}`);
      return false;
    }
  }
}
