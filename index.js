// dependencies
var winston = require('winston');
var bodyParser = require('body-parser');
var app = require('express')();

// SplunkLogger
var SplunkLogger = require("./splunklogger");
var utils = require("./utils");

// configuration via environment variables
var SERVICE_IP = process.env.SERVICE_IP || '0.0.0.0';
var SERVICE_PORT = process.env.SERVICE_PORT || 5040;
var SERVICE_AUTH_TOKEN = 'NO_TOKEN';
if (process.env.SERVICE_USE_AUTH &&
    process.env.SERVICE_USE_AUTH == 'true' &&
    process.env.SERVICE_AUTH_TOKEN &&
    process.env.SERVICE_AUTH_TOKEN.length > 0) {
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
        SPLUNK_URL = process.env.SPLUNK_SERVER_URL;
}

// Winston Logger init
var winstonLogger = winston.createLogger({
    level: LOG_LEVEL,
    format: winston.format.json(),
    transport: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: FILE_LOG_NAME, level: FILE_LOG_LEVEL })
    ]
});

// add timestamp, remove console if not in debug mode
winston.add(winston.transport.File, {'timestamp': true});
if (FILE_LOG_LEVEL != 'debug')
    winston.remove(winston.transports.Console);
else
    winston.add(winston.transports.Console, {'timestamp': true});

// Create a new Splunk logger
if (USE_SPLUNK) {
    var config = {
        token: SERVICE_AUTH_TOKEN,
        url: SPLUNK_URL
    };
    var splunkLogger = new SplunkLogger(config);
    Logger.error = function (err, context) {
        winstonLogger.error(`SplunkLogger error:` + err + `  context:` + context);
    };
    splunkLogger.requestOptions.strictSSL = true;
}

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
var getLog = function (logPayload, authorization) {

    var responseBody = 'SUCCESS';
    if (SERVICE_AUTH_TOKEN) {
        if (authorization != `Basic ${SERVICE_AUTH_TOKEN}`) {
            responseBody = 'UNAUTHORIZED';
            resolve({valid: false});
            return responseBody;
        }
    }

    // log to file system
    winstonLogger.info(`getLog: ${logPayload}`);

    if (USE_SPLUNK) {
        return new Promise(function (resolve, reject) {

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
            resolve({valid: true});

        }, function (err) {
            responseBody = 'FAILURE';
            winstonLogger.error(err);
            resolve({valid: false});
        });
    }
    else {
        return responseBody;
    }
};
exports.getLog = getLog;

app.post('/log', function (req, res) {
    getLog(req.body, req.get('Authorization'))
        .then(function (body) {
            winstonLogger.debug(`returning: ` + responseBody);
            return res.send(responseBody);
        });
});

winstonLogger.info(`Splunk Forwarder started on host:` +  SERVER_IP + `  port: ` + SERVER_PORT.green.bold);
