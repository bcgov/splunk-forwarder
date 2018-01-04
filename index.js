/*=============================================
=                Dependencies                 =
=============================================*/
const winston = require('winston');
require('winston-daily-rotate-file');
const bodyParser = require('body-parser');
const stringify = require('json-stringify-safe');
const express = require('express')
const app = express();
const fs = require('fs');
const serveIndex = require('serve-index');
// SplunkLogger
const SplunkLogger = require("./splunklogger");
const utils = require("./utils");
const basicAuth = require('express-basic-auth')

/*=============================================
=      Environment Variable Configuration     =
=============================================*/
const SERVICE_IP = process.env.SERVICE_IP || 'localhost';
const SERVICE_PORT = process.env.SERVICE_PORT || 5504;
const FILE_LOG_LEVEL = process.env.FILE_LOG_LEVEL || 'debug';
const SPLUNK_URL = process.env.SPLUNK_URL || null;
const RETRY_COUNT = process.env.RETRY_COUNT || 0;
const HOST_NAME = process.env.HOSTNAME || '?'
const SERVICE_AUTH_TOKEN = process.env.SERVICE_AUTH_TOKEN || 'NO_TOKEN';
const SPLUNK_AUTH_TOKEN = process.env.SPLUNK_AUTH_TOKEN || null;
//Previously USE_AUTH checked for a string "true", now it looks for the boolean
const USE_AUTH = !!(process.env.SERVICE_USE_AUTH);

const MONITOR_USERNAME = process.env.MONITOR_USERNAME || null;
const MONITOR_PASSWORD = process.env.MONITOR_PASSWORD || null;

//Defaults to use 750mb total storage.
const MAX_FILES = process.env.MAX_FILES || 10;
const MAX_BYTE_SIZE_PER_FILE = process.env.MAX_BYTE_SIZE_PER_FILE || (1024 * 1024 * 75)

//Should not end with a /, "/var/logs" or "logs" is good.
const LOG_DIR_NAME = process.env.LOG_DIR_NAME || null;
const FILE_LOG_NAME = LOG_DIR_NAME ?
    LOG_DIR_NAME + '/msp-' + HOST_NAME + '.log'
    : './logs/msp-' + HOST_NAME + '.log';

let USE_SPLUNK = false;
if (process.env.USE_SPLUNK && process.env.USE_SPLUNK == 'true' && SPLUNK_URL) {
    USE_SPLUNK = true;
}

/*=============================================
=            APPLICATION CONFIGURATION        =
=============================================*/
// turn off self-cert check
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Daily rotate file transport for logs
var transport = new winston.transports.DailyRotateFile({
    filename: FILE_LOG_NAME,
    datePattern: 'yyyy-MM-dd-',
    prepend: true,
    level: FILE_LOG_LEVEL,
    timestamp: true,
    maxsize: MAX_BYTE_SIZE_PER_FILE,
    maxFiles: MAX_FILES,
});

// Winston Logger init
var winstonLogger = new winston.Logger({
    level: FILE_LOG_LEVEL,
    transports: [
        new winston.transports.Console({ timestamp: true }),
        transport
    ]
});

winstonLogger.error = function (err, context) {
    winstonLogger.error(`SplunkLogger error:` + err + `  context:` + context);
};

// remove console if not in debug mode
if (FILE_LOG_LEVEL != 'debug') {
    winston.remove(winston.transports.Console);
}

var splunkLogger = new SplunkLogger({
    token: SERVICE_AUTH_TOKEN,
    level: 'info',
    url: SPLUNK_URL,
    maxRetries: RETRY_COUNT,
});
splunkLogger.requestOptions.strictSSL = false;

/*=============================================
=              Main Application               =
=============================================*/
// Init app
if (process.env.NODE_ENV != 'production' ||
    process.env.CORS_ALLOW_ALL == 'true') {
    app.use(function (req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    });
}
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
var args = process.argv;

if (args.length == 3 && args[2] == 'server') {
    var server = app.listen(SERVICE_PORT, SERVICE_IP, function() {
        var host = server.address().address;
        var port = server.address().port;
        winstonLogger.info(`START log server (${HOST_NAME})-  loglevel(${FILE_LOG_LEVEL}) fileLocation(${FILE_LOG_NAME})`)
    });
}

// handle posts to /log endpoint
app.post('/log', function (req, res) {
    getLog(req).then(function (mess) {
        res.status(200);
        return res.send(mess);
    }).catch(function(mess) {
        res.status(500);
        return res.send(mess);
    });
});


//Require HTTP Basic Auth when accessing /monitor routes
const users = {};
users[MONITOR_USERNAME] = MONITOR_PASSWORD;
app.use('/monitor', basicAuth({
    users,
    challenge: true, //Show popup box asking for credentials
}))


app.use('/monitor', serveIndex(__dirname + '/' + LOG_DIR_NAME)); //Serve folder
app.use('/monitor', express.static(LOG_DIR_NAME, { //Serve files
    //Make browse display instead of download - for  weird file names eg *.log.1
    setHeaders: (res, path, stat) => {
        res.set('content-type', 'text/plain; charset=UTF-8')
    }
}));

winstonLogger.info('Splunk Forwarder started on host: ' +  SERVICE_IP + '  port: ' + SERVICE_PORT);


// get a log
var getLog = function (req) {
    return new Promise(function (resolve, reject) {
        var authorized = false;

        if (USE_AUTH && req.get('Authorization') === `Splunk ${SERVICE_AUTH_TOKEN}`) {
            authorized = true;
        };

        if (authorized) {
            // extract stuff
            var mess = stringify(req.body);
            var host = ((req.get('host') && req.get('host').length > 0) ? req.get('host') : '?');
            var logsource = ((req.get('logsource') && req.get('logsource').length > 0) ? req.get('logsource') : '?');
            var fhost = ((req.get('http_x_forwarded_host') && req.get('http_x_forwarded_host').length > 0) ? req.get('http_x_forwarded_host') : '?');
            var conf = ((req.get('confirmationNumber') && req.get('confirmationNumber').length > 0) ? req.get('confirmationNumber') : '?');
            var name = ((req.get('name') && req.get('name').length > 0) ? req.get('name') : '?');
            var severity = ((req.get('severity') && req.get('severity').length > 0) ? req.get('severity') : '?');
            var tags = ((req.get('tags') && req.get('tags').length > 0) ? req.get('tags') : '?');
            var program = ((req.get('program') && req.get('program').length > 0) ? req.get('program') : '?');
            var times = ((req.get('timestamp') && req.get('timestamp').length > 0) ? req.get('timestamp') : '?');

            // write to local filesystem
            winstonLogger.info(`pod(${HOST_NAME}) mess(${mess}) host(${host}) logsource(${logsource}) fhost(${fhost}) conf(${conf}) name(${name}) severity(${severity}) tags(${tags}) program(${program}) times(${times})`);

            // forward to splunk
            if (USE_SPLUNK) {
                var payload = {
                    message: {
                        pod: HOST_NAME,
                        log: mess,
                        host: host,
                        logsource: logsource,
                        forwardedHost: fhost,
                        confirmationNumber: conf,
                        name: name,
                        severity: severity,
                        tags: tags,
                        program: program,
                        times: times
                    },
                    // metadata: {
                    //    sourceIP: "TBD",
                    //    browserType: "TBD",
                    //    etc: "TBD"
                    //},
                    severity: "info"
                };
                winstonLogger.debug('sending payload');
                splunkLogger.send(payload, function (err, resp, body) {
                    //TODO: No need to keep logs if successfuly sent to Splunk. How to ensure only deleting OLD logs?
                    //If a log came in immediately after one that's successfuly sent to Splunk, need to make sure it isn't wiped.
                    winstonLogger.debug('Response from Splunk Server',  body);
                });
                winstonLogger.debug('sent payload');
                resolve('success');
            }
            else {
                winstonLogger.debug('no splunk');
                resolve('success');
            }
        }
        else {
            winstonLogger.info('unauthorized');
            winstonLogger.debug('received with headers: ', req.headers);
            reject('unauthorized');
        }
    }, function(err) {
        winstonLogger.info('error: ' + err);
        // reject('unauthorized');
        reject('something went wrong');
    });
};

exports.getLog = getLog;
