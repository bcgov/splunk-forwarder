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

 * curl -XPOST -H "Authorization: Splunk XXX" -H "Content-Type: application/json" -d '{"body": "xyz"}' localhost:5504/log

 where XXX is the SERVICE_AUTH_TOKEN environment variable passed to the service.


## Configuration

All configuration is done via a user's shell environment variable and read in NodeJS via `process.env`.

These are:

| Environment Variable  | Description |
| --------------------- | ------------- |
| SERVICE_IP (string)           | IP address of where the service runs, defaults to 'localhost'  |
| SERVICE_PORT (number)         | port for the service, Default: 5504  |
| HOSTNAME  (string)            | the name of the host or the pod
| SERVICE_USE_AUTH  (boolean)   | true or false
| SERVICE_AUTH_TOKEN   (string) | security token passed to service and to splunk server
| FILE_LOG_LEVEL  (string)      | log level for local log file, defaults to 'debug'
| FILE_LOG_NAME  (string)       | name of local log file, defaults to './msp.log'
| LOG_DIR_NAME  (string)        | Directory path to store local log files
| USE_SPLUNK  (boolean)         | use splunk or just log locally
| SPLUNK_URL  (string)          | url of Splunk Server
| RETRY_COUNT  (number)         | the number of times to retry the Splunk Server
| ONLY_LOG_WHEN_SPLUNK_FAILS (boolean) |only write to local file system when there's an error sending to Splunk. Ignored if USE_SPLUNK is false
| MONITOR_USERNAME  (string)    | username for the /monitor route to view logs. Optional, but necessary for the route.
| MONITOR_PASSWORD  (string)    | password for the /monitor route to view logs. Optional, but necessary for the route.
| CA_CERT  (string)             | A string of the CA cert to use with SplunkLogger
| MAX_FILES  (number)           | total number of log files to rotate over. Default: 10.
| MAX_BYTE_SIZE_PER_FILE  (number) | total number of each log file. Default: (1024 * 1024 * 75) = 75mb.
| APPEND_POD_NAME_TO_FILE (boolean) | Whether the pod name (hostname) should be appended to the local log file name |


The max storage size used for the entire splunk-forwarder will be `MAX_FILES * MAX_BYTES_PER_FILE`. It's default storage size is 750mb.

The `MONITOR_` variables are optional, but in order to view logs from a web interface, both the variables must be defined.


## Production Setup

See [Deploy to OpenShift](openshift/README.md) docs.
