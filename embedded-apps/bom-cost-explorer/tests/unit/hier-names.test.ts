import { describe, expect, it } from 'vitest';
import { withName } from '@/lib/client/hierNames';

describe('brand / product labels with the SAP description', () => {
  const m = new Map([['010016', 'NAVRATNA'], ['0200110012', 'Hair oil']]);
  it('description first, code in brackets', () => { expect(withName('010016', m)).toBe('NAVRATNA (010016)'); });
  it('the code alone when SAP has no description, nothing for a blank', () => { expect(withName('999', m)).toBe('999'); expect(withName('', m)).toBe(''); expect(withName('  ', m)).toBe(''); });
});
