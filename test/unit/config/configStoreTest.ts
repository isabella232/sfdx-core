/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { expect } from 'chai';
import { BaseConfigStore, ConfigContents } from '../../../src/config/configStore';

const specialKey = 'spe@cial.property';

type CarInfo = {
  model: string;
  make: string;
  color: string;
  cost: number;
  year: number;
  owner: {
    name: string;
    phone: string;
    creditCardNumber: string;
    originalOwner: boolean;
    [specialKey]: string;
    superPassword: string;
  };
  serialNumber: string;
};

class CarConfig extends BaseConfigStore<Record<string, unknown>, CarInfo> {
  protected static encryptedKeys = ['serialNumber', 'creditCardNumber', specialKey, /password/i];
}
class TestConfig<P extends ConfigContents> extends BaseConfigStore<BaseConfigStore.Options, P> {}

describe('ConfigStore', () => {
  it('for each value', async () => {
    const config = await TestConfig.create();
    config.set('1', 'a');
    config.set('2', 'b');

    let st = '';
    config.forEach((key, val) => {
      st += `${key}${val}`;
    });
    expect(st).to.equal('1a2b');
  });
  it('await each value', async () => {
    const config = await TestConfig.create();
    config.set('1', 'a');
    config.set('2', 'b');

    let st = '';
    await config.awaitEach(async (key, val) => {
      st += `${key}${val}`;
    });
    expect(st).to.equal('1a2b');
  });

  it('returns the object reference', async () => {
    const config = new TestConfig<{ '1': { a: string } }>();
    config.set('1', { a: 'a' });

    config.get('1').a = 'b';

    expect(config.get('1').a).to.equal('b');
    expect(config.get('1.a')).to.equal('b');
  });

  it('updates the object reference', async () => {
    const config = new TestConfig<{ '1': { a: string; b: string } }>();
    config.set('1', { a: 'a', b: 'b' });

    config.update('1', { b: 'c' });

    expect(config.get('1').a).to.equal('a');
    expect(config.get('1').b).to.equal('c');
  });

  describe('encryption', () => {
    it('throws if crypto is not initialized', () => {
      const config = new CarConfig({});
      expect(() => config.set('owner.creditCardNumber', 'n/a'))
        .to.throw()
        .property('name', 'CryptoNotInitializedError');
    });

    it('throws if value is not strings', async () => {
      const config = await CarConfig.create();
      expect(() => config.set('owner.creditCardNumber', 12))
        .to.throw()
        .property('name', 'InvalidCryptoValueError');
    });

    it('encrypts top level key', async () => {
      const expected = 'a29djf0kq3dj90d3q';
      const config = await CarConfig.create();
      config.set('serialNumber', expected);
      // encrypted
      expect(config.get('serialNumber')).to.not.equal(expected);
      // decrypted
      expect(config.get('serialNumber', true)).to.equal(expected);
    });

    it('encrypts nested key', async () => {
      const expected = 'a29djf0kq3dj90d3q';
      const config = await CarConfig.create();
      config.set('owner', {
        name: 'Bob',
        creditCardNumber: expected,
        phone: '707-bob-cell',
        originalOwner: true,
        [specialKey]: 'test',
      });
      const owner = config.get('owner');
      // encrypted
      expect(owner.creditCardNumber).to.not.equal(expected);
      // decrypted
      expect(config.get('owner', true).creditCardNumber).to.equal(expected);
    });

    it('encrypts nested key using regexp', async () => {
      const expected = 'a29djf0kq3dj90d3q';
      const config = await CarConfig.create();
      config.set('owner', {
        name: 'Bob',
        creditCardNumber: 'test',
        phone: '707-bob-cell',
        originalOwner: true,
        [specialKey]: 'test',
        superPassword: expected,
      });
      const owner = config.get('owner');
      // encrypted
      expect(owner.superPassword).to.not.equal(expected);
      // decrypted
      expect(config.get('owner', true).superPassword).to.equal(expected);
    });

    it('encrypts nested query key using dot notation', async () => {
      const expected = 'a29djf0kq3dj90d3q';
      const config = await CarConfig.create();
      config.set('owner.creditCardNumber', expected);
      // encrypted
      expect(config.get('owner.creditCardNumber')).to.not.equal(expected);
      // decrypted
      expect(config.get('owner.creditCardNumber', true)).to.equal(expected);
    });

    it('encrypts nested query key using accessor with single quotes', async () => {
      const expected = 'a29djf0kq3dj90d3q';
      const config = await CarConfig.create();
      config.set('owner["creditCardNumber"]', expected);
      // encrypted
      expect(config.get("owner['creditCardNumber']")).to.not.equal(expected);
      // decrypted
      expect(config.get("owner['creditCardNumber']", true)).to.equal(expected);
    });

    it('encrypts nested query key using accessor with double quotes', async () => {
      const expected = 'a29djf0kq3dj90d3q';
      const config = await CarConfig.create();
      config.set('owner["creditCardNumber"]', expected);
      // encrypted
      expect(config.get('owner["creditCardNumber"]')).to.not.equal(expected);
      // decrypted
      expect(config.get('owner["creditCardNumber"]', true)).to.equal(expected);
    });

    it('encrypts nested query special key using accessor with single quotes', async () => {
      const expected = 'a29djf0kq3dj90d3q';
      const config = await CarConfig.create();
      const query = `owner['${specialKey}']`;
      config.set(query, expected);
      // encrypted
      expect(config.get(query)).to.not.equal(expected);
      // decrypted
      expect(config.get(query, true)).to.equal(expected);
    });

    it('encrypts nested query special key using accessor with double quotes', async () => {
      const expected = 'a29djf0kq3dj90d3q';
      const config = await CarConfig.create();
      const query = `owner["${specialKey}"]`;
      config.set(query, expected);
      // encrypted
      expect(config.get(query)).to.not.equal(expected);
      // decrypted
      expect(config.get(query, true)).to.equal(expected);
    });

    it('decrypt returns copies', async () => {
      const expected = 'a29djf0kq3dj90d3q';
      const config = await CarConfig.create();
      const owner = { name: 'Bob', creditCardNumber: expected };
      // I would love for this to throw an error, but the current typing doesn't quite work like get does.
      config.set('owner', owner);

      const decryptedOwner = config.get('owner', true);
      // Because we retrieved an decrypted object on a config with encryption,
      // it should return a clone so it doesn't accidentally save decrypted data.
      decryptedOwner.creditCardNumber = 'invalid';
      expect(config.get('owner').creditCardNumber).to.not.equal('invalid');
      expect(config.get('owner', true).creditCardNumber).to.equal(expected);
      expect(config.get('owner.creditCardNumber', true)).to.equal(expected);
    });

    it('does not fail when saving an already encrypted object', async () => {
      const expected = 'a29djf0kq3dj90d3q';
      const config = await CarConfig.create();
      const owner = { name: 'Bob', creditCardNumber: expected };
      config.set('owner', owner);
      const encryptedCreditCardNumber = config.get('owner.creditCardNumber');
      const contents = config.getContents();
      contents.owner.name = 'Tim';
      config.setContents(contents);
      expect(config.get('owner.name')).to.equal(contents.owner.name);
      expect(config.get('owner.creditCardNumber')).to.equal(encryptedCreditCardNumber);
    });

    it('updates encrypted object', async () => {
      const expected = 'a29djf0kq3dj90d3q';
      const config = await CarConfig.create();
      const owner = { name: 'Bob', creditCardNumber: 'old credit card number' };
      config.set('owner', owner);

      config.update('owner', { creditCardNumber: expected });

      expect(config.get('owner.name')).to.equal(owner.name);
      expect(config.get('owner.creditCardNumber', true)).to.equal(expected);
    });
  });

  describe('change tracking', () => {
    it('set adds to updated', async () => {
      const config = await TestConfig.create();
      config.set('1', 'a');
      expect(config.getChangesForWrite().updated.size).to.equal(1);

      config.set('2', 'b');
      expect(config.getChangesForWrite().updated.size).to.equal(2);
      expect(config.getChangesForWrite().deleted).to.be.empty;
    });
    it('set is idempotent', async () => {
      const config = await TestConfig.create();
      config.set('1', 'a');
      expect(config.getChangesForWrite().updated.size).to.equal(1);
      expect(Array.from(config.getChangesForWrite().updated.values())).to.deep.equal(['1']);

      config.set('1', 'b');
      expect(config.getChangesForWrite().updated.size).to.equal(1);
      expect(config.getChangesForWrite().deleted).to.be.empty;
    });
    it('update nested property', async () => {
      const config = await TestConfig.create();
      config.set('1', { a: 'a' });
      config.set('1.a', 'b');
      expect(config.getChangesForWrite().updated.size).to.equal(2);
      expect(Array.from(config.getChangesForWrite().updated.values())).to.deep.equal(['1', '1.a']);

      config.set('1.a', 'c');
      expect(config.getChangesForWrite().updated.size).to.equal(2);
      expect(config.getChangesForWrite().deleted).to.be.empty;
    });
    it('delete adds to deleted and removes from updated', async () => {
      const config = await TestConfig.create();
      config.set('1', 'a');
      expect(config.getChangesForWrite().updated.size).to.equal(1);

      config.unset('1');
      expect(config.getChangesForWrite().updated.size).to.equal(0);
      expect(config.getChangesForWrite().deleted.size).to.equal(1);
    });
    it('delete is idempotent', async () => {
      const config = await TestConfig.create();
      config.set('1', 'a');
      expect(config.getChangesForWrite().updated.size).to.equal(1);

      config.unset('1');
      expect(config.getChangesForWrite().updated.size).to.equal(0);
      expect(config.getChangesForWrite().deleted.size).to.equal(1);
      config.unset('1');
      expect(config.getChangesForWrite().updated.size).to.equal(0);
      expect(config.getChangesForWrite().deleted.size).to.equal(1);
    });

    describe('tracking for setContents', () => {
      let config: TestConfig<any>;
      beforeEach(async () => {
        config = await TestConfig.create();
      });

      it('setContents from blank', () => {
        config.setContents({});
        expect(config.getChangesForWrite().updated.size).to.equal(0);
        expect(config.getChangesForWrite().deleted.size).to.equal(0);
      });

      it('setContents removing a key', () => {
        config.set('a', 1);
        config.set('b', 2);
        expect(Array.from(config.getChangesForWrite().updated.values())).to.deep.equal(['a', 'b']);

        config.setContents({ a: 1 });
        expect(Array.from(config.getChangesForWrite().updated.values())).to.deep.equal(['a']);
        expect(Array.from(config.getChangesForWrite().deleted.values())).to.deep.equal(['b']);
      });

      it('setContents removing a key by setting it to undefined', () => {
        config.set('a', 1);
        config.set('b', 2);

        config.setContents({ a: 1, b: undefined });
        expect(Array.from(config.getChangesForWrite().updated.values())).to.deep.equal(['a']);
        expect(Array.from(config.getChangesForWrite().deleted.values())).to.deep.equal(['b']);
      });

      it('setContents adding a key', () => {
        config.setContents({ a: 1 });
        expect(Array.from(config.getChangesForWrite().updated.values())).to.deep.equal(['a']);
        expect(Array.from(config.getChangesForWrite().deleted.values())).to.deep.equal([]);
      });

      it('setContents adding a key that was previously deleted', () => {
        config.set('a', 1);
        config.set('b', 2);
        config.unset('b');
        config.setContents({ a: 1, b: 3 });
        expect(Array.from(config.getChangesForWrite().deleted.values())).to.deep.equal([]);
        expect(Array.from(config.getChangesForWrite().updated.values())).to.deep.equal(['a', 'b']);
      });
    });

    it('tracking can clear', async () => {
      const config = await TestConfig.create();
      config.set('1', 'a');
      config.set('2', 'a');
      expect(config.getChangesForWrite().updated.size).to.equal(2);

      config.unset('1');
      expect(config.getChangesForWrite().updated.size).to.equal(1);
      expect(config.getChangesForWrite().deleted.size).to.equal(1);
      config.clearTracking();
      expect(config.getChangesForWrite().updated.size).to.equal(0);
      expect(config.getChangesForWrite().deleted.size).to.equal(0);
    });
  });
});
