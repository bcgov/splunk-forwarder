// dependencies
var winston = require('winston');
var bodyParser = require('body-parser');
var stringify = require('json-stringify-safe');
var app = require('express')();

// SplunkLogger
var SplunkLogger = require("./splunklogger");
var utils = require("./utils");

// configuration via environment variables
var SERVICE_IP = process.env.SERVICE_IP || 'localhost';
var SERVICE_PORT = process.env.SERVICE_PORT || 5504;
var SERVICE_AUTH_TOKEN = 'NO_TOKEN';
var USE_AUTH = (process.env.SERVICE_USE_AUTH && process.env.SERVICE_USE_AUTH == 'true');
if (USE_AUTH && process.env.SERVICE_AUTH_TOKEN && process.env.SERVICE_AUTH_TOKEN.length > 0) {
    SERVICE_AUTH_TOKEN = process.env.SERVICE_AUTH_TOKEN;
}
var FILE_LOG_LEVEL = process.env.FILE_LOG_LEVEL || 'debug';
var FILE_LOG_NAME = process.env.FILE_LOG_NAME || './msp.log';
var USE_SPLUNK = false;
var SPLUNK_URL = 'NO_SPLUNK';
if (process.env.USE_SPLUNK &&
    process.env.USE_SPLUNL == 'true' &&
    process.env.SPLUNK_URL &&
    process.env.SPLUNK_URL.length > 0) {
        USE_SPLUNK = true;
        SPLUNK_URL = process.env.SPLUNK_URL;
}

// Winston Logger init
var winstonLogger = new winston.Logger({
    level: FILE_LOG_LEVEL,
    transports: [
        new winston.transports.Console({ timestamp: true }),
        new winston.transports.File({ filename: FILE_LOG_NAME, level: FILE_LOG_LEVEL, timestamp: true })
    ]
});

// add timestamp, remove console if not in debug mode
if (FILE_LOG_LEVEL != 'debug')
    winston.remove(winston.transports.Console);

// Create a new Splunk logger
var config = {
    token: SERVICE_AUTH_TOKEN,
    level: 'info',
    url: SPLUNK_URL,
    maxRetries: 10
};
var splunkLogger = new SplunkLogger(config);
winstonLogger.error = function (err, context) {
    winstonLogger.error(`SplunkLogger error:` + err + `  context:` + context);
};
splunkLogger.requestOptions.strictSSL = true;

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
        winstonLogger.info(`MyGov Captcha Service listening at http://${host}:${port}`);
        winstonLogger.info(`File location is: ${FILE_LOG_NAME}`);
        winstonLogger.info(`File log level is: ${FILE_LOG_LEVEL}`);
    });
}

// get a log
var getLog = function (req) {
    return new Promise(function (resolve, reject) {
        var authorization = req.get('Authorization');
        winstonLogger.debug(`got auth in header: ${authorization}`);
        if (SERVICE_AUTH_TOKEN) {
            if (authorization != `Basic ${SERVICE_AUTH_TOKEN}`) {
                reject ('UNAUTHORIZED');
            }
        }
        // log to file system
        var mess = stringify (req.body);
        winstonLogger.info(`getLog: ${mess}`);
        winstonLogger.debug(`use_splunk: ${USE_SPLUNK}`);

        // forward to splunk
        if (USE_SPLUNK) {
            var payload = {
                message: {
                    log: logPayload
                },
                metadata: {
                    sourceIP: "TBD",
                    browserType: "TBD",
                    etc: "TBD"
                },
                severity: "info"
            };
            winstonLogger.debug(`sending payload`);
            splunkLogger.send(payload, function (err, resp, body) {
                winstonLogger.debug("Response from Splunk Server", body);
            });
            resolve('SUCCESS');
        }
        else {
            resolve('SUCCESS');
        }
    }, function(err) {
        winstonLogger.error(err);
    });
};
exports.getLog = getLog;

app.post('/log', function (req, res) {
    getLog(req)
        .then(function (responseBody) {
            winstonLogger.debug(`returning: ` + responseBody);
            if (responseBody == 'SUCCESS')
                res.status(200);
            else if (responseBody == 'UNAUTHORIZED')
                res.status(400);
            else
                res.status(500);
            return res.send(responseBody);
        });
});

winstonLogger.info(`Splunk Forwarder started on host:` +  SERVICE_IP + `  port: ` + SERVICE_PORT);
