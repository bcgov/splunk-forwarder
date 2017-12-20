# MyGovBC-Splunk-Forwarder

A NodeJS based Splunk forwarder for MyGovBC-MSP user interfaces.

## Features:

1.  Receive events on a given port from a variety of MyGovBC-MSP sources.
2.  Log it locally in a rotating log structure in the Gluster PV.
3.  Forwards it to HIBC Splunk server.


## Developer Prerequisites

* Node.js v0.10 or later.
* Splunk Enterprise 6.3.0 or later, or Splunk Cloud.
* An HTTP Event Collector token from your Splunk Enterprise server.

First, update npm to the latest version by running:
    sudo npm install npm -g

Then run:
    npm install --save splunk-logging


## Configuration
All configuration is done via a user's shell environment variable and read in NodeJS via `process.env`

## Production Setup
See [Deploy to OpenShift](openshift/README.md) docs.
