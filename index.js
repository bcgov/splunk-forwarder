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
const RETRY_COUNT = parseInt(process.env.RETRY_COUNT, 10) || 0;
const HOST_NAME = process.env.HOSTNAME || '?'
const SERVICE_AUTH_TOKEN = process.env.SERVICE_AUTH_TOKEN || 'NO_TOKEN';
const SPLUNK_AUTH_TOKEN = process.env.SPLUNK_AUTH_TOKEN || null;
const USE_SPLUNK = checkEnvBoolean(process.env.USE_SPLUNK);
const USE_AUTH = checkEnvBoolean(process.env.SERVICE_USE_AUTH);
const ONLY_LOG_WHEN_SPLUNK_FAILS = checkEnvBoolean(process.env.ONLY_LOG_WHEN_SPLUNK_FAILS);
const MONITOR_USERNAME = process.env.MONITOR_USERNAME || '';
const MONITOR_PASSWORD = process.env.MONITOR_PASSWORD || '';

//TODO: Verify empty string doesn't break requests. Value for Splunklogger has to be string, not null.
const CA_CERT = process.env.CA_CERT || '';

//Defaults to use 750mb total storage.
const MAX_FILES = parseInt(process.env.MAX_FILES, 10) || 10;
const MAX_BYTE_SIZE_PER_FILE = parseInt(process.env.MAX_BYTE_SIZE_PER_FILE, 10) || (1024 * 1024 * 75)

//Should not end with a /, "/var/logs" or "logs" is good.
const LOG_DIR_NAME = process.env.LOG_DIR_NAME || null;
const FILE_LOG_NAME = LOG_DIR_NAME ?
    LOG_DIR_NAME + '/msp-' + HOST_NAME + '.log'
    : './logs/msp-' + HOST_NAME + '.log';


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
    cacert: CA_CERT,
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

// debugging /monitor
winstonLogger.debug('MONITOR_USERNAME=' + MONITOR_USERNAME + '  MONITOR_PASSWORD=' + MONITOR_PASSWORD + '  test=' + (MONITOR_USERNAME && MONITOR_PASSWORD));

//Setup the password protected /monitor route only if user/password is set.

if (MONITOR_USERNAME.length && MONITOR_PASSWORD.length){
    winstonLogger.info ('Configuring /monitor for ' + LOG_DIR_NAME);
    const users = {};
    users[MONITOR_USERNAME] = MONITOR_PASSWORD;
    app.use('/monitor', basicAuth({
        users,
        challenge: true, //Show popup box asking for credentials
    }))

    app.use('/monitor', serveIndex(__dirname + '/' + LOG_DIR_NAME));
    app.use('/monitor', express.static(LOG_DIR_NAME, {
        //Get browser to display instead of download weird filenames, *.log.1
        setHeaders: (res, path, stat) => {
            winstonLogger.debug('Getting monitored files for ' + LOG_DIR_NAME);
            res.set('content-type', 'text/plain; charset=UTF-8')
        }
    }));
}

winstonLogger.info('Splunk Forwarder started on host: ' +  SERVICE_IP + '  port: ' + SERVICE_PORT);


// get a log
var getLog = function (req) {
    return new Promise(function (resolve, reject) {
        var authorized = false;

        if (USE_AUTH && req.get('Authorization') === `Splunk ${SERVICE_AUTH_TOKEN}`) {
            authorized = true;
        };

        if (authorized || !USE_AUTH) {
            // extract stuff
            const mess = stringify(req.body);
            const host = req.get('host') || '?'
            const logsource = req.get('logsource') || '?'
            const fhost = req.get('http_x_forwarded_host') || '?'
            const conf = req.get('confirmationNumber') || '?'
            const name = req.get('name') || '?'
            const tags = req.get('tags') || '?'
            const program = req.get('program') || '?'
            const times = req.get('timestamp') || '?'
            const http_host = req.get('http_host') || '?';
            const method = req.get('request_method') || '?';
            const forwarded = req.get('http_x_forwarded_for') || '?';

            //todo: Verify! Screenshots showed severity_label.
            const severity = req.get('severity') || '?' //orig
            const severityLabel = req.get('severity_label') || '?' //from screenshot

            const logString = `pod(${HOST_NAME}) mess(${mess}) host(${host}) logsource(${logsource}) fhost(${fhost}) conf(${conf}) name(${name}) severity(${severity}) tags(${tags}) program(${program}) times(${times}), http_host(${http_host} method(${method}) http_x_forwarded_for(${forwarded}) )`;

            // write to local filesystem
            if (!ONLY_LOG_WHEN_SPLUNK_FAILS && USE_SPLUNK){
                winstonLogger.info(logString);
            }

            if (!USE_SPLUNK){
                winstonLogger.info(logString);
                return resolve('success');
            }
            else { // forward to splunk
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
                        times: times,
                        http_host,
                        method,
                        forwarded,
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

                    //TODO: Once sending to Splunk is setup, double check if err
                    //is falsy on success or if we have to modify the check
                    if (ONLY_LOG_WHEN_SPLUNK_FAILS && err){
                        winstonLogger.info(logString);
                    }

                    winstonLogger.debug('Response from Splunk Server',  body);
                });
                winstonLogger.debug('sent payload');
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


function checkEnvBoolean(env){
    return env && env.toLowerCase() === 'true';
}