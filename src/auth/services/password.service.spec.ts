import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await service.hash('correct horse battery');
    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(service.verify('correct horse battery', hash)).resolves.toBe(true);
    await expect(service.verify('correct horse batterY', hash)).resolves.toBe(false);
  });

  it('salts every hash, so equal passwords hash differently', async () => {
    const [a, b] = await Promise.all([
      service.hash('same password'),
      service.hash('same password'),
    ]);
    expect(a).not.toEqual(b);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    await expect(service.verify('x', 'not-a-hash')).resolves.toBe(false);
    await expect(service.verify('x', 'bcrypt$1$2$3$4$5')).resolves.toBe(false);
  });

  it('asks for a rehash when the stored parameters are outdated', async () => {
    const current = await service.hash('password1234');
    expect(service.needsRehash(current)).toBe(false);
    expect(service.needsRehash(current.replace(/^scrypt\$\d+/, 'scrypt$16384'))).toBe(true);
  });

  it('dummy verification always fails', async () => {
    await expect(service.verifyDummy('anything')).resolves.toBe(false);
  });
});
