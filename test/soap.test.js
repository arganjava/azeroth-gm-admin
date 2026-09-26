const test = require('node:test');
const assert = require('node:assert/strict');
const { readCommandResult } = require('../src/soap');

test('reads and decodes a SOAP command result', () => {
  const xml = '<Envelope><Body><executeCommandResponse><return>&lt;Player&gt; level changed &amp; saved</return></executeCommandResponse></Body></Envelope>';
  assert.equal(readCommandResult(xml), '<Player> level changed & saved');
});

test('reads CDATA command results', () => {
  const xml = '<Envelope><Body><return><![CDATA[Command completed]]></return></Body></Envelope>';
  assert.equal(readCommandResult(xml), 'Command completed');
});

test('surfaces SOAP faults as upstream errors', () => {
  assert.throws(
    () => readCommandResult('<Envelope><Body><Fault><faultstring>Unknown &amp; invalid command</faultstring></Fault></Body></Envelope>'),
    (error) => error.statusCode === 502 && error.message === 'Unknown & invalid command'
  );
});