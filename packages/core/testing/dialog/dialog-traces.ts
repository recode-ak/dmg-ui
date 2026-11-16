import { Trace } from 'dmg-core';
import { DIALOG_CHANNEL } from './dialog-channel.const';

/** След на каждый входящий сигнал диалога: запрос канала `dmg-ui-dialog`. */
export class DialogTraces {
  constructor(private readonly requestIds: () => string) {}

  next(): Trace {
    return Trace.fromRequest({
      requestId: this.requestIds(),
      channel: { name: DIALOG_CHANNEL },
    });
  }
}
