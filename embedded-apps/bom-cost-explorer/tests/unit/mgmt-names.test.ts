import { describe, expect, it } from 'vitest';
import data from '../../src/data/mgmtNames.json';
import { mgmtBrand, mgmtProduct, mgmtSku, type MgmtData } from '../../src/lib/client/mgmtNames';

const d = data as unknown as MgmtData;
describe('management names', () => {
  it('brand by hierarchy key, and by the SAP text when the code is not a key', () => {
    expect(mgmtBrand(d, '010004')).toBe('7 Oil');
    expect(mgmtProduct(d, '0100040004')).toBeUndefined(); // Action = Check, so not used
    expect(mgmtBrand(d, 'X', '7 OIL')).toBe('7 Oil');
    expect(mgmtBrand(d, 'X', 'NO SUCH BRAND')).toBeUndefined();
  });
  it('brand by the 4 character brand code; a code used by two banners needs the SAP text', () => {
    expect(mgmtBrand(d, '0001')).toBe('BoroPlus');
    expect(mgmtBrand(d, '0004')).toBe('7 Oil');
    expect(mgmtBrand(d, '0007')).toBeUndefined();
    expect(mgmtBrand(d, '0007', 'Himani Gold Turmeric')).toBe('Himani Gold Turmeric');
  });
  it('product by key (also from a longer hierarchy code)', () => {
    expect(mgmtProduct(d, '0100010601')).toBe('Lotion');
    expect(mgmtProduct(d, '010001060100000000')).toBe('Lotion');
  });
  it('sku gives the full text; unknown codes give nothing', () => {
    expect(mgmtSku(d, '0100010032368')).toBe('BoroPlus | Body Lotion | 90ml');
    expect(mgmtSku(d, '99')).toBeUndefined();
    expect(mgmtSku(null, '0100010032368')).toBeUndefined();
  });
});
