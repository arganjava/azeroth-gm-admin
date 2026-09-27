const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { executeSoapCommand } = require('../src/soap');

test('executes AzerothCore SOAP commands with Basic Auth', async (t) => {
  const originalEnvironment = {
    SOAP_HOST: process.env.SOAP_HOST,
    SOAP_PORT: process.env.SOAP_PORT,
    SOAP_USERNAME: process.env.SOAP_USERNAME,
    SOAP_PASSWORD: process.env.SOAP_PASSWORD
  };
  let receivedRequest;
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      receivedRequest = { authorization: request.headers.authorization, body };
      response.writeHead(200, { 'content-type': 'text/xml; charset=utf-8' });
      response.end('<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="urn:AC"><SOAP-ENV:Body><ns1:executeCommandResponse><result>World server is online</result></ns1:executeCommandResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.SOAP_HOST = '127.0.0.1';
  process.env.SOAP_PORT = String(server.address().port);
  process.env.SOAP_USERNAME = 'soap-test-admin';
  process.env.SOAP_PASSWORD = 'soap-test-password';

  const result = await executeSoapCommand('server info');
  assert.equal(result, 'World server is online');
  assert.equal(receivedRequest.authorization, `Basic ${Buffer.from('soap-test-admin:soap-test-password').toString('base64')}`);
  assert.match(receivedRequest.body, /executeCommand/);
  assert.match(receivedRequest.body, /server info/);
});