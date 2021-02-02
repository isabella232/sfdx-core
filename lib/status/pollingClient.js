/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { setInterval } from 'timers';
import { AsyncOptionalCreatable, Duration } from '@salesforce/kit';
import { ensure } from '@salesforce/ts-types';
import { Logger } from '../logger';
import { SfdxError } from '../sfdxError';
/**
 * This is a polling client that can be used to poll the status of long running tasks. It can be used as a replacement
 * for Streaming when streaming topics are not available or when streaming handshakes are failing. Why wouldn't you
 * want to use this? It can impact Salesforce API usage.
 *
 * ```
 * const options: PollingClient.Options = {
 *      async poll(): Promise<StatusResult>  {
 *       return Promise.resolve({ completed: true, payload: 'Hello World' });
 *     },
 *     frequency: Duration.milliseconds(10),
 *      timeout: Duration.minutes(1)
 *   };
 * const client = await PollingClient.create(options);
 * const pollResult = await client.subscribe();
 * console.log(`pollResult: ${pollResult}`);
 * ```
 */
export class PollingClient extends AsyncOptionalCreatable {
  /**
   * Constructor
   * @param options Polling client options
   * @ignore
   */
  constructor(options) {
    super(options);
    this.options = ensure(options);
  }
  /**
   * Asynchronous initializer.
   */
  async init() {
    this.logger = await Logger.child(this.constructor.name);
  }
  /**
   * Returns a promise to call the specified polling function using the interval and timeout specified
   * in the polling options.
   */
  subscribe() {
    // This promise is held open while setInterval tries to resolve or reject.
    // If set interval can't do it then the timeout will reject.
    return new Promise((resolve, reject) => {
      // Use set interval to periodically call the polling function
      // This try catch enables support for time{0} since setInterval only supports
      // time {1}. In other words, we should call first then wait for the first interval.
      this.doPoll()
        .then(result => {
          if (result && result.completed) {
            resolve(result.payload);
          } else {
            this.interval = setInterval(
              PollingClient.prototype.doPoll.bind(this, resolve, reject),
              this.options.frequency.milliseconds
            );
          }
        })
        .catch(() => {
          this.interval = setInterval(
            PollingClient.prototype.doPoll.bind(this, resolve, reject),
            this.options.frequency.milliseconds
          );
        });
      // hard polling timeout.
      this.timeout = setTimeout(() => {
        this.logger.debug('Polling timed out');
        this.clearAll();
        // @todo should go in messages.
        reject(new SfdxError('The client has timed out.', this.options.timeoutErrorName || 'PollingClientTimeout'));
      }, this.options.timeout.milliseconds);
    });
  }
  async doPoll(resolve, reject) {
    try {
      // Poll can be an async function.
      const sample = await this.options.poll();
      if (sample.completed) {
        this.clearAll();
        if (resolve) {
          resolve(sample.payload);
        } else {
          return sample;
        }
      }
    } catch (e) {
      this.clearAll();
      if (reject) {
        reject(e);
      } else {
        throw e;
      }
    }
  }
  clearAll() {
    if (this.interval) {
      this.logger.debug('Clearing the polling interval');
      clearInterval(this.interval);
    }
    if (this.timeout) {
      this.logger.debug('Clearing the timeout interval');
      clearTimeout(this.timeout);
    }
  }
}
(function(PollingClient) {
  /**
   * Default options set for polling. The default options specify a timeout of 3 minutes and polling frequency of 15
   * seconds;
   */
  class DefaultPollingOptions {
    /**
     * constructor
     * @param poll The function used for polling status.
     * {@link StatusResult}
     */
    constructor(poll) {
      this.poll = poll;
      this.timeout = Duration.minutes(3);
      this.frequency = Duration.seconds(15);
    }
  }
  PollingClient.DefaultPollingOptions = DefaultPollingOptions;
})(PollingClient || (PollingClient = {}));
//# sourceMappingURL=pollingClient.js.map