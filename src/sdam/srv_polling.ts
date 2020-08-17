import * as dns from 'dns';
import { Logger, LoggerOptions } from '../logger';
import { EventEmitter } from 'events';

/**
 * Determines whether a provided address matches the provided parent domain in order
 * to avoid certain attack vectors.
 *
 * @param srvAddress - The address to check against a domain
 * @param parentDomain - The domain to check the provided address against
 * @returns Whether the provided address matches the parent domain
 */
function matchesParentDomain(srvAddress: string, parentDomain: string): boolean {
  const regex = /^.*?\./;
  const srv = `.${srvAddress.replace(regex, '')}`;
  const parent = `.${parentDomain.replace(regex, '')}`;
  return srv.endsWith(parent);
}

class SrvPollingEvent {
  srvRecords: dns.SrvRecord[];
  constructor(srvRecords: dns.SrvRecord[]) {
    this.srvRecords = srvRecords;
  }

  addresses(): Set<string> {
    return new Set(this.srvRecords.map((record: dns.SrvRecord) => `${record.name}:${record.port}`));
  }
}

interface SrvPollerOptions extends LoggerOptions {
  srvHost: string;
  heartbeatFrequencyMS: number;
}

class SrvPoller extends EventEmitter {
  srvHost: string;
  rescanSrvIntervalMS: number;
  heartbeatFrequencyMS: number;
  logger: Logger;
  haMode: boolean;
  generation: number;
  _timeout?: NodeJS.Timeout;

  constructor(options: SrvPollerOptions) {
    super();

    if (!options || !options.srvHost) {
      throw new TypeError('options for SrvPoller must exist and include srvHost');
    }

    this.srvHost = options.srvHost;
    this.rescanSrvIntervalMS = 60000;
    this.heartbeatFrequencyMS = options.heartbeatFrequencyMS || 10000;
    this.logger = new Logger('srvPoller', options);

    this.haMode = false;
    this.generation = 0;

    this._timeout = undefined;
  }

  get srvAddress(): string {
    return `_mongodb._tcp.${this.srvHost}`;
  }

  get intervalMS(): number {
    return this.haMode ? this.heartbeatFrequencyMS : this.rescanSrvIntervalMS;
  }

  start(): void {
    if (!this._timeout) {
      this.schedule();
    }
  }

  stop(): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this.generation += 1;
      this._timeout = undefined;
    }
  }

  schedule(): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }

    this._timeout = setTimeout(() => this._poll(), this.intervalMS);
  }

  success(srvRecords: dns.SrvRecord[]): void {
    this.haMode = false;
    this.schedule();
    this.emit('srvRecordDiscovery', new SrvPollingEvent(srvRecords));
  }

  failure(message: string, obj?: NodeJS.ErrnoException): void {
    this.logger.warn(message, obj);
    this.haMode = true;
    this.schedule();
  }

  parentDomainMismatch(srvRecord: dns.SrvRecord): void {
    this.logger.warn(
      `parent domain mismatch on SRV record (${srvRecord.name}:${srvRecord.port})`,
      srvRecord
    );
  }

  _poll(): void {
    const generation = this.generation;
    dns.resolveSrv(this.srvAddress, (err, srvRecords) => {
      if (generation !== this.generation) {
        return;
      }

      if (err) {
        this.failure('DNS error', err);
        return;
      }

      const finalAddresses: dns.SrvRecord[] = [];
      srvRecords.forEach((record: dns.SrvRecord) => {
        if (matchesParentDomain(record.name, this.srvHost)) {
          finalAddresses.push(record);
        } else {
          this.parentDomainMismatch(record);
        }
      });

      if (!finalAddresses.length) {
        this.failure('No valid addresses found at host');
        return;
      }

      this.success(finalAddresses);
    });
  }
}

export { SrvPollingEvent, SrvPoller };
