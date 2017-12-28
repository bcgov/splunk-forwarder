# MyGovBC-Splunk-Forwarder

A NodeJS based Splunk forwarder for MyGovBC-MSP user interfaces.

## Features:

1.  Receive events on a given port from a variety of MyGovBC-MSP sources.
2.  Log it locally in a rotating log structure in the Gluster PV.
3.  Forwards it to HIBC Splunk server.


## Developer Prerequisites

* Node.js 4.2.5 or later.
* Splunk Enterprise 6.3.0 or later, or Splunk Cloud.
* An HTTP Event Collector token from your Splunk Enterprise server.

First, update npm to the latest version by running:
    sudo npm install npm -g

Then run:
    npm start server

To test:
    curl -XPOST -H "Authorization: Basic XXX" -H "Content-Type: application/json" -d '{"body": "xyz"}' localhost:5504/log
       where XXX is the SERVICE_AUTH_TOKEN environment variable passed to the service.

## Configuration
All configuration is done via a user's shell environment variable and read in NodeJS via `process.env`.
These are:
  SERVICE_IP : IP address of where the service runs, defaults to 'localhost'
  SERVICE_PORT :  port for the service, defaults to 5504
  SERVICE_USE_AUTH : true or false
  SERVICE_AUTH_TOKEN :  security token passed to service and to splunk server
  FILE_LOG_LEVEL : log level for local log file, defaults to 'debug'
  FILE_LOG_NAME : name of local log file, defaults to './msp.log'
  USE_SPLUNK : true or false
  SPLUNK_URL : url of Splunk Server

## Production Setup
See [Deploy to OpenShift](openshift/README.md) docs.
