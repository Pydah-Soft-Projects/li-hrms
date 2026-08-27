const mongoose = require('mongoose');
const { toRefId, toRefIdString } = require('../refId');

const HEX = '697f56929644dbc8eeee5865';

describe('toRefId', () => {
  test('returns ObjectId from hex string', () => {
    const id = toRefId(HEX);
    expect(id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(String(id)).toBe(HEX);
  });

  test('returns ObjectId instance as-is', () => {
    const oid = new mongoose.Types.ObjectId(HEX);
    expect(String(toRefId(oid))).toBe(HEX);
  });

  test('extracts _id from a populated document-like object', () => {
    const populated = {
      _id: new mongoose.Types.ObjectId(HEX),
      name: 'UNIT-2',
      code: 'UNIT-2',
      shifts: [{ shiftId: new mongoose.Types.ObjectId('6a26b57c96af78982e666bf6'), gender: 'All' }],
    };
    expect(toRefIdString(populated)).toBe(HEX);
    expect(toRefIdString(populated)).not.toContain('UNIT-2');
  });

  test('does not treat Document#toString inspect dump as the id', () => {
    const inspectDump =
      "{\n  _id: new ObjectId('" +
      HEX +
      "'),\n  name: 'UNIT-2',\n  code: 'UNIT-2',\n  shifts: [\n    {\n      shiftId: new ObjectId('6a26b57c96af78982e666bf6'),\n      gender: 'All'\n    }\n  ]\n}";
    expect(toRefIdString(inspectDump)).toBe(HEX);
  });

  test('returns null for empty / all / garbage', () => {
    expect(toRefId(null)).toBeNull();
    expect(toRefId('')).toBeNull();
    expect(toRefId('all')).toBeNull();
    expect(toRefId('not-an-id')).toBeNull();
  });
});
