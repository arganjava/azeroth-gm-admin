function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function decodeXml(value) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function readCommandResult(xml) {
  const fault = xml.match(/<(?:\w+:)?faultstring[^>]*>([\s\S]*?)<\/(?:\w+:)?faultstring>/i);
  if (fault) {
    const error = new Error(decodeXml(fault[1].replace(/<[^>]+>/g, '')).trim());
    error.statusCode = 502;
    throw error;
  }

  const result = xml.match(/<(?:\w+:)?return[^>]*>([\s\S]*?)<\/(?:\w+:)?return>/i);
  if (!result) {
    const error = new Error('respons SOAP tidak memuat hasil command');
    error.statusCode = 502;
    throw error;
  }
  const text = result[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1');
  return decodeXml(text.replace(/<[^>]+>/g, '').trim());
}

async function executeSoapCommand(command) {
  const host = process.env.SOAP_HOST || '127.0.0.1';
  const port = Number(process.env.SOAP_PORT || 7878);
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="urn:AC">
  <SOAP-ENV:Body><ns1:executeCommand><command>${escapeXml(command)}</command></ns1:executeCommand></SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  let response;
  try {
    response = await fetch(`http://${host}:${port}/`, {
      method: 'POST',
      headers: { 'content-type': 'text/xml; charset=utf-8' },
      body: envelope,
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    const soapError = new Error(`tidak dapat menghubungi SOAP AzerothCore: ${error.message}`);
    soapError.statusCode = 502;
    throw soapError;
  }

  const xml = await response.text();
  if (!response.ok) {
    const error = new Error(`SOAP HTTP ${response.status}: ${xml.slice(0, 300)}`);
    error.statusCode = 502;
    throw error;
  }
  return readCommandResult(xml);
}

module.exports = { executeSoapCommand, readCommandResult };