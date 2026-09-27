const soap = require('soap');

const SOAP_WSDL = `<?xml version="1.0" encoding="UTF-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:tns="urn:AC" targetNamespace="urn:AC">
  <wsdl:types>
    <xsd:schema targetNamespace="urn:AC" elementFormDefault="unqualified">
      <xsd:element name="executeCommand"><xsd:complexType><xsd:sequence><xsd:element name="command" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element>
      <xsd:element name="executeCommandResponse"><xsd:complexType><xsd:sequence><xsd:element name="result" type="xsd:string" minOccurs="0"/></xsd:sequence></xsd:complexType></xsd:element>
    </xsd:schema>
  </wsdl:types>
  <wsdl:message name="executeCommandRequest"><wsdl:part name="parameters" element="tns:executeCommand"/></wsdl:message>
  <wsdl:message name="executeCommandResponse"><wsdl:part name="parameters" element="tns:executeCommandResponse"/></wsdl:message>
  <wsdl:portType name="ACSoapPortType"><wsdl:operation name="executeCommand"><wsdl:input message="tns:executeCommandRequest"/><wsdl:output message="tns:executeCommandResponse"/></wsdl:operation></wsdl:portType>
  <wsdl:binding name="ACSoapBinding" type="tns:ACSoapPortType"><soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/><wsdl:operation name="executeCommand"><soap:operation soapAction="urn:AC#executeCommand"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation></wsdl:binding>
  <wsdl:service name="ACSoapService"><wsdl:port name="ACSoapPort" binding="tns:ACSoapBinding"><soap:address location="http://127.0.0.1:7878/"/></wsdl:port></wsdl:service>
</wsdl:definitions>`;

function soapError(message, statusCode = 502) {
    console.error(`SOAP error: ${message} (status code: ${statusCode})`);
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function executeSoapCommand(command) {
  const host = process.env.SOAP_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.SOAP_PORT || 7878);
  const username = process.env.SOAP_USERNAME;
  const password = process.env.SOAP_PASSWORD;

  if (!username || !password) {
    throw soapError('SOAP_USERNAME dan SOAP_PASSWORD harus diisi dengan akun AzerothCore GM level 3', 503);
  }

  const endpoint = `http://${host}:${port}/`;
  try {
    const client = await soap.createClientAsync(SOAP_WSDL, { endpoint, timeout: 10000 });
    client.setEndpoint(endpoint);
    client.setSecurity(new soap.BasicAuthSecurity(username, password));
    const [response] = await client.executeCommandAsync({ command });
    return typeof response?.result === 'string' ? response.result : '';
  } catch (cause) {
    const responseStatus = cause.response?.statusCode || cause.response?.status;
    if (responseStatus === 401) {
      throw soapError('SOAP menolak login; periksa SOAP_USERNAME dan SOAP_PASSWORD');
    }
    if (responseStatus === 403) {
      throw soapError('Akun SOAP harus memiliki GM level 3 pada realm ini');
    }
    const detail = cause.message || 'unknown SOAP error';
    if (/ECONNREFUSED/.test(detail)) {
      throw soapError(`Koneksi ke ${endpoint} ditolak. Pastikan worldserver berjalan dengan SOAP.Enabled = 1, SOAP.IP bind ke interface yang dapat dijangkau API, dan firewall mengizinkan port ${port} dari host API.`);
    }
    throw soapError(`SOAP AzerothCore ${host}:${port} gagal: ${detail}`);
  }
}

module.exports = { executeSoapCommand };